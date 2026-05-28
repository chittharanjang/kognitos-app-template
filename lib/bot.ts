import { Chat } from "chat";
import { createTeamsAdapter } from "@chat-adapter/teams";
import { createPostgresState } from "@chat-adapter/state-pg";
import type { Message, Thread } from "chat";
import { streamAnswer, type ChatTurn } from "@/lib/chat/answer-engine";

/**
 * Microsoft Teams bot for the SQL Query Assistant.
 *
 * Built on the Vercel Chat SDK. The bot reuses the exact same Claude + SQL
 * tool reasoning as the web chat by piping `streamAnswer()` into
 * `thread.post()`. Teams renders the response with native streaming in DMs and
 * a single buffered message in channels.
 *
 * Required environment variables (see `.env.example`):
 *   TEAMS_APP_ID         — Microsoft (Bot Framework / Azure AD) app ID
 *   TEAMS_APP_PASSWORD   — client secret for that app
 *   TEAMS_APP_TENANT_ID  — (single-tenant only) Azure AD tenant ID
 *   POSTGRES_URL         — Postgres connection string for bot state
 *                          (subscriptions, locks, dedupe, thread history)
 */

/** Per-thread state: a capped rolling transcript for multi-turn context. */
interface BotThreadState {
  history?: ChatTurn[];
}

/** Keep enough turns for useful context without unbounded prompt growth. */
const MAX_HISTORY_TURNS = 20;

const adapters = {
  teams: createTeamsAdapter(),
};

const stateUrl =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.BOT_STATE_DATABASE_URL;

export const bot = new Chat<typeof adapters, BotThreadState>({
  userName: "SQL Query Assistant",
  adapters,
  state: createPostgresState({ url: stateUrl }),
  // Channels: only auto-answer when it's a focused 1:1-style conversation
  // is handled per-handler below. Drop overlapping messages on a busy thread.
  concurrency: "drop",
}).registerSingleton();

/**
 * Core responder shared by DM and channel-mention handlers. Loads the
 * thread's rolling history, streams a fresh answer, and persists the turn.
 */
async function respond(thread: Thread<BotThreadState>, message: Message): Promise<void> {
  const text = (message.text ?? "").trim();
  if (!text) return;

  const state = await thread.state;
  const history: ChatTurn[] = state?.history ?? [];
  const turns: ChatTurn[] = [...history, { role: "user", content: text }];

  await thread.startTyping();

  // Tee the stream: forward chunks to Teams while accumulating the full text
  // so we can persist it as the assistant turn for future context.
  let full = "";
  async function* teed(): AsyncGenerator<string, void, unknown> {
    for await (const chunk of streamAnswer(turns)) {
      full += chunk;
      yield chunk;
    }
  }

  await thread.post(teed());

  const assistantTurn: ChatTurn = { role: "assistant", content: full.trim() };
  const nextHistory: ChatTurn[] = [...turns, assistantTurn].slice(-MAX_HISTORY_TURNS);

  await thread.setState({ history: nextHistory }, { replace: true });
}

async function safeRespond(thread: Thread<BotThreadState>, message: Message): Promise<void> {
  try {
    await respond(thread, message);
  } catch (err) {
    console.error("[teams-bot] respond failed:", err);
    try {
      await thread.post(
        "Sorry — I hit an error answering that. Please try again in a moment."
      );
    } catch {
      /* thread may be unavailable; nothing else to do */
    }
  }
}

// Direct (1:1) messages with the bot — the primary Teams entry point.
bot.onDirectMessage(async (thread, message) => {
  await safeRespond(thread, message);
});

// First @-mention in a channel/group thread: subscribe so follow-ups continue
// without requiring another mention, then answer.
bot.onNewMention(async (thread, message) => {
  await thread.subscribe();
  await safeRespond(thread, message);
});

// Follow-up messages in a thread the bot is already watching.
bot.onSubscribedMessage(async (thread, message) => {
  // Let users end the conversation explicitly.
  if (/^\s*(stop|unsubscribe|bye)\s*$/i.test(message.text ?? "")) {
    await thread.unsubscribe();
    await thread.post("Okay — I'll stop following this thread. @-mention me to start again.");
    return;
  }
  await safeRespond(thread, message);
});

export default bot;
