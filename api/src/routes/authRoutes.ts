import express from "express";
import { Config } from "../config/config";
import { authControllerFactory } from "../controllers/authController";
import { AuthService } from "../services/authService";
import { UsersService } from "../services/usersService";
import { AuthMiddleware } from "../middlewares/auth";

export function authRoutesFactory(
  config: Config,
  authService: AuthService,
  usersService: UsersService,
  auth: AuthMiddleware,
) {
  const authController = authControllerFactory(config, authService, usersService);
  const router = express.Router();

  router.post("/discord-exchange", authController.postDiscordExchange);
  router.post("/refresh", authController.postRefresh);
  router.post("/logout", authController.postLogout);
  router.get("/me", auth.requireAuth, authController.getMe);

  return router;
}
