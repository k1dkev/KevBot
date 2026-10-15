import { z } from "zod";

export function usersSchemasFactory() {
  const getUsersQuerySchema = z
    .object({
      discord_id: z.string().optional(),
      discord_username: z.string().optional(),
    })
    .strict();

  const patchUserBodySchema = z
    .object({
      discord_username: z.string().nullable().optional(),
      discord_avatar_hash: z.string().nullable().optional(),
    })
    .strict();

  const putGreetingBodySchema = z
    .object({
      greeting_track_id: z.number().int().nullable(),
      greeting_playlist_id: z.number().int().nullable(),
    })
    .refine(
      (data) => {
        const bothAreNumbers =
          typeof data.greeting_track_id === "number" && typeof data.greeting_playlist_id === "number";
        return !bothAreNumbers;
      },
      {
        message: "Only one greeting id entity can be provided, the other(s) must be null.",
      },
    );

  const putFarewellBodySchema = z
    .object({
      farewell_track_id: z.number().int().nullable(),
      farewell_playlist_id: z.number().int().nullable(),
    })
    .refine(
      (data) => {
        const bothAreNumbers =
          typeof data.farewell_track_id === "number" && typeof data.farewell_playlist_id === "number";
        return !bothAreNumbers;
      },
      {
        message: "Only one farewell id entity can be provided, the other(s) must be null.",
      },
    );

  return {
    getUsersQuerySchema,
    patchUserBodySchema,
    putGreetingBodySchema,
    putFarewellBodySchema,
  };
}
