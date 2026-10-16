import express from "express";
import { Config } from "../config/config";
import { audioControllerFactory } from "../controllers/audioController";
import { AuthMiddleware } from "../middlewares/auth";

export function audioRoutesFactory(config: Config, auth: AuthMiddleware) {
  const router = express.Router();
  router.post("/normalize", auth.requireAuth, audioControllerFactory(config).normalize);
  return router;
}
