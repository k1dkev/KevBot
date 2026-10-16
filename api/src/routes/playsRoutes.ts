import express from "express";
import { playsControllerFactory } from "../controllers/playsController";
import { AuthMiddleware } from "../middlewares/auth";
import { PlaysService } from "../services/playsService";
import { playbackEventBodySchema } from "../schemas/playsSchemas";
import { getAuthenticatedUser } from "../utils/getAuthenticatedUser";
import * as Boom from "@hapi/boom";

export function playsRoutesFactory(auth: AuthMiddleware, playsService: PlaysService) {
  const router = express.Router();
  const playsController = playsControllerFactory(playsService);
  router.post("/tracks", auth.optionalAuth, playsController.logTracksPlay);
  router.post("/playlists/random", auth.optionalAuth, playsController.logRandomPlaylistsPlay);
  router.post("/events", auth.requireAuth, async (req, res) => {
    const actor = getAuthenticatedUser(req);
    if (actor.role !== "bot") throw Boom.forbidden("Playback event reports require a delegated bot actor");
    const { playback_started, ...event } = playbackEventBodySchema.parse(req.body);
    const result = await playsService.reportPlayback(event, actor.id);
    res.status(result.duplicate ? 200 : 201).json(result);
  });
  return router;
}
