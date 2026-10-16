import express from "express";
import { AuthMiddleware } from "../middlewares/auth";
import { libraryServiceFactory } from "../services/libraryService";
import { poolNameSchema, poolQuerySchema, randomPoolQuerySchema } from "../schemas/librarySchemas";

export function libraryRoutesFactory(auth: AuthMiddleware, service: ReturnType<typeof libraryServiceFactory>) {
  const router = express.Router();
  router.get("/pools/:name", auth.optionalAuth, async (req, res) => {
    res.json(
      await service.listPool(poolNameSchema.parse(req.params.name), poolQuerySchema.parse(req.query), req.auth?.userId),
    );
  });
  router.get("/pools/:name/random", auth.optionalAuth, async (req, res) => {
    const { limit, max_duration } = randomPoolQuerySchema.parse(req.query);
    res.json(
      await service.randomFromPool(poolNameSchema.parse(req.params.name), limit, req.auth?.userId, max_duration),
    );
  });
  return router;
}
