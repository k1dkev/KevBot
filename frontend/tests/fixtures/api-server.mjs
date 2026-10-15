// Deterministic frontend contract fixture; no production DB, credentials or Discord calls.
import http from "node:http";

const date = "2026-01-01T00:00:00.000Z";
const user = {
  id: 1,
  discord_id: "123456789012345678",
  discord_username: "smokeuser",
  discord_avatar_hash: null,
  created_at: date,
  updated_at: date,
};
const playlist = { id: 10, name: "favorites", user_id: 1, created_at: date, updated_at: date, deleted_at: null };
const token = `e30.${Buffer.from(JSON.stringify({ sub: "1", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
const track = (index, prefix = "clip") => ({
  id: index,
  name: `${prefix}${String(index).padStart(3, "0")}`,
  duration: 8,
  user_id: 1,
  user_display_name: "smokeuser",
  created_at: date,
  updated_at: date,
  deleted_at: null,
  total_play_count: index,
  raw_total_play_count: index,
});
const page = (data, limit, offset, total, unified = false) => ({
  data,
  pagination: {
    total,
    limit,
    offset,
    ...(unified
      ? { has_next: offset + data.length < total, has_prev: offset > 0 }
      : { hasNext: offset + data.length < total, hasPrev: offset > 0 }),
  },
});
const audio = Buffer.alloc(44 + 8000 * 8 * 2);
audio.write("RIFF", 0);
audio.writeUInt32LE(audio.length - 8, 4);
audio.write("WAVEfmt ", 8);
audio.writeUInt32LE(16, 16);
audio.writeUInt16LE(1, 20);
audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(8000, 24);
audio.writeUInt32LE(16000, 28);
audio.writeUInt16LE(2, 32);
audio.writeUInt16LE(16, 34);
audio.write("data", 36);
audio.writeUInt32LE(audio.length - 44, 40);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4301");
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:4300");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Range");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  const json = (data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/health") return json({ ok: true });
  if (url.pathname === "/v1/auth/refresh" || url.pathname === "/v1/auth/discord-exchange")
    return json({ access_token: token, expires_in: 3600, token_type: "Bearer", user: { id: 1 } });
  if (url.pathname === "/v1/auth/me") return json({ user, role: "user", session_id: "fixture" });
  if (url.pathname === "/v1/auth/logout") {
    res.writeHead(204);
    return res.end();
  }
  if (/^\/v1\/tracks\/\d+\/stream$/.test(url.pathname)) {
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1;
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Accept-Ranges", "bytes");
    if (range) {
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${audio.length}`);
    }
    res.setHeader("Content-Length", end - start + 1);
    return res.end(audio.subarray(start, end + 1));
  }
  if (url.pathname === "/v1/search") {
    const type = url.searchParams.get("type") || "tracks";
    const query = url.searchParams.get("q") || "clip";
    const limit = Number(url.searchParams.get("limit") || 20),
      offset = Number(url.searchParams.get("offset") || 0);
    const count = query === "alpha" ? 60 : 3;
    const data =
      type === "playlists"
        ? [{ ...playlist, type: "playlist", user: { id: 1, display_name: "smokeuser" }, track_count: 3, relevance: 1 }]
        : type === "users"
          ? [{ id: 1, name: "smokeuser", type: "user", created_at: date, deleted_at: null, relevance: 1 }]
          : Array.from({ length: count }, (_, i) => ({
              ...track(i + 1, query),
              type: "track",
              relevance: 1,
              user: { id: 1, display_name: "smokeuser" },
            }));
    return json(page(data.slice(offset, offset + limit), limit, offset, data.length, true));
  }
  if (url.pathname === "/v1/tracks") {
    const limit = Number(url.searchParams.get("limit") || 20),
      offset = Number(url.searchParams.get("offset") || 0);
    const tracks = [track(1), track(2), track(3)];
    return json(page(tracks.slice(offset, offset + limit), limit, offset, tracks.length));
  }
  if (/^\/v1\/tracks\/\d+$/.test(url.pathname)) return json(track(Number(url.pathname.split("/").pop())));
  if (url.pathname === "/v1/playlists") return json([playlist]);
  if (url.pathname === "/v1/playlists/10") return json(playlist);
  if (url.pathname === "/v1/users/1") return json(user);
  if (/^\/v1\/users\/1\/(greeting|farewell)$/.test(url.pathname)) {
    const kind = url.pathname.split("/").pop();
    return json({ [`${kind}_track_id`]: null, [`${kind}_playlist_id`]: null });
  }
  return json({ error: "Fixture resource not found" }, 404);
});
server.listen(4301, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close());
