import { REST, Routes } from "discord.js";
import { discordIdSchema } from "./api-client.js";
import { slashCommandDefinitions } from "./slash-commands.js";

async function registerCommands() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (
    !token ||
    !discordIdSchema.safeParse(applicationId).success ||
    (guildId && !discordIdSchema.safeParse(guildId).success)
  ) {
    console.error("Set a bot token and valid application ID; the optional guild ID must also be a Discord snowflake.");
    process.exitCode = 1;
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  try {
    const route = guildId
      ? Routes.applicationGuildCommands(applicationId!, guildId)
      : Routes.applicationCommands(applicationId!);
    await rest.put(route, { body: slashCommandDefinitions });
    console.log(
      `Registered ${slashCommandDefinitions.length} KevBot slash commands (${guildId ? "guild" : "global"}).`,
    );
  } catch {
    console.error("Discord command registration failed; verify the application ID, token, and command scope.");
    process.exitCode = 1;
  }
}

void registerCommands();
