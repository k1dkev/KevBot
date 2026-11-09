import { z } from "zod";
import { AUTHORIZATION_ROLES } from "../authorization/roles";

export const assignRoleBodySchema = z.object({ role: z.enum(AUTHORIZATION_ROLES) }).strict();
