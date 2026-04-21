import { Config } from "../config/config";
import {} from "../schemas/searchSchemas";

export function searchServiceFactory(config: Config) {
  async function search() {
    return 1;
  }

  return {
    search,
  };
}

export type SearchService = ReturnType<typeof searchServiceFactory>;
