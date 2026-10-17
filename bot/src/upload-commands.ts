import { z } from "zod";
import { ApiClientError, apiUserMessage, type BotApiClient } from "./api-client.js";
import type { ParsedArgs } from "./commands.js";
import type { CommandAttachment } from "./replies.js";

const MAX_UPLOAD_BYTES = 3_000_000;
const trackSchema = z.object({ id: z.number().int().positive(), name: z.string(), duration: z.number() }).passthrough();
const playlistSchema = z
  .object({ id: z.number().int().positive(), name: z.string(), deleted_at: z.string().nullable() })
  .passthrough();
const addTracksSchema = z
  .object({ playlist_id: z.number().int().positive(), added_track_ids: z.array(z.number().int()) })
  .passthrough();

type UploadContext = {
  args: ParsedArgs;
  authorDiscordId: string;
  attachments?: readonly CommandAttachment[];
  api: BotApiClient;
};
type AttachmentFailure = "invalid" | "too_large" | "download_failed";

export class AttachmentError extends Error {
  constructor(readonly reason: AttachmentFailure) {
    super(`Discord attachment rejected: ${reason}`);
  }
}

function discordCdnUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AttachmentError("invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "cdn.discordapp.com" ||
    (url.port !== "" && url.port !== "443") ||
    url.username ||
    url.password
  )
    throw new AttachmentError("invalid");
  return url.href;
}

export async function downloadDiscordAttachment(
  attachment: CommandAttachment,
  fetcher: typeof fetch = fetch,
  maxBytes = MAX_UPLOAD_BYTES,
  timeoutMs = 5000,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(attachment.size) || attachment.size <= 0) throw new AttachmentError("invalid");
  if (attachment.size > maxBytes) throw new AttachmentError("too_large");
  const url = discordCdnUrl(attachment.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetcher(url, { redirect: "error", signal: controller.signal });
    if (!response.ok || !response.body) throw new AttachmentError("download_failed");
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new AttachmentError("too_large");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new AttachmentError("too_large");
      chunks.push(next.value);
    }
    if (total === 0) throw new AttachmentError("invalid");
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (error instanceof AttachmentError) throw error;
    throw new AttachmentError("download_failed");
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) {
      void reader.cancel().catch(() => {});
      try {
        reader.releaseLock();
      } catch {
        /* The aborted read may still be settling. */
      }
    }
  }
}

async function findPlaylist(api: BotApiClient, actor: string, name: string) {
  const playlists = await api.request(actor, "/v1/playlists", {
    query: { name },
    schema: z.array(playlistSchema),
  });
  return playlists.find((playlist) => playlist.name === name && playlist.deleted_at === null);
}

async function mapLimited<T, R>(values: T[], concurrency: number, run: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await run(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function attachmentName(attachment: CommandAttachment | undefined): string {
  if (!attachment?.name || !attachment.name.toLowerCase().endsWith(".mp3")) throw new AttachmentError("invalid");
  const name = attachment.name.slice(0, -4);
  if (!/^[a-z0-9]{1,15}$/.test(name)) throw new AttachmentError("invalid");
  return name;
}

function attachmentMessage(error: AttachmentError): string {
  switch (error.reason) {
    case "too_large":
      return "The first attachment exceeds the 3 MB upload limit.";
    case "download_failed":
      return "The attachment could not be downloaded from Discord. Try again later.";
    default:
      return "Attach an MP3 named with 1–15 lowercase letters or digits.";
  }
}

function playlistFailure(error: unknown) {
  return error instanceof ApiClientError ? apiUserMessage(error) : "The playlist update failed.";
}

export async function uploadTrack(context: UploadContext, fetcher: typeof fetch = fetch): Promise<string> {
  const attachment = context.attachments?.[0];
  if (!attachment) return "Attach an MP3 file to upload.";

  let name: string;
  try {
    name = attachmentName(attachment);
  } catch (error) {
    if (error instanceof AttachmentError) return attachmentMessage(error);
    throw error;
  }
  if (!Number.isSafeInteger(attachment.size) || attachment.size <= 0)
    return "The first attachment is empty or invalid.";
  if (attachment.size > MAX_UPLOAD_BYTES) return attachmentMessage(new AttachmentError("too_large"));

  const playlistNames = [...new Set(context.args.tokens)];
  const playlists = await mapLimited(playlistNames, 6, async (playlistName) => ({
    name: playlistName,
    playlist: await findPlaylist(context.api, context.authorDiscordId, playlistName),
  }));
  const missing = playlists.filter((item) => !item.playlist).map((item) => item.name);
  if (missing.length) return `Upload canceled. Playlist not found: ${missing.join(", ")}.`;

  let bytes: Uint8Array;
  try {
    bytes = await downloadDiscordAttachment(attachment, fetcher);
  } catch (error) {
    if (error instanceof AttachmentError) return attachmentMessage(error);
    throw error;
  }

  const formData = new FormData();
  formData.set("name", name);
  formData.set("file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), `${name}.mp3`);
  let track: z.infer<typeof trackSchema>;
  try {
    track = await context.api.request(context.authorDiscordId, "/v1/tracks", {
      method: "POST",
      formData,
      schema: trackSchema,
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 409) return `A clip named '${name}' already exists.`;
    if (error instanceof ApiClientError && error.status === 400)
      return `The API rejected '${name}'. Upload a valid MP3 shorter than 15 seconds.`;
    if (error instanceof ApiClientError && error.status === 413)
      return "The first attachment exceeds the API upload limit.";
    throw error;
  }

  const results = await mapLimited(playlists, 6, async ({ name: playlistName, playlist }) => {
    try {
      const result = await context.api.request(context.authorDiscordId, `/v1/playlists/${playlist!.id}/tracks`, {
        method: "POST",
        json: { track_ids: [track.id] },
        schema: addTracksSchema,
      });
      return {
        name: playlistName,
        status: result.added_track_ids.includes(track.id) ? "added" : "already present",
      };
    } catch (error) {
      return { name: playlistName, status: playlistFailure(error) };
    }
  });

  const lines = [`Uploaded clip '${track.name}' (${track.duration.toFixed(2)}s).`];
  const added = results.filter((item) => item.status === "added").map((item) => item.name);
  if (added.length) lines.push(`Added to playlists: ${added.join(", ")}.`);
  for (const result of results.filter((item) => item.status !== "added"))
    lines.push(`Upload succeeded, but '${result.name}' was not updated: ${result.status}`);
  return lines.join("\n");
}
