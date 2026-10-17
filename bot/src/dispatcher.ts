import { randomUUID } from "node:crypto";
import { ApiClientError, apiUserMessage, BotApiClient, discordIdSchema } from "./api-client.js";
import { commandRegistry, parseCommand, UsageError, type CommandDefinition } from "./commands.js";
import { PlaybackError, playbackUserMessage, type PlaybackService } from "./playback.js";
import type { BotConfig } from "./config.js";
import type { BotLogger } from "./logging.js";
import { PrivateReplies, type CommandMessage } from "./replies.js";

export class Dispatcher {
  private readonly last = new Map<string, number>();
  private readonly messages = new Map<string, number>();
  private readonly users = new Set<string>();
  private stopped = false;
  private active = 0;
  constructor(
    private readonly config: BotConfig,
    private readonly api: BotApiClient,
    private readonly replies: PrivateReplies,
    private readonly log: BotLogger,
    private readonly registry: ReadonlyMap<string, CommandDefinition> = commandRegistry,
    private readonly now = Date.now,
    private readonly playback?: PlaybackService,
  ) {}
  close() {
    this.stopped = true;
    this.messages.clear();
    this.last.clear();
  }

  async handle(message: CommandMessage): Promise<void> {
    if (
      this.stopped ||
      message.author.bot ||
      message.webhookId ||
      !discordIdSchema.safeParse(message.author.id).success ||
      !message.content.trim().startsWith(this.config.COMMAND_PREFIX)
    )
      return;
    const user = message.author.id;
    for (const [id, expires] of this.messages) if (expires <= this.now()) this.messages.delete(id);
    if (
      this.messages.has(message.id) ||
      this.users.has(user) ||
      this.active >= this.config.MAX_CONCURRENT_COMMANDS ||
      (this.last.get(user) ?? -Infinity) + this.config.COMMAND_COOLDOWN_MS > this.now()
    )
      return;
    if (this.messages.size >= 1000) this.messages.delete(this.messages.keys().next().value!);
    this.messages.set(message.id, this.now() + 300000);
    if (this.last.size >= this.config.ACTOR_CACHE_MAX) this.last.delete(this.last.keys().next().value!);
    this.last.set(user, this.now());
    this.users.add(user);
    this.active++;
    const log = this.log.child({ component: "commands", requestId: randomUUID() });
    let definition: CommandDefinition | undefined;
    let response: string;
    try {
      const command = parseCommand(message.content, this.config.COMMAND_PREFIX);
      if (!command) throw new UsageError("Invalid command prefix.");
      definition = this.registry.get(command.command);
      if (!definition) throw new UsageError(`Unknown command. Use ${this.config.COMMAND_PREFIX}help!kb.`);
      const args = definition.validate(command.tokens);
      if (definition.guildOnly && !message.guildId) throw new UsageError("This command requires a guild context.");
      if (!definition.execute) {
        response = `${definition.name} is registered but not implemented yet (#${definition.followup}). No library or voice operation was performed.`;
        log.debug({ command: definition.name, reason: "not_implemented" }, "command.pending");
      } else {
        response = await definition.execute({
          prefix: this.config.COMMAND_PREFIX,
          args,
          authorDiscordId: user,
          guildId: message.guildId,
          voiceChannelId: message.member?.voice.channelId ?? null,
          attachments: message.attachments ? Array.from(message.attachments.values()) : [],
          api: this.api,
          playback: this.playback,
        });
        log.info({ command: definition.name }, "command.completed");
      }
    } catch (error) {
      if (error instanceof UsageError)
        response = `${error.message}${definition ? ` Usage: ${this.config.COMMAND_PREFIX}${definition.usage}` : ""}`;
      else {
        response =
          error instanceof ApiClientError
            ? apiUserMessage(error)
            : error instanceof PlaybackError
              ? playbackUserMessage(error)
              : "The command could not be completed. Please try again later.";
        log.warn(
          {
            reason:
              error instanceof ApiClientError
                ? error.kind
                : error instanceof PlaybackError
                  ? error.reason
                  : "unexpected_failure",
          },
          "command.failed",
        );
      }
    }
    // Reply delivery owns its errors; never attempt a second private reply from a catch.
    try {
      await this.replies.send(message, response);
    } finally {
      this.active--;
      this.users.delete(user);
    }
  }
}
