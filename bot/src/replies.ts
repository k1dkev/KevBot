import type { BotConfig } from "./config.js";
import type { BotLogger } from "./logging.js";

export interface ReplyPayload {
  content: string;
  allowedMentions: { parse: []; repliedUser: false };
}
export interface CommandAttachment {
  url: string;
  name: string | null;
  size: number;
}
export interface CommandMessage {
  id: string;
  content: string;
  guildId: string | null;
  webhookId?: string | null;
  author: { id: string; bot: boolean; send(payload: ReplyPayload): Promise<unknown> };
  member?: { voice: { channelId: string | null } } | null;
  attachments?: { values(): Iterable<CommandAttachment> };
  reply(payload: ReplyPayload): Promise<unknown>;
}
export const publicDmNotice = "I could not send a private reply. Please enable DMs and try again.";

export function splitReply(content: string, limit = 2000, maxMessages = 8): string[] {
  if (
    !Number.isInteger(limit) ||
    limit < 2 ||
    limit > 2000 ||
    !Number.isInteger(maxMessages) ||
    maxMessages < 1 ||
    maxMessages > 10
  )
    throw new Error("Invalid reply bounds");
  if (content.length > limit * maxMessages) throw new Error("Reply exceeds message budget");
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length) {
    let end = Math.min(limit, remaining.length);
    if (end < remaining.length) {
      const boundary = Math.max(remaining.lastIndexOf("\n", end - 1), remaining.lastIndexOf(" ", end - 1));
      if (boundary > limit / 2) end = boundary + 1;
      const lastCode = remaining.charCodeAt(end - 1);
      if (lastCode >= 0xd800 && lastCode <= 0xdbff) end--;
    }
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
    if (chunks.length > maxMessages) throw new Error("Reply exceeds message budget");
  }
  return chunks;
}

export async function bounded<T>(operation: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Operation timed out")), timeoutMs);
        abort = () => reject(new Error("Operation stopped"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

export class PrivateReplies {
  private readonly failed = new Map<string, number>();
  private readonly busy = new Set<string>();
  private readonly stopped = new AbortController();
  constructor(
    private readonly config: BotConfig,
    private readonly log: BotLogger,
    private readonly now = Date.now,
  ) {}
  close() {
    this.stopped.abort();
    this.failed.clear();
  }
  async send(message: CommandMessage, content: string): Promise<boolean> {
    const user = message.author.id;
    if (this.stopped.signal.aborted || this.busy.has(user) || (this.failed.get(user) ?? 0) > this.now()) return false;
    let chunks: string[];
    try {
      chunks = splitReply(content, 2000, this.config.DM_MAX_MESSAGES);
    } catch {
      chunks = ["This reply exceeds the message budget. Narrow the request and try again."];
    }
    this.busy.add(user);
    const payload = (text: string): ReplyPayload => ({
      content: text,
      allowedMentions: { parse: [], repliedUser: false },
    });
    try {
      for (const chunk of chunks) {
        if (this.stopped.signal.aborted) return false;
        await bounded(message.author.send(payload(chunk)), this.config.DISCORD_REQUEST_TIMEOUT_MS, this.stopped.signal);
      }
      this.failed.delete(user);
      return true;
    } catch {
      if (this.stopped.signal.aborted) return false;
      for (const [key, expires] of this.failed) if (expires <= this.now()) this.failed.delete(key);
      if (this.failed.size >= this.config.ACTOR_CACHE_MAX) this.failed.delete(this.failed.keys().next().value!);
      this.failed.set(user, this.now() + this.config.DM_FAILURE_COOLDOWN_MS);
      this.log.warn({ component: "replies", reason: "private_delivery_failed" }, "reply.private.failed");
      if (message.guildId) {
        // Never echo content, raw exception, command args, user ID or a mention publicly.
        try {
          await bounded(
            message.reply(payload(publicDmNotice)),
            this.config.DISCORD_REQUEST_TIMEOUT_MS,
            this.stopped.signal,
          );
        } catch {
          this.log.debug({ component: "replies", reason: "notice_delivery_failed" }, "reply.notice.failed");
        }
      }
      return false;
    } finally {
      this.busy.delete(user);
    }
  }
}
