export const helpSelectors = ["kb", "kevbot", "kev-bot"] as const;
export const greetingTypes: Readonly<Record<string, "track" | "category">> = {
  file: "track",
  audio: "track",
  clip: "track",
  audioclip: "track",
  cat: "category",
  category: "category",
};
export const reservedPools = [
  "categories",
  "cats",
  "emptycats",
  "all",
  "mostplayed",
  "myuploads",
  "playhistory",
  "uploadhistory",
] as const;
const rankedPools = new Set(["mostplayed", "playhistory", "uploadhistory"]);
export interface ParsedArgs {
  tokens: string[];
  pool?: string;
  limit?: number;
  greetingType?: "track" | "category";
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
    api: BotApiClient;
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
const category = (tokens: string[]) => {
  count(tokens, 1);
  name(tokens[0], 45);
  if ((reservedPools as readonly string[]).includes(tokens[0]!))
    throw new UsageError("Virtual pools cannot be changed.");
  return { tokens };
};
const empty = (tokens: string[]) => {
  count(tokens, 0);
  return { tokens };
};
function pool(tokens: string[], playable: boolean): ParsedArgs {
  count(tokens, 0, 2);
  const pool = tokens[0] === "cats" ? "categories" : (tokens[0] ?? "all");
  name(pool, 45);
  if (playable && ["categories", "emptycats"].includes(pool)) throw new UsageError("This pool cannot be played.");
  if (tokens[1] !== undefined && (!rankedPools.has(pool) || !/^[1-9]\d*$/.test(tokens[1]) || Number(tokens[1]) > 100))
    throw new UsageError(
      "Ranked/history lengths must be integers from 1 through 100; other pools use the full eligible set.",
    );
  return { tokens, pool, ...(rankedPools.has(pool) ? { limit: Number(tokens[1] ?? 25) } : {}) };
}
const membership = (categoryFirst: boolean) => (tokens: string[]) => {
  count(tokens, 2, 100);
  if (categoryFirst) {
    category(tokens.slice(0, 1));
    tokens.slice(1).forEach((item) => name(item, 15));
  } else {
    name(tokens[0], 15);
    tokens.slice(1).forEach((item) => category([item]));
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
  pending("p", "p!clip", "Play an exact clip in your voice channel.", 160, track, true),
  pending(
    "pr",
    "pr![pool] [length]",
    "Random selection from an eligible pool.",
    160,
    (tokens) => pool(tokens, true),
    true,
  ),
  pending(
    "raid",
    "raid!clip channel-number",
    "Play in a numbered guild voice channel.",
    160,
    (tokens) => {
      count(tokens, 2);
      name(tokens[0], 15);
      if (!/^[1-9]\d*$/.test(tokens[1]!) || !Number.isSafeInteger(Number(tokens[1])))
        throw new UsageError("Channel number must be a positive integer.");
      return { tokens, channelNumber: Number(tokens[1]) };
    },
    true,
  ),
  pending("list", "list![pool] [length]", "List clips, categories or history.", 161, (tokens) => pool(tokens, false)),
  pending(
    "upload",
    "upload![category ...] + MP3 attachment",
    "Upload the first attachment through the API.",
    161,
    (tokens) => {
      count(tokens, 0, 100);
      tokens.forEach((item) => category([item]));
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
  pending(
    "setgreeting",
    "setgreeting!name [file|audio|clip|audioclip|cat|category]",
    "Set your clip/category greeting.",
    162,
    (tokens) => {
      count(tokens, 1, 2);
      const type = tokens[1] === undefined ? undefined : greetingTypes[tokens[1]];
      if (tokens[1] !== undefined && !type) throw new UsageError("Unknown greeting type alias.");
      name(tokens[0], type === "track" ? 15 : 45);
      return { tokens, greetingType: type };
    },
  ),
  pending("getgreeting", "getgreeting!", "Show your greeting.", 162, empty),
  pending("delgreeting", "delgreeting!", "Clear your greeting.", 162, empty),
  pending("setfarewell", "setfarewell!clip", "Set your farewell (strictly below 4 seconds).", 162, track),
  pending("getfarewell", "getfarewell!", "Show your farewell.", 162, empty),
  pending("delfarewell", "delfarewell!", "Clear your farewell.", 162, empty),
  pending("newcategory", "newcategory!name", "Create a category.", 161, category),
  pending("delcategory", "delcategory!name", "Delete an empty category with API permission checks.", 161, category),
  pending("addtocat", "addtocat!category clip [clip ...]", "Add clips to one category.", 161, membership(true)),
  pending(
    "delfromcat",
    "delfromcat!category clip [clip ...]",
    "Remove clips with API permission checks.",
    161,
    membership(true),
  ),
  pending("addcatsto", "addcatsto!clip category [category ...]", "Add one clip to categories.", 161, membership(false)),
  pending(
    "delcatsfrom",
    "delcatsfrom!clip category [category ...]",
    "Remove a clip from categories with API permission checks.",
    161,
    membership(false),
  ),
];
export const commandRegistry: ReadonlyMap<string, CommandDefinition> = new Map(
  commands.map((command) => [command.name, command]),
);

export function renderHelp(prefix: string): string {
  return [
    `KevBot command foundation — ${prefix}<command>!<arguments>`,
    "Only help is implemented. Other commands are registered for follow-up work.",
    ...commands.map(
      (command) =>
        `${command.name} — ${command.execute ? "implemented" : `not implemented (#${command.followup})`}${command.guildOnly ? "; guild only" : "; DM or guild"}\n${prefix}${command.usage}\n${command.description}`,
    ),
    "Pools: all (default), categories/cats, emptycats, mostplayed, myuploads, playhistory, uploadhistory, or a category name.",
    "Ranked/history default 25, maximum 100. allcats is an ordinary category name, not an alias.",
    "Greeting aliases: file/audio/clip/audioclip; cat/category. No library or voice operation is implemented yet.",
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
import type { BotApiClient } from "./api-client.js";
