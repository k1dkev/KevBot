import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { commands, helpSelectors } from "./commands.js";

type Choice = { name: string; value: string };
type StringOption = {
  kind: "string";
  name: string;
  description: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  choices?: Choice[];
};
type IntegerOption = {
  kind: "integer";
  name: string;
  description: string;
  required?: boolean;
  minValue?: number;
  maxValue?: number;
};
type AttachmentOption = { kind: "attachment"; name: string; description: string; required?: boolean };
type OptionSpec = StringOption | IntegerOption | AttachmentOption;
type CommandSpec = { name: string; description: string; options?: OptionSpec[] };

const sourceChoices: Choice[] = [
  { name: "All tracks", value: "all_tracks" },
  { name: "Most played", value: "most_played" },
  { name: "My uploads", value: "my_uploads" },
  { name: "Play history", value: "play_history" },
  { name: "Upload history", value: "upload_history" },
];
const searchTypeChoices: Choice[] = [
  { name: "Tracks and playlists", value: "both" },
  { name: "Tracks", value: "tracks" },
  { name: "Playlists", value: "playlists" },
];
const option = {
  string: (name: string, description: string, required = false, extra: Partial<StringOption> = {}): StringOption => ({
    kind: "string",
    name,
    description,
    required,
    ...extra,
  }),
  integer: (
    name: string,
    description: string,
    required = false,
    extra: Partial<IntegerOption> = {},
  ): IntegerOption => ({
    kind: "integer",
    name,
    description,
    required,
    ...extra,
  }),
};

const commandSpecs: CommandSpec[] = [
  {
    name: "p",
    description: "Play an exact track in your voice channel.",
    options: [option.string("track", "Track name", true, { maxLength: 15 })],
  },
  {
    name: "pr",
    description: "Play a random track from a typed source or playlist.",
    options: [
      option.string("source", "Built-in library source", false, { choices: sourceChoices }),
      option.string("playlist", "Playlist name", false, { maxLength: 45 }),
      option.integer("length", "Ranked/history pool length (1–100)", false, { minValue: 1, maxValue: 100 }),
    ],
  },
  {
    name: "raid",
    description: "Play a track in a numbered guild voice channel.",
    options: [
      option.string("track", "Track name", true, { maxLength: 15 }),
      option.integer("channel_number", "1-based voice channel number", true, { minValue: 1 }),
    ],
  },
  {
    name: "list",
    description: "List tracks, a playlist, or typed play/upload history.",
    options: [
      option.string("source", "Built-in library source", false, { choices: sourceChoices }),
      option.string("playlist", "Playlist name", false, { maxLength: 45 }),
      option.integer("length", "Ranked/history result length (1–100)", false, { minValue: 1, maxValue: 100 }),
    ],
  },
  {
    name: "search",
    description: "Search tracks and playlists.",
    options: [
      option.string("query", "Words to search for", true, { minLength: 1, maxLength: 100 }),
      option.string("type", "Choose tracks, playlists, or both", false, { choices: searchTypeChoices }),
    ],
  },
  {
    name: "upload",
    description: "Upload an MP3 and optionally add it to playlists.",
    options: [
      { kind: "attachment", name: "file", description: "MP3 file to upload", required: true },
      option.string("playlists", "Optional space-separated playlist names", false, { maxLength: 5000 }),
    ],
  },
  {
    name: "help",
    description: "Show bot commands and supported behavior.",
    options: [
      option.string("topic", "Help selector", false, {
        choices: helpSelectors.map((value) => ({ name: value, value })),
      }),
    ],
  },
  {
    name: "setgreeting",
    description: "Set your track or playlist greeting.",
    options: [
      option.string("name", "Track or playlist name", true, { maxLength: 45 }),
      option.string("type", "Resolve a name collision", false, {
        choices: [
          { name: "Track", value: "track" },
          { name: "Playlist", value: "playlist" },
        ],
      }),
    ],
  },
  { name: "getgreeting", description: "Show your greeting." },
  { name: "delgreeting", description: "Clear your greeting." },
  {
    name: "setfarewell",
    description: "Set your short farewell track.",
    options: [option.string("track", "Track name", true, { maxLength: 15 })],
  },
  { name: "getfarewell", description: "Show your farewell." },
  { name: "delfarewell", description: "Clear your farewell." },
  {
    name: "newplaylist",
    description: "Create a playlist.",
    options: [option.string("name", "Playlist name", true, { maxLength: 45 })],
  },
  {
    name: "delplaylist",
    description: "Delete an empty playlist.",
    options: [option.string("name", "Playlist name", true, { maxLength: 45 })],
  },
  {
    name: "addtoplaylist",
    description: "Add tracks to one playlist.",
    options: [
      option.string("playlist", "Playlist name", true, { maxLength: 45 }),
      option.string("tracks", "Space-separated track names", true, { maxLength: 5000 }),
    ],
  },
  {
    name: "delfromplaylist",
    description: "Remove tracks from one playlist.",
    options: [
      option.string("playlist", "Playlist name", true, { maxLength: 45 }),
      option.string("tracks", "Space-separated track names", true, { maxLength: 5000 }),
    ],
  },
  {
    name: "addplayliststo",
    description: "Add one track to several playlists.",
    options: [
      option.string("track", "Track name", true, { maxLength: 15 }),
      option.string("playlists", "Space-separated playlist names", true, { maxLength: 5000 }),
    ],
  },
  {
    name: "delplaylistsfrom",
    description: "Remove one track from several playlists.",
    options: [
      option.string("track", "Track name", true, { maxLength: 15 }),
      option.string("playlists", "Space-separated playlist names", true, { maxLength: 5000 }),
    ],
  },
];

function buildCommand(spec: CommandSpec) {
  const builder = new SlashCommandBuilder().setName(spec.name).setDescription(spec.description);
  for (const item of spec.options ?? []) {
    if (item.kind === "string") {
      builder.addStringOption((commandOption) => {
        commandOption
          .setName(item.name)
          .setDescription(item.description)
          .setRequired(item.required ?? false);
        if (item.minLength !== undefined) commandOption.setMinLength(item.minLength);
        if (item.maxLength !== undefined) commandOption.setMaxLength(item.maxLength);
        if (item.choices) commandOption.addChoices(...item.choices);
        return commandOption;
      });
    } else if (item.kind === "integer") {
      builder.addIntegerOption((commandOption) => {
        commandOption
          .setName(item.name)
          .setDescription(item.description)
          .setRequired(item.required ?? false);
        if (item.minValue !== undefined) commandOption.setMinValue(item.minValue);
        if (item.maxValue !== undefined) commandOption.setMaxValue(item.maxValue);
        return commandOption;
      });
    } else {
      builder.addAttachmentOption((commandOption) =>
        commandOption
          .setName(item.name)
          .setDescription(item.description)
          .setRequired(item.required ?? false),
      );
    }
  }
  return builder.toJSON();
}

const expectedNames = new Set([...commands.map(({ name }) => name)].sort());
if (commandSpecs.length !== expectedNames.size || commandSpecs.some(({ name }) => !expectedNames.has(name)))
  throw new Error("Slash-command definitions must cover each registered command exactly once.");

export const slashCommandDefinitions = commandSpecs.map(buildCommand);

function splitNames(value: string | null): string[] {
  return value?.trim().split(/\s+/).filter(Boolean) ?? [];
}

function sourceTokens(interaction: ChatInputCommandInteraction): string[] {
  const source = interaction.options.getString("source");
  const playlist = interaction.options.getString("playlist");
  const length = interaction.options.getInteger("length");
  const tokens: string[] = [];
  if (source) tokens.push(`source:${source}`);
  if (playlist) tokens.push(`playlist:${playlist}`);
  if (length !== null) {
    if (!tokens.length) tokens.push("source:all_tracks");
    tokens.push(String(length));
  }
  return tokens;
}

export function slashCommandTokens(interaction: ChatInputCommandInteraction): string[] {
  const get = (name: string) => interaction.options.getString(name, true);
  switch (interaction.commandName) {
    case "p":
    case "setfarewell":
      return [get(interaction.commandName === "p" ? "track" : "track")];
    case "pr":
    case "list":
      return sourceTokens(interaction);
    case "search":
      return [get("query"), `type:${interaction.options.getString("type") ?? "both"}`];
    case "raid":
      return [get("track"), String(interaction.options.getInteger("channel_number", true))];
    case "upload":
      return splitNames(interaction.options.getString("playlists"));
    case "help":
      return [interaction.options.getString("topic") ?? helpSelectors[0]];
    case "setgreeting": {
      const type = interaction.options.getString("type");
      const alias = type === "track" ? "file" : type;
      return [get("name"), ...(alias ? [alias] : [])];
    }
    case "getgreeting":
    case "delgreeting":
    case "getfarewell":
    case "delfarewell":
      return [];
    case "newplaylist":
    case "delplaylist":
      return [get("name")];
    case "addtoplaylist":
    case "delfromplaylist":
      return [get("playlist"), ...splitNames(get("tracks"))];
    case "addplayliststo":
    case "delplaylistsfrom":
      return [get("track"), ...splitNames(get("playlists"))];
    default:
      return [];
  }
}
