import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Config } from "../config/config";
import { searchSchemasFactory } from "../schemas/searchSchemas";
import { SearchService } from "../services/searchService";

export function searchControllerFactory(config: Config, searchService: SearchService) {
  const searchSchemas = searchSchemasFactory(config);

  const search = async (req: Request, res: Response) => {
    const query = searchSchemas.searchQuerySchema.parse(req.query);
    const results = await searchService.search(query);
    res.status(StatusCodes.OK).json(results);
  };

  const search2 = async (req: Request, res: Response) => {
    const query = searchSchemas.searchQuerySchema.parse(req.query);
    const results = await searchService.search2(query);
    res.status(StatusCodes.OK).json(results);
  };

  return {
    search,
    search2,
  };
}
