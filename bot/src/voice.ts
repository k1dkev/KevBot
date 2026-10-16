import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  StreamType,
} from "@discordjs/voice";
import { ChannelType, PermissionFlagsBits, type Client, type Guild, type VoiceChannel } from "discord.js";
import { once } from "node:events";
import { Readable } from "node:stream";
import { bounded } from "./replies.js";
import type { BotLogger } from "./logging.js";

export interface VoiceTarget {
  guildId: string;
  channelId: string;
}

export interface VoicePlatform {
  callerChannel(guildId: string, channelId: string | null): VoiceTarget | undefined;
  numberedChannel(guildId: string, channelNumber: number): VoiceTarget | undefined;
  play(target: VoiceTarget, audio: Buffer, onStarted: () => Promise<void>): Promise<void>;
  close(): void;
}

const CONNECTION_TIMEOUT_MS = 15_000;
const START_TIMEOUT_MS = 12_000;
const PLAYBACK_TIMEOUT_MS = 30_000;
const RECONNECT_GRACE_MS = 5_000;

export class DiscordVoicePlatform implements VoicePlatform {
  private readonly sessions = new Map<
    string,
    { connection: ReturnType<typeof joinVoiceChannel>; player: ReturnType<typeof createAudioPlayer> }
  >();
  private closed = false;

  constructor(
    private readonly client: Client,
    private readonly log: BotLogger,
  ) {}

  private getGuildChannel(guildId: string, channelId: string): { guild: Guild; channel: VoiceChannel } | undefined {
    const guild = this.client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);
    if (!guild || !channel || channel.type !== ChannelType.GuildVoice) return undefined;
    return { guild, channel };
  }

  callerChannel(guildId: string, channelId: string | null): VoiceTarget | undefined {
    if (!channelId || !this.getGuildChannel(guildId, channelId)) return undefined;
    return { guildId, channelId };
  }

  numberedChannel(guildId: string, channelNumber: number): VoiceTarget | undefined {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild || !Number.isSafeInteger(channelNumber) || channelNumber < 1) return undefined;
    const channels = [...guild.channels.cache.values()]
      .filter((channel): channel is VoiceChannel => channel.type === ChannelType.GuildVoice)
      .sort((left, right) => {
        const leftGroupPosition = left.parent?.rawPosition ?? left.rawPosition;
        const rightGroupPosition = right.parent?.rawPosition ?? right.rawPosition;
        return (
          leftGroupPosition - rightGroupPosition ||
          left.rawPosition - right.rawPosition ||
          left.id.localeCompare(right.id)
        );
      });
    const channel = channels[channelNumber - 1];
    return channel ? { guildId, channelId: channel.id } : undefined;
  }

  async play(target: VoiceTarget, audio: Buffer, onStarted: () => Promise<void>): Promise<void> {
    if (this.closed) throw new Error("voice_closed");
    const resolved = this.getGuildChannel(target.guildId, target.channelId);
    if (!resolved) throw new Error("voice_channel_missing");
    const { guild, channel } = resolved;
    const botMember = guild.members.me;
    if (!botMember || !channel.permissionsFor(botMember)?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]))
      throw new Error("voice_permission_denied");
    if (!audio.length) throw new Error("voice_empty_audio");

    const stale = getVoiceConnection(guild.id);
    stale?.destroy();
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });
    this.sessions.set(guild.id, { connection, player });

    let rejectFailure!: (error: Error) => void;
    const failed = new Promise<never>((_resolve, reject) => {
      rejectFailure = reject;
    });
    const onVoiceError = () => rejectFailure(new Error("voice_connection_failed"));
    const onPlayerError = () => rejectFailure(new Error("voice_playback_failed"));
    const onDisconnected = () => {
      void Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, RECONNECT_GRACE_MS),
        entersState(connection, VoiceConnectionStatus.Connecting, RECONNECT_GRACE_MS),
      ]).catch(() => {
        connection.destroy();
        rejectFailure(new Error("voice_disconnected"));
      });
    };

    connection.on("error", onVoiceError);
    connection.on(VoiceConnectionStatus.Disconnected, onDisconnected);
    player.on("error", onPlayerError);
    try {
      await bounded(
        Promise.race([entersState(connection, VoiceConnectionStatus.Ready, CONNECTION_TIMEOUT_MS), failed]),
        CONNECTION_TIMEOUT_MS,
      );
      const subscription = connection.subscribe(player);
      if (!subscription) throw new Error("voice_subscription_failed");
      const completed = once(player, AudioPlayerStatus.Idle);
      const resource = createAudioResource(Readable.from([audio]), { inputType: StreamType.Arbitrary });
      player.play(resource);
      await bounded(
        Promise.race([entersState(player, AudioPlayerStatus.Playing, START_TIMEOUT_MS), failed]),
        START_TIMEOUT_MS,
      );
      await onStarted();
      await bounded(Promise.race([completed, failed]), PLAYBACK_TIMEOUT_MS);
      if (this.closed) throw new Error("voice_closed");
    } finally {
      connection.off("error", onVoiceError);
      connection.off(VoiceConnectionStatus.Disconnected, onDisconnected);
      player.off("error", onPlayerError);
      player.stop(true);
      if (this.sessions.get(guild.id)?.connection === connection) this.sessions.delete(guild.id);
      if (getVoiceConnection(guild.id) === connection) connection.destroy();
    }
  }

  close(): void {
    this.closed = true;
    for (const { connection, player } of this.sessions.values()) {
      player.stop(true);
      connection.destroy();
    }
    this.sessions.clear();
    this.log.debug({ component: "voice", reason: "sessions_closed" }, "voice.shutdown.completed");
  }
}
