import initTaskSchedules from "./schedulers/taskScheduler";
import { configFactory } from "./config/config";
import { appFactory } from "./app";
import { dbFactory } from "./db/connection";
import { tracksBucketFactory } from "./storage/tracksBucket";
import { logger } from "./logging/logger";

const log = logger.child({ component: "startup" });

async function startServer() {
  try {
    const { config, secrets } = configFactory();
    const db = dbFactory(secrets.DB_CONNECTION_STRING);
    const tracksBucket = tracksBucketFactory(secrets.GCP_API_ENDPOINT, secrets.GCP_TRACKS_BUCKET_NAME);
    await initTaskSchedules(config, db);
    const app = appFactory(config, secrets, db, tracksBucket);
    const server = app.listen(secrets.KEVBOT_API_PORT, secrets.KEVBOT_API_ADDRESS, () => {
      const addr = server.address();
      if (addr === null) {
        log.error({}, "server.address.unavailable");
        return;
      }
      if (typeof addr === "object") {
        log.info({ address: addr.address, port: addr.port }, `API is listening on ${addr.address}:${addr.port}.`);
        return;
      }
      log.info({}, `API is listening on ${addr}.`);
    });
  } catch (error) {
    log.fatal({ err: error }, "server.start.failed");
    process.exit(1); // Exit with an error code if initialization fails
  }
}

startServer();
