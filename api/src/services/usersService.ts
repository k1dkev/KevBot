import * as Boom from "@hapi/boom";
import { PostUserOptions, PatchUserOptions, PublicUser } from "../db/schema";
import { KevbotDb } from "../db/connection";
import { TracksService } from "./tracksService";
import { PlaylistsService } from "./playlistsService";
import { Config } from "../config/config";
import { AuthorizationRole, AuthorizationService } from "../authorization/roles";
import { getLogger } from "../logging/context";

const PUBLIC_USER_FIELDS = [
  "users.id",
  "users.discord_id",
  "users.discord_username",
  "users.discord_avatar_hash",
  "users.created_at",
  "users.updated_at",
] as const;

interface UserOptions {
  discord_id?: string;
  discord_username?: string;
}

export function usersServiceFactory(
  db: KevbotDb,
  config: Config,
  tracksService: TracksService,
  playlistsService: PlaylistsService,
  authorizationService: AuthorizationService,
) {
  const validateDiscordIdIsUnique = async (discordId: string) => {
    const user = await db
      .selectFrom("users")
      .select(["discord_id"])
      .where("discord_id", "=", discordId)
      .executeTakeFirst();
    if (user) {
      throw Boom.conflict("Discord ID is already taken");
    }
  };

  const userPermissionCheck = (user: PublicUser, req_user_id: number) => {
    if (user.id !== req_user_id) {
      throw Boom.forbidden("You do not have permission to modify this user.");
    }
  };

  const postUser = async (options: PostUserOptions) => {
    await validateDiscordIdIsUnique(options.discord_id);
    const { insertId } = await db.insertInto("users").values(options).executeTakeFirst();
    return await getUserById(Number(insertId));
  };

  const patchUser = async (id: number, req_user_id: number, options: PatchUserOptions) => {
    const user = await getUserById(id);
    userPermissionCheck(user, req_user_id);
    if (Object.keys(options).length === 0) {
      return user;
    }
    await db.updateTable("users").set(options).where("id", "=", id).execute();
    return await getUserById(id);
  };

  const putGreeting = async (
    id: number,
    greeting_track_id: number | null,
    greeting_playlist_id: number | null,
    req_user_id: number,
  ) => {
    if (Number.isInteger(greeting_track_id) && Number.isInteger(greeting_playlist_id)) {
      throw Boom.badRequest("Only a greeting track OR a playlist can be provided, not both");
    }
    const user = await getUserById(id); // ensures user exits
    userPermissionCheck(user, req_user_id);
    if (greeting_track_id) {
      const track = await tracksService.getTrackById(greeting_track_id);
      if (track.deleted_at) throw Boom.notFound("Track not found");
    }
    if (greeting_playlist_id) {
      const playlist = await playlistsService.getPlaylistById(greeting_playlist_id);
      if (playlist.deleted_at) throw Boom.notFound("Playlist not found");
      if (!(await playlistsService.getPlaylistTracks(greeting_playlist_id)).length)
        throw Boom.badRequest("Greeting playlist must not be empty");
    }
    await db
      .insertInto("user_greetings")
      .values({ user_id: id, greeting_track_id, greeting_playlist_id })
      .onDuplicateKeyUpdate({
        greeting_track_id: greeting_track_id,
        greeting_playlist_id: greeting_playlist_id,
      })
      .execute();
    return await getGreetingByUserId(id);
  };

  const putFarewell = async (
    id: number,
    farewell_track_id: number | null,
    farewell_playlist_id: number | null,
    req_user_id: number,
  ) => {
    if (Number.isInteger(farewell_track_id) && Number.isInteger(farewell_playlist_id)) {
      throw Boom.badRequest("Only a farewell track OR a playlist can be provided, not both");
    }
    const user = await getUserById(id); // ensures user exits
    userPermissionCheck(user, req_user_id);
    if (farewell_track_id) {
      const track = await tracksService.getTrackById(farewell_track_id);
      if (track.deleted_at) throw Boom.notFound("Track not found");
      if (track.duration >= 4) throw Boom.badRequest("Farewell duration must be less than 4 seconds");
    }
    if (farewell_playlist_id) {
      const playlist = await playlistsService.getPlaylistById(farewell_playlist_id);
      if (playlist.deleted_at) throw Boom.notFound("Playlist not found");
      const tracks = await playlistsService.getPlaylistTracks(farewell_playlist_id);
      if (!tracks.length || tracks.some((track) => track.duration >= 4))
        throw Boom.badRequest("Farewell playlist must contain only tracks less than 4 seconds");
    }
    await db
      .insertInto("user_farewells")
      .values({ user_id: id, farewell_track_id, farewell_playlist_id })
      .onDuplicateKeyUpdate({
        farewell_track_id: farewell_track_id,
        farewell_playlist_id: farewell_playlist_id,
      })
      .execute();
    return await getFarewellByUserId(id);
  };

  const getUsers = async (options: UserOptions = {}) => {
    const { discord_id, discord_username } = options;
    let query = db.selectFrom("users").select(PUBLIC_USER_FIELDS);
    if (discord_id) {
      query = query.where("users.discord_id", "=", discord_id);
    }
    if (discord_username) {
      query = query.where("users.discord_username", "=", discord_username);
    }
    return await query.execute();
  };

  const getAdminUsers = async (actorUserId: number) => {
    await authorizationService.requireAbility(actorUserId, "users.list");
    return await db
      .selectFrom("users")
      .select([...PUBLIC_USER_FIELDS, "users.authorization_role"])
      .orderBy("users.id", "asc")
      .execute();
  };

  const assignUserRole = async (targetUserId: number, role: AuthorizationRole, actorUserId: number) => {
    if (targetUserId === actorUserId) throw Boom.forbidden("You cannot change your own role.");

    const result = await db.transaction().execute(async (trx) => {
      // Serialize role changes and bootstrap so the final-admin check cannot race.
      await trx
        .selectFrom("authorization_state")
        .select("id")
        .where("id", "=", 1)
        .forUpdate()
        .executeTakeFirstOrThrow();
      await authorizationService.requireAbility(actorUserId, "users.assign_role", trx);

      const target = await trx
        .selectFrom("users")
        .select([...PUBLIC_USER_FIELDS, "users.authorization_role"])
        .where("users.id", "=", targetUserId)
        .forUpdate()
        .executeTakeFirst();
      if (!target) throw Boom.notFound("User not found");
      if (target.authorization_role === role) return { target, changed: false, previousRole: role };

      if (target.authorization_role === "admin" && role !== "admin") {
        const { count } = await trx
          .selectFrom("users")
          .select(({ fn }) => fn.countAll<number>().as("count"))
          .where("authorization_role", "=", "admin")
          .executeTakeFirstOrThrow();
        if (Number(count) <= 1) throw Boom.conflict("The last Admin cannot be demoted.");
      }

      await trx.updateTable("users").set({ authorization_role: role }).where("id", "=", targetUserId).execute();
      return {
        target: { ...target, authorization_role: role },
        changed: true,
        previousRole: target.authorization_role,
      };
    });

    if (result.changed) {
      getLogger().info(
        {
          actor_user_id: actorUserId,
          target_user_id: targetUserId,
          previous_role: result.previousRole,
          new_role: role,
        },
        "authorization.role.changed",
      );
    }
    return { ...result.target, authorization_role: role };
  };

  const getUserById = async (id: number) => {
    const user = await db.selectFrom("users").select(PUBLIC_USER_FIELDS).where("users.id", "=", id).executeTakeFirst();
    if (!user) {
      throw Boom.notFound("User not found");
    }
    return user;
  };

  const getUserByDiscordId = async (discordId: string) => {
    const user = await db
      .selectFrom("users")
      .select(PUBLIC_USER_FIELDS)
      .where("users.discord_id", "=", discordId)
      .executeTakeFirst();
    if (!user) {
      throw Boom.notFound("User not found");
    }
    return user;
  };

  const getGreetingByUserId = async (id: number) => {
    const greeting = await db
      .selectFrom("user_greetings")
      .select(["greeting_track_id", "greeting_playlist_id"])
      .where("user_id", "=", id)
      .executeTakeFirst();
    return greeting ?? { greeting_track_id: null, greeting_playlist_id: null };
  };

  const getFarewellByUserId = async (id: number) => {
    const farewell = await db
      .selectFrom("user_farewells")
      .select(["farewell_track_id", "farewell_playlist_id"])
      .where("user_id", "=", id)
      .executeTakeFirst();
    return farewell ?? { farewell_track_id: null, farewell_playlist_id: null };
  };

  return {
    postUser,
    patchUser,
    putGreeting,
    putFarewell,
    getUsers,
    getAdminUsers,
    assignUserRole,
    getUserById,
    getGreetingByUserId,
    getFarewellByUserId,
    getUserByDiscordId,
  };
}

export type UsersService = ReturnType<typeof usersServiceFactory>;
