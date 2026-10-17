import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { getAuthenticatedUser } from "../utils/getAuthenticatedUser";
import { i32IdSchema } from "../schemas/sharedSchemas";
import { assignRoleBodySchema } from "../schemas/adminSchemas";
import { UsersService } from "../services/usersService";

export function adminControllerFactory(usersService: UsersService) {
  const getUsers = async (req: Request, res: Response) => {
    const actor = getAuthenticatedUser(req);
    const users = await usersService.getAdminUsers(actor.id);
    res.status(StatusCodes.OK).json(users);
  };

  const assignUserRole = async (req: Request, res: Response) => {
    const { id } = i32IdSchema.parse(req.params);
    const { role } = assignRoleBodySchema.parse(req.body);
    const actor = getAuthenticatedUser(req);
    const user = await usersService.assignUserRole(id, role, actor.id);
    res.status(StatusCodes.OK).json(user);
  };

  return { getUsers, assignUserRole };
}
