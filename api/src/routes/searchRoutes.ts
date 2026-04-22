import express from "express";
import { Config } from "../config/config";
import { SearchService } from "../services/searchService";
import { searchControllerFactory } from "../controllers/searchController";

export function searchRoutesFactory(config: Config, searchService: SearchService) {
  const router = express.Router();
  const controller = searchControllerFactory(config, searchService);

  router.get("/", controller.search);

  return router;
}
