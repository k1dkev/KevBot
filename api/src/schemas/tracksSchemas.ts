import { z } from "zod";
import { trackNameValidationFactory } from "./sharedSchemas";
import { Config } from "../config/config";

export type GetTracksQuerySchema = {
  include_deleted: boolean;
  limit: number;
  offset: number;
  user_id?: number;
  playlist_id?: number;
};

export function tracksSchemasFactory(config: Config) {
  const trackNameValidation = trackNameValidationFactory(config);

  const getTracksQuerySchema = z
    .object({
      include_deleted: z.coerce.boolean().default(false),
      limit: z.coerce.number().int().min(1).max(config.maxResultsPerPage).default(20),
      offset: z.coerce.number().int().min(0).default(0),
      user_id: z.coerce.number().int().min(1).optional(),
      playlist_id: z.coerce.number().int().min(1).optional(),
    })
    .strict() satisfies z.ZodType<GetTracksQuerySchema, any, any>;

  const patchTrackBodySchema = z
    .object({
      name: trackNameValidation,
    })
    .strict();

  const postTrackBodySchema = z
    .object({
      name: trackNameValidation,
    })
    .strict();

  const restoreTrackBodySchema = z.object({
    name: trackNameValidation.optional(),
  });

  return {
    getTracksQuerySchema,
    patchTrackBodySchema,
    postTrackBodySchema,
    restoreTrackBodySchema,
  };
}
