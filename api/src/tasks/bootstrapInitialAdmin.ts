import { dbFactory } from "../db/connection";
import { KevbotDb } from "../db/connection";

export async function bootstrapInitialAdmin(db: KevbotDb, discordId: string) {
  if (!/^[1-9]\d{16,19}$/.test(discordId)) throw new Error("Provide a valid Discord user ID.");

  return db.transaction().execute(async (trx) => {
    const state = await trx
      .selectFrom("authorization_state")
      .select("bootstrap_completed")
      .where("id", "=", 1)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (state.bootstrap_completed) return { status: "already_completed" as const };

    const user = await trx
      .selectFrom("users")
      .select(["id", "discord_id"])
      .where("discord_id", "=", discordId)
      .forUpdate()
      .executeTakeFirst();
    if (!user) throw new Error("No KevBot user exists for that Discord ID; bootstrap was not completed.");

    await trx.updateTable("users").set({ authorization_role: "admin" }).where("id", "=", user.id).execute();
    await trx.updateTable("authorization_state").set({ bootstrap_completed: 1 }).where("id", "=", 1).execute();
    return { status: "completed" as const, userId: user.id };
  });
}

async function main() {
  const discordId = process.argv[2];
  const connectionString = process.env.DB_CONNECTION_STRING;
  if (!discordId) throw new Error("Usage: npm run bootstrap:admin -- <discord-user-id>");
  if (!connectionString) throw new Error("DB_CONNECTION_STRING must be set.");

  const db = dbFactory(connectionString);
  try {
    const result = await bootstrapInitialAdmin(db, discordId);
    if (result.status === "already_completed") {
      process.stdout.write("Initial Admin bootstrap was already completed; no role was changed.\n");
    } else {
      process.stdout.write(`Initial Admin assigned to KevBot user ${result.userId}.\n`);
    }
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Initial Admin bootstrap failed."}\n`);
    process.exitCode = 1;
  });
}
