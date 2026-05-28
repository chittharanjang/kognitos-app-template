import { bot } from "@/lib/bot";

/**
 * Microsoft Teams (Bot Framework) webhook.
 *
 * Register this URL as the bot's "Messaging endpoint" in Azure Bot Service:
 *   https://<your-domain>/api/webhooks/teams
 *
 * The Chat SDK verifies the inbound Bot Framework JWT, parses the activity,
 * and routes it to the handlers registered in `lib/bot.ts`.
 */

// Must run on the Node.js runtime — the Teams adapter and `pg` need Node APIs.
export const runtime = "nodejs";
// Never statically cache a webhook.
export const dynamic = "force-dynamic";
// Tool loops + streaming can take a while; give the function headroom.
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  return bot.webhooks.teams(request);
}
