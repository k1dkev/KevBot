import { z } from "zod";

export const poolNameSchema = z
  .string()
  .toLowerCase()
  .regex(/^[a-z\d]{1,45}$/);
export const poolQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(2_147_483_647).default(0),
  })
  .strict();
export const randomPoolQuerySchema = poolQuerySchema
  .omit({ offset: true })
  .extend({
    max_duration: z.coerce.number().positive().max(15).optional(),
  })
  .strict();
export type PoolQuery = z.infer<typeof poolQuerySchema>;
