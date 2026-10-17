import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClientError } from "../dist/api-client.js";
import { commandRegistry } from "../dist/commands.js";
import { AttachmentError, downloadDiscordAttachment, uploadTrack } from "../dist/upload-commands.js";
import { actorId } from "./helpers.mjs";

const uploadArgs = (tokens = []) => commandRegistry.get("upload").validate(tokens);
const attachment = (name = "sample.mp3", url = "https://cdn.discordapp.com/attachments/1/sample", size = 3) => ({
  name,
  url,
  size,
});
const playlist = (id, name) => ({ id, name, deleted_at: null });
const track = { id: 19, name: "sample", duration: 2.75 };

function context({ tokens = [], attachments = [], request = async () => undefined } = {}) {
  return {
    args: uploadArgs(tokens),
    authorDiscordId: actorId,
    attachments,
    api: { request },
  };
}

test("upload validates the first MP3 attachment, its name, and size before API or network access", async () => {
  let apiCalls = 0;
  let downloads = 0;
  const request = async () => {
    apiCalls++;
    return [];
  };
  const fetcher = async () => {
    downloads++;
    return new Response("audio");
  };

  assert.equal(await uploadTrack(context({ request }), fetcher), "Attach an MP3 file to upload.");
  for (const [file, expected] of [
    [attachment("sample.wav"), /Attach an MP3/],
    [attachment("Invalid Name.mp3"), /Attach an MP3/],
    [attachment("sample.mp3", undefined, 0), /empty or invalid/],
    [attachment("sample.mp3", undefined, 3_000_001), /3 MB upload limit/],
  ]) {
    assert.match(await uploadTrack(context({ attachments: [file], request }), fetcher), expected);
  }
  assert.equal(apiCalls, 0);
  assert.equal(downloads, 0);
});

test("unknown playlists cancel before downloading or creating a track", async () => {
  const calls = [];
  let downloads = 0;
  const response = await uploadTrack(
    context({
      tokens: ["missing"],
      attachments: [attachment()],
      request: async (_actor, path, options) => {
        calls.push({ path, options });
        return [];
      },
    }),
    async () => {
      downloads++;
      return new Response("audio");
    },
  );
  assert.equal(response, "Upload canceled. Playlist not found: missing.");
  assert.deepEqual(
    calls.map(({ path }) => path),
    ["/v1/playlists"],
  );
  assert.equal(downloads, 0);
});

test("uploads the first attachment as multipart and adds the new track to unique playlists", async () => {
  const bytes = Uint8Array.from([0, 1, 2, 127, 255]);
  const calls = [];
  const files = [
    attachment("sample.mp3", "https://cdn.discordapp.com/attachments/1/first", bytes.length),
    attachment("ignored.mp3"),
  ];
  const response = await uploadTrack(
    context({
      tokens: ["favorites", "favorites"],
      attachments: files,
      request: async (actor, path, options) => {
        calls.push({ actor, path, options });
        if (path === "/v1/playlists") return [playlist(7, "favorites")];
        if (path === "/v1/tracks") return track;
        if (path === "/v1/playlists/7/tracks") return { playlist_id: 7, added_track_ids: [track.id] };
        throw new Error(`Unexpected route ${path}`);
      },
    }),
    async (url, init) => {
      assert.equal(url, files[0].url);
      assert.equal(init.redirect, "error");
      assert.ok(init.signal);
      return new Response(bytes, { headers: { "content-length": String(bytes.length) } });
    },
  );

  assert.equal(response, "Uploaded clip 'sample' (2.75s).\nAdded to playlists: favorites.");
  assert.deepEqual(
    calls.map(({ path }) => path),
    ["/v1/playlists", "/v1/tracks", "/v1/playlists/7/tracks"],
  );
  assert.ok(calls.every(({ actor }) => actor === actorId));
  const upload = calls[1].options;
  assert.equal(upload.method, "POST");
  assert.ok(upload.formData instanceof FormData);
  assert.equal(upload.formData.get("name"), "sample");
  const file = upload.formData.get("file");
  assert.equal(file.name, "sample.mp3");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  assert.deepEqual(calls[2].options.json, { track_ids: [track.id] });
});

test("a playlist membership failure is reported without claiming the upload was rolled back", async () => {
  const response = await uploadTrack(
    context({
      tokens: ["favorites"],
      attachments: [attachment()],
      request: async (_actor, path) => {
        if (path === "/v1/playlists") return [playlist(7, "favorites")];
        if (path === "/v1/tracks") return track;
        throw new ApiClientError("denied", 403);
      },
    }),
    async () => new Response(Uint8Array.from([1, 2, 3])),
  );
  assert.match(response, /Uploaded clip 'sample'/);
  assert.match(response, /Upload succeeded, but 'favorites' was not updated/);
  assert.match(response, /API denied this operation/);
  assert.doesNotMatch(response, /category/i);
});

test("Discord attachment download rejects non-CDN URLs, redirects, and streamed size overruns", async () => {
  let fetches = 0;
  await assert.rejects(
    downloadDiscordAttachment(attachment("sample.mp3", "https://evil.example/audio"), async () => {
      fetches++;
      return new Response("audio");
    }),
    (error) => error instanceof AttachmentError && error.reason === "invalid",
  );
  await assert.rejects(
    downloadDiscordAttachment(attachment("sample.mp3", "https://cdn.discordapp.com:8443/audio"), async () => {
      fetches++;
      return new Response("audio");
    }),
    (error) => error instanceof AttachmentError && error.reason === "invalid",
  );
  assert.equal(fetches, 0);

  await assert.rejects(
    downloadDiscordAttachment(
      attachment(),
      async () => new Response("", { status: 302, headers: { Location: "https://evil.example" } }),
    ),
    (error) => error instanceof AttachmentError && error.reason === "download_failed",
  );

  await assert.rejects(
    downloadDiscordAttachment(attachment("sample.mp3", undefined, 3), async () => new Response(new Uint8Array(4)), 3),
    (error) => error instanceof AttachmentError && error.reason === "too_large",
  );
});

test("API duplicate, invalid-audio, and upload-size responses give safe actionable feedback", async (t) => {
  for (const [status, expected] of [
    [409, /already exists/],
    [400, /valid MP3 shorter than 15 seconds/],
    [413, /API upload limit/],
  ]) {
    await t.test(String(status), async () => {
      const response = await uploadTrack(
        context({
          attachments: [attachment()],
          request: async () => {
            throw new ApiClientError("invalid", status);
          },
        }),
        async () => new Response(Uint8Array.from([1, 2, 3])),
      );
      assert.match(response, expected);
      assert.doesNotMatch(response, /remote|secret|token/i);
    });
  }
});
