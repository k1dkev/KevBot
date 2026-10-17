import { AuthService, authServiceFactory } from "./authService";
import { PlaylistsService, playlistsServiceFactory } from "./playlistsService";
import { PlaysService, playsServiceFactory } from "./playsService";
import { TracksService, tracksServiceFactory } from "./tracksService";
import { UsersService, usersServiceFactory } from "./usersService";
import { Config, Secrets } from "../config/config";
import { KevbotDb } from "../db/connection";
import { Bucket } from "@google-cloud/storage";
import { SearchService, searchServiceFactory } from "./searchService";
import { authorizationServiceFactory } from "../authorization/roles";

export interface AllServices {
  authService: AuthService;
  playlistsService: PlaylistsService;
  playsService: PlaysService;
  tracksService: TracksService;
  usersService: UsersService;
  searchService: SearchService;
}

export function serviceFactory(config: Config, secrets: Secrets, db: KevbotDb, tracksBucket: Bucket): AllServices {
  const authorizationService = authorizationServiceFactory(db);
  const tracksService = tracksServiceFactory(db, tracksBucket, authorizationService);
  const playlistsService = playlistsServiceFactory(db, authorizationService);
  const usersService = usersServiceFactory(db, config, tracksService, playlistsService, authorizationService);
  const playsService = playsServiceFactory(db, tracksService, playlistsService);
  const authService = authServiceFactory(config, secrets, db, usersService);
  const searchService = searchServiceFactory(db, config);

  return {
    authService,
    playlistsService,
    playsService,
    tracksService,
    usersService,
    searchService,
  };
}
