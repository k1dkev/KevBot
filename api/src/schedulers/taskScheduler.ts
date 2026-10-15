import cron from "node-cron";
import { aggregatePlayCounts } from "../tasks/aggregatePlayCounts";
import { checkDatabaseVersion } from "../tasks/checkDatabaseVersion";
import { KevbotDb } from "../db/connection";
import { Config } from "../config/config";

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

  console.log("Scheduled play count aggregation to run every hour.");
};

export default initTaskSchedules;
