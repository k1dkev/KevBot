import * as Boom from "@hapi/boom";

export const RESERVED_POOL_NAMES = new Set([
  "categories",
  "cats",
  "emptycats",
  "all",
  "mostplayed",
  "myuploads",
  "playhistory",
  "uploadhistory",
]);

export function assertMutablePlaylistName(name: string) {
  if (RESERVED_POOL_NAMES.has(name.toLowerCase())) {
    throw Boom.badRequest("Reserved virtual pools cannot be created or modified as playlists");
  }
}
