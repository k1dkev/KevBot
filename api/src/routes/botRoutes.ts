import express from "express";
import { Config } from "../config/config";
import { AuthService } from "../services/authService";
import { authControllerFactory } from "../controllers/authController";
import { UsersService } from "../services/usersService";
import { AuthMiddleware } from "../middlewares/auth";
import { z } from "zod";

export function botRoutesFactory(
  config: Config,
  authService: AuthService,
  usersService: UsersService,
  auth: AuthMiddleware,
) {
  const router = express.Router();
  // REVIEW: not sure if I like the authControllerFactory, another controller is constructed in the authRoutesFactory
  const authController = authControllerFactory(config, authService, usersService);
  router.post("/auth", authController.postBotAuth);
  const actorSchema = z.object({ discord_id: z.string().regex(/^[1-9]\d{16,19}$/) }).strict();
  router.post("/actors/resolve", auth.requireBotService, async (req, res) => {
    const { discord_id } = actorSchema.parse(req.body);
    const grant = await authService.resolveBotActor(discord_id);
    res.json({
      access_token: grant.accessToken,
      token_type: "Bearer",
      expires_in: grant.expiresIn,
      role: "bot",
      user: grant.user,
    });
  });
  return router;
}
