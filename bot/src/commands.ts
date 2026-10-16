import type { BotApiClient } from "./api-client.js";
import { PlaybackError, type PlaybackPool, type PlaybackService } from "./playback.js";
import { preferenceCommands } from "./preference-commands.js";
import {
  addTrackToPlaylists,
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist,
  removeTrackFromPlaylists,
  removeTracksFromPlaylist,
} from "./library-commands.js";
export const helpSelectors = ["kb", "kevbot", "kev-bot"] as const;
export const greetingTypes: Readonly<Record<string, "track" | "playlist">> = {
  file: "track",
  audio: "track",
  clip: "track",
  audioclip: "track",
  playlist: "playlist",
};
const rankedSources = new Set(["most_played", "play_history", "upload_history"]);
const namedSources = new Set(["all_tracks", "most_played", "my_uploads", "play_history", "upload_history"]);
export interface ParsedArgs {
  tokens: string[];
  pool?: PlaybackPool;
  limit?: number;
  greetingType?: "track" | "playlist";
  trackName?: string;
  channelNumber?: number;
}
export class UsageError extends Error {}
export interface CommandDefinition {
  name: string;
  usage: string;
  description: string;
  guildOnly: boolean;
  followup?: number;
  validate(tokens: string[]): ParsedArgs;
  execute?(context: {
    prefix: string;
    args: ParsedArgs;
    authorDiscordId: string;
    guildId: string | null;
    voiceChannelId: string | null;
    api: BotApiClient;
    playback?: PlaybackService;
  }): string | Promise<string>;
}
const count = (tokens: string[], min: number, max = min) => {
  if (tokens.length < min || tokens.length > max) throw new UsageError("Invalid argument count.");
};
const name = (value: string | undefined, max: number) => {
  if (!value || !/^[a-z0-9]+$/.test(value) || value.length > max)
    throw new UsageError(`Names require lowercase letters/digits, at most ${max} characters.`);
};
const track = (tokens: string[]) => {
  count(tokens, 1);
  name(tokens[0], 15);
  return { tokens };
};
const playlist = (tokens: string[]) => {
  count(tokens, 1);
  name(tokens[0], 45);
  return { tokens };
};
const empty = (tokens: string[]) => {
  count(tokens, 0);
  return { tokens };
};
function pool(tokens: string[]): ParsedArgs {
  count(tokens, 0, 2);
  const selector = tokens[0];
  let selected: PlaybackPool = { type: "all_tracks" };
  if (selector !== undefined) {
    if (selector.startsWith("source:")) {
      const source = selector.slice("source:".length);
      if (!namedSources.has(source)) throw new UsageError("Use a supported typed source.");
      selected = { type: source as "all_tracks" | "most_played" | "my_uploads" | "play_history" | "upload_history" };
    } else {
      const playlistName = selector.startsWith("playlist:") ? selector.slice("playlist:".length) : selector;
      name(playlistName, 45);
      selected = { type: "playlist", name: playlistName };
    }
  }
  const bounded = selected.type !== "playlist" && rankedSources.has(selected.type);
  if (tokens[1] !== undefined && (!bounded || !/^[1-9]\d*$/.test(tokens[1]) || Number(tokens[1]) > 100))
    throw new UsageError("Only ranked/history sources accept a length from 1 through 100.");
  return { tokens, pool: selected, ...(bounded ? { limit: Number(tokens[1] ?? 25) } : {}) };
}
const membership = (playlistFirst: boolean) => (tokens: string[]) => {
  count(tokens, 2, 100);
  if (playlistFirst) {
    playlist(tokens.slice(0, 1));
    tokens.slice(1).forEach((item) => name(item, 15));
  } else {
    name(tokens[0], 15);
    tokens.slice(1).forEach((item) => playlist([item]));
  }
  return { tokens };
};
const pending = (
  name: string,
  usage: string,
  description: string,
  followup: number,
  validate: CommandDefinition["validate"],
  guildOnly = false,
): CommandDefinition => ({ name, usage, description, followup, validate, guildOnly });

export const commands: readonly CommandDefinition[] = [
  {
    name: "p",
    usage: "p!track",
    description: "Play an exact track in your voice channel.",
    guildOnly: true,
    validate: track,
    execute: ({ args, authorDiscordId, guildId, voiceChannelId, playback }) => {
      if (!playback || !guildId) throw new PlaybackError("closed");
      return playback.play({
        kind: "play",
        trackName: args.tokens[0],
        actorDiscordId: authorDiscordId,
        guildId,
        voiceChannelId,
      });
    },
  },
  {
    name: "pr",
    usage: "pr![source:<type>|playlist:<name>] [length]",
    description: "Play a random track from a typed source or named playlist.",
    guildOnly: true,
    validate: pool,
    execute: ({ args, authorDiscordId, guildId, voiceChannelId, playback }) => {
      if (!playback || !guildId) throw new PlaybackError("closed");
      return playback.play({
        kind: "random",
        pool: args.pool,
        limit: args.limit,
        actorDiscordId: authorDiscordId,
        guildId,
        voiceChannelId,
      });
    },
  },
  {
    name: "raid",
    usage: "raid!track channel-number",
    description: "Play an exact track in a numbered guild voice channel.",
    guildOnly: true,
    validate: (tokens) => {
      count(tokens, 2);
      name(tokens[0], 15);
      if (!/^[1-9]\d*$/.test(tokens[1]!) || !Number.isSafeInteger(Number(tokens[1])))
        throw new UsageError("Channel number must be a positive integer.");
      return { tokens, trackName: tokens[0], channelNumber: Number(tokens[1]) };
    },
    execute: ({ args, authorDiscordId, guildId, playback }) => {
      if (!playback || !guildId) throw new PlaybackError("closed");
      return playback.play({
        kind: "raid",
        trackName: args.trackName,
        actorDiscordId: authorDiscordId,
        guildId,
        voiceChannelId: null,
        channelNumber: args.channelNumber,
      });
    },
  },
  pending("list", "list![source:<type>|playlist:<name>] [length]", "List tracks, playlists or history.", 161, pool),
  pending(
    "upload",
    "upload![playlist ...] + MP3 attachment",
    "Upload the first attachment through the API.",
    161,
    (tokens) => {
      count(tokens, 0, 100);
      tokens.forEach((item) => playlist([item]));
      return { tokens };
    },
  ),
  {
    name: "help",
    usage: "help!kb | help!kevbot | help!kev-bot",
    description: "Show actual command implementation status and usage.",
    guildOnly: false,
    execute: ({ prefix }) => renderHelp(prefix),
    validate: (tokens) => {
      count(tokens, 1);
      if (!(helpSelectors as readonly string[]).includes(tokens[0]!))
        throw new UsageError("Use a help selector: kb, kevbot, kev-bot.");
      return { tokens };
    },
  },
  {
    name: "setgreeting",
    usage: "setgreeting!name [file|audio|clip|audioclip|playlist]",
    description: "Set your track/playlist greeting.",
    guildOnly: false,
    execute: preferenceCommands.setGreeting,
    validate: (tokens) => {
      count(tokens, 1, 2);
      const alias = tokens[1];
      if (alias !== undefined && !Object.hasOwn(greetingTypes, alias))
        throw new UsageError("Unknown greeting type alias.");
      const type = alias === undefined ? undefined : greetingTypes[alias];
      name(tokens[0], type === "track" ? 15 : 45);
      return { tokens, greetingType: type };
    },
  },
  {
    name: "getgreeting",
    usage: "getgreeting!",
    description: "Show your greeting.",
    guildOnly: false,
    execute: preferenceCommands.getGreeting,
    validate: empty,
  },
  {
    name: "delgreeting",
    usage: "delgreeting!",
    description: "Clear your greeting.",
    guildOnly: false,
    execute: preferenceCommands.deleteGreeting,
    validate: empty,
  },
  {
    name: "setfarewell",
    usage: "setfarewell!clip",
    description: "Set your farewell using a clip shorter than 4 seconds.",
    guildOnly: false,
    execute: preferenceCommands.setFarewell,
    validate: track,
  },
  {
    name: "getfarewell",
    usage: "getfarewell!",
    description: "Show your farewell.",
    guildOnly: false,
    execute: preferenceCommands.getFarewell,
    validate: empty,
  },
  {
    name: "delfarewell",
    usage: "delfarewell!",
    description: "Clear your farewell.",
    guildOnly: false,
    execute: preferenceCommands.deleteFarewell,
    validate: empty,
  },
  {
    name: "newplaylist",
    usage: "newplaylist!name",
    description: "Create a playlist.",
    guildOnly: false,
    validate: playlist,
    execute: createPlaylist,
  },
  {
    name: "delplaylist",
    usage: "delplaylist!name",
    description: "Delete an empty playlist with API permission checks.",
    guildOnly: false,
    validate: playlist,
    execute: deletePlaylist,
  },
  {
    name: "addtoplaylist",
    usage: "addtoplaylist!playlist track [track ...]",
    description: "Add tracks to one playlist.",
    guildOnly: false,
    validate: membership(true),
    execute: addTracksToPlaylist,
  },
  {
    name: "delfromplaylist",
    usage: "delfromplaylist!playlist track [track ...]",
    description: "Remove tracks with API permission checks.",
    guildOnly: false,
    validate: membership(true),
    execute: removeTracksFromPlaylist,
  },
  {
    name: "addplayliststo",
    usage: "addplayliststo!track playlist [playlist ...]",
    description: "Add one track to playlists.",
    guildOnly: false,
    validate: membership(false),
    execute: addTrackToPlaylists,
  },
  {
    name: "delplaylistsfrom",
    usage: "delplaylistsfrom!track playlist [playlist ...]",
    description: "Remove a track from playlists with API permission checks.",
    guildOnly: false,
    validate: membership(false),
    execute: removeTrackFromPlaylists,
  },
];
export const commandRegistry: ReadonlyMap<string, CommandDefinition> = new Map(
  commands.map((command) => [command.name, command]),
);

export function renderHelp(prefix: string): string {
  const implemented = commands.filter((command) => command.execute).map((command) => command.name);
  const pending = commands.filter((command) => !command.execute).map((command) => command.name);
  return [
    `KevBot command foundation — ${prefix}<command>!<arguments>`,
    `Implemented: ${implemented.join(", ")}.`,
    `Still pending: ${pending.join(", ")}.`,
    ...commands.map(
      (command) =>
        `${command.name} — ${command.execute ? "implemented" : `not implemented (#${command.followup})`}${command.guildOnly ? "; guild only" : "; DM or guild"}\n${prefix}${command.usage}\n${command.description}`,
    ),
    "Special sources use source:all_tracks, source:most_played, source:my_uploads, source:play_history, or source:upload_history.",
    "Select a playlist by name or playlist:<name>; names are never reserved for special sources.",
    "Ranked/history defaults are 25, maximum 100. Tracks and playlists named allcats or all are ordinary names.",
    "Greeting types: file/audio/clip/audioclip or playlist.",
  ].join("\n\n");
}

export function parseCommand(content: string, prefix: string): { command: string; tokens: string[] } | null {
  const text = content.trim();
  if (!text.startsWith(prefix)) return null;
  if (text.length > 2000) throw new UsageError("Command is too long.");
  const body = text.slice(prefix.length);
  const delimiter = body.indexOf("!");
  if (delimiter < 0) throw new UsageError("Use <prefix><command>!<arguments>.");
  if (body.indexOf("!", delimiter + 1) >= 0) throw new UsageError("Use only one command separator after the prefix.");
  const command = body.slice(0, delimiter).trim().toLowerCase();
  if (!/^[a-z]+$/.test(command)) throw new UsageError("Invalid command name.");
  return {
    command,
    tokens: body
      .slice(delimiter + 1)
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  };
}
