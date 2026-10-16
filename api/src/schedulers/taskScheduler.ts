import cron from "node-cron";
import { aggregatePlayCounts } from "../tasks/aggregatePlayCounts";
import { checkDatabaseVersion } from "../tasks/checkDatabaseVersion";
import { KevbotDb } from "../db/connection";
import { Config } from "../config/config";
import { getLogger } from "../logging/context";

const initTaskSchedules = async (config: Config, db: KevbotDb) => {
  // run on startup
  await aggregatePlayCounts(db);
  await checkDatabaseVersion(config, db);

  // run on schedule
  cron.schedule(
    "0 * * * *",
    () => {
      aggregatePlayCounts(db);
    },
    {
      timezone: "UTC",
    },
  );

  getLogger().info({ component: "scheduler", schedule: "0 * * * *", timezone: "UTC" }, "aggregation.scheduled");
};

export default initTaskSchedules;
