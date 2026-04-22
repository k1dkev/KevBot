import express, { RequestHandler } from "express";
import { serviceFactory } from "./services";
import { docsRoutesFactory } from "./routes/docsRoutes";
import { authRoutesFactory } from "./routes/authRoutes";
import { usersRoutesFactory } from "./routes/usersRoutes";
import { tracksRoutesFactory } from "./routes/tracksRoutes";
import { playlistsRoutesFactory } from "./routes/playlistsRoutes";
import { playsRoutesFactory } from "./routes/playsRoutes";
import { errorHandlerFactory } from "./middlewares/errorHandler";
import { Config, Secrets } from "./config/config";
import { Kysely } from "kysely";
import { Database } from "./db/schema";
import { Bucket } from "@google-cloud/storage";
import path from "path";
import { authMiddlewareFactory } from "./middlewares/auth";
import { botRoutesFactory } from "./routes/botRoutes";
import { devRoutesFactory } from "./routes/devRoutes";
import { searchRoutesFactory } from "./routes/searchRoutes";

export function appFactory(config: Config, secrets: Secrets, db: Kysely<Database>, tracksBucket: Bucket) {
  const app = express();
  // Basic CORS middleware allowing frontend origin with credentials
  const allowedOrigins = new Set<string>(["http://localhost:3000", process.env.FRONTEND_ORIGIN || ""].filter(Boolean));

  const corsMiddleware: RequestHandler = (req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && allowedOrigins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };

  app.use(corsMiddleware);

  app.use(express.json());
  const services = serviceFactory(config, secrets, db, tracksBucket);
  const auth = authMiddlewareFactory(services.authService);
  app.use("/v1/docs", docsRoutesFactory(path.join(__dirname, "docs", "openapi.yml")));
  app.use("/v1/auth", authRoutesFactory(config, services.authService, services.usersService, auth));
  app.use("/v1/bot", botRoutesFactory(config, services.authService, services.usersService));
  app.use("/v1/users", usersRoutesFactory(auth, services.usersService));
  app.use("/v1/tracks", tracksRoutesFactory(config, auth, services.tracksService));
  app.use("/v1/playlists", playlistsRoutesFactory(config, auth, services.playlistsService));
  app.use("/v1/search", searchRoutesFactory(config, services.searchService));
  app.use("/v1/plays", playsRoutesFactory(auth, services.playsService));
  app.use("/v1/dev", devRoutesFactory(config, secrets, db, services.usersService));
  app.use(errorHandlerFactory(config.maxFileSizeInBytes));
  return app;
}
