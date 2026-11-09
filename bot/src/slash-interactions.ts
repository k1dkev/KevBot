import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import type { BotConfig } from "./config.js";
import type { Dispatcher } from "./dispatcher.js";
import type { BotLogger } from "./logging.js";
import { bounded, splitReply } from "./replies.js";
import { slashCommandTokens } from "./slash-commands.js";

const allowedMentions = { parse: [], repliedUser: false } as const;
const replyBudgetMessage = "This reply is too long to display. Narrow the request and try again.";

export async function sendEphemeralResponse(
  interaction: ChatInputCommandInteraction,
  content: string,
  config: BotConfig,
  log: BotLogger,
): Promise<boolean> {
  let chunks: string[];
  try {
    chunks = splitReply(content || "Command completed.", 2000, config.DM_MAX_MESSAGES);
  } catch {
    chunks = [replyBudgetMessage];
  }
  try {
    await bounded(
      interaction.editReply({ content: chunks[0] ?? "Command completed.", allowedMentions }),
      config.DISCORD_REQUEST_TIMEOUT_MS,
    );
    for (const chunk of chunks.slice(1)) {
      await bounded(
        interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral, allowedMentions }),
        config.DISCORD_REQUEST_TIMEOUT_MS,
      );
    }
    return true;
  } catch {
    log.warn({ component: "replies", reason: "ephemeral_delivery_failed" }, "reply.ephemeral.failed");
    return false;
  }
}

export async function handleSlashInteraction(
  interaction: ChatInputCommandInteraction,
  dispatcher: Dispatcher,
  config: BotConfig,
  log: BotLogger,
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch {
    log.warn({ component: "commands", reason: "interaction_acknowledgement_failed" }, "command.interaction.failed");
    return;
  }

  let response: string;
  try {
    const attachment = interaction.options.getAttachment("file");
    const attachments = attachment
      ? [
          {
            name: attachment.name,
            url: attachment.url,
            size: attachment.size,
            contentType: attachment.contentType,
          },
        ]
      : [];
    response = await dispatcher.handleSlash({
      id: interaction.id,
      commandName: interaction.commandName,
      tokens: slashCommandTokens(interaction),
      authorDiscordId: interaction.user.id,
      guildId: interaction.guildId,
      voiceChannelId: interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId ?? null,
      attachments,
    });
  } catch {
    log.warn({ component: "commands", reason: "interaction_dispatch_failed" }, "command.interaction.failed");
    response = "The command could not be completed. Please try again later.";
  }
  await sendEphemeralResponse(interaction, response, config, log);
}
