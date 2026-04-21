import { z } from "zod";
import { Config } from "../config/config";

export function searchSchemasFactory(config: Config) {
  const searchQuerySchema = z.object({}).strict();

  return {
    searchQuerySchema,
  };
}
