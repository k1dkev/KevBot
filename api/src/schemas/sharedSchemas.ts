import { z } from "zod";
import { Config } from "../config/config";

function nameValidationFactory(resourceName: string, maxNameLength: number, regex: RegExp, invalidMessage: string) {
  return z
    .string()
    .regex(regex, { message: invalidMessage })
    .max(maxNameLength, {
      message: `${resourceName} must be ${maxNameLength} characters or fewer.`,
    });
}

export const trackNameValidationFactory = (config: Config) =>
  nameValidationFactory(
    "Track name",
    config.maxTrackNameLength,
    /^[a-z\d]+$/g,
    "Track name must contain only lower-case letters and numbers.",
  );

export const playlistNameValidationFactory = (config: Config) =>
  nameValidationFactory(
    "Playlist name",
    config.maxPlaylistNameLength,
    /^[a-z\d]+$/g,
    "Playlist name must contain only lower-case letters and numbers.",
  );

export const i32IdSchema = z.object({
  id: z.coerce.number().int().min(0).max(2_147_483_647),
});
