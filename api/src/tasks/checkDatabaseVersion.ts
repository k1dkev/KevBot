import { KevbotDb } from "../db/connection";
import { Config } from "../config/config";
import { getLogger } from "../logging/context";

export const checkDatabaseVersion = async (config: Config, db: KevbotDb) => {
  const log = getLogger().child({ component: "database" });
  log.debug({}, "database.version.checking");
  const data = await db.selectFrom("schema_version").selectAll().orderBy("id", "desc").limit(1).execute();
  const dbVersion = data[0].version;
  if (dbVersion !== config.expectedDbVersion) {
    throw new Error(
      `Database version mismatch: expected ${config.expectedDbVersion}, but found ${dbVersion}. Please update database or API accordingly.`,
    );
  }
  log.info({ version: config.expectedDbVersion }, "database.version.checked");
};
