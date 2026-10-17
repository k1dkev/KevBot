import express from "express";
import { AuthMiddleware } from "../middlewares/auth";
import { UsersService } from "../services/usersService";
import { adminControllerFactory } from "../controllers/adminController";

export function adminRoutesFactory(auth: AuthMiddleware, usersService: UsersService) {
  const router = express.Router();
  const adminController = adminControllerFactory(usersService);
  router.get("/users", auth.requireAuth, adminController.getUsers);
  router.patch("/users/:id/role", auth.requireAuth, adminController.assignUserRole);
  return router;
}
