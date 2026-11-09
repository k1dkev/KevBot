import * as Boom from "@hapi/boom";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema";

export const AUTHORIZATION_ROLES = ["user", "moderator", "admin"] as const;
export type AuthorizationRole = (typeof AUTHORIZATION_ROLES)[number];

export const ABILITIES = [
  "tracks.rename.any",
  "tracks.delete.any",
  "playlists.remove_tracks.any",
  "playlists.delete_empty.any",
  "users.list",
  "users.assign_role",
] as const;
export type Ability = (typeof ABILITIES)[number];

const ROLE_ABILITIES: Record<AuthorizationRole, readonly Ability[]> = {
  user: [],
  moderator: ["tracks.rename.any", "tracks.delete.any", "playlists.remove_tracks.any", "playlists.delete_empty.any"],
  admin: [
    "tracks.rename.any",
    "tracks.delete.any",
    "playlists.remove_tracks.any",
    "playlists.delete_empty.any",
    "users.list",
    "users.assign_role",
  ],
};

type Queryable = Kysely<Database> | Transaction<Database>;

export function authorizationServiceFactory(db: Kysely<Database>) {
  const getRole = async (userId: number, queryable: Queryable = db): Promise<AuthorizationRole> => {
    const user = await queryable
      .selectFrom("users")
      .select("authorization_role")
      .where("id", "=", userId)
      .executeTakeFirst();
    if (!user) throw Boom.forbidden("The acting user no longer exists");
    return user.authorization_role;
  };

  const hasAbility = async (userId: number, ability: Ability, queryable: Queryable = db) => {
    const role = await getRole(userId, queryable);
    return ROLE_ABILITIES[role].includes(ability);
  };

  const requireAbility = async (
    userId: number,
    ability: Ability,
    queryable: Queryable = db,
    forbiddenMessage = "You do not have permission to perform this action.",
  ) => {
    if (!(await hasAbility(userId, ability, queryable))) {
      throw Boom.forbidden(forbiddenMessage);
    }
  };

  return { getRole, hasAbility, requireAbility };
}

export type AuthorizationService = ReturnType<typeof authorizationServiceFactory>;
