import express from "express";
import { AuthMiddleware } from "../middlewares/auth";
import { libraryServiceFactory } from "../services/libraryService";
import { poolQuerySchema, randomPoolQuerySchema } from "../schemas/librarySchemas";

export function libraryRoutesFactory(auth: AuthMiddleware, service: ReturnType<typeof libraryServiceFactory>) {
  const router = express.Router();
  router.get("/pools", auth.optionalAuth, async (req, res) => {
    const query = poolQuerySchema.parse(req.query);
    res.json(await service.listPool(query.source, query, req.auth?.userId));
  });
  router.get("/pools/random", auth.optionalAuth, async (req, res) => {
    const query = randomPoolQuerySchema.parse(req.query);
    res.json(await service.randomFromPool(query.source, query.limit, req.auth?.userId, query.max_duration));
  });
  return router;
}
