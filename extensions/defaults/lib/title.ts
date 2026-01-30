import {
  completeSimple,
  type Api,
  type Message,
  type Model,
  type TextContent,
  type UserMessage,
} from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

const TITLE_PROMPT = `Generate a short title (3-7 words, sentence case) for this coding session based on the user's message. Be concise and capture the main intent. Use common software engineering terms and acronyms when helpful. Do not assume intent beyond what's stated. Output only the title, nothing else.`;

function isTextModel(model: Model<Api>): boolean {
  return model.input.includes("text");
}

/**
 * Pick a "small" model from the models that are actually available (have auth configured).
 *
 * Heuristic:
 * - must support text input
 * - prefer non-reasoning models
 * - prefer models that look small/fast (mini/lite/flash/haiku)
 * - otherwise pick the cheapest by (input+output) cost
 */
function pickSmallAvailableModel(ctx: ExtensionContext): Model<Api> | null {
  const available = ctx.modelRegistry.getAvailable();
  const candidates = available.filter(isTextModel);

  // Fallback to the currently selected model (if any) when no text-capable model is marked as available.
  if (candidates.length === 0) {
    const current = ctx.model as Model<Api> | undefined;
    return current && isTextModel(current) ? current : null;
  }

  const score = (m: Model<Api>): number => {
    // Base on per-1M token price; 0 is allowed (e.g., local/free providers)
    const baseCost = (m.cost.input ?? 0) + (m.cost.output ?? 0);

    const haystack = `${m.provider}/${m.id} ${m.name}`.toLowerCase();

    let s = baseCost;

    // Reasoning models tend to be slower/more expensive for trivial tasks.
    if (m.reasoning) s += 10;

    // Nudge towards "small"-ish model families.
    if (/(mini|lite|flash|haiku|small)/.test(haystack)) s *= 0.5;

    // Nudge away from obviously large/expensive families.
    if (/(opus|ultra|pro|max|large)/.test(haystack)) s *= 2;

    // As a last tie-breaker, slightly prefer smaller context windows.
    s += (m.contextWindow ?? 0) / 1_000_000;

    return s;
  };

  let best: Model<Api> | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const m of candidates) {
    const s = score(m);
    if (s < bestScore) {
      bestScore = s;
      best = m;
    }
  }

  return best;
}

export async function generateTitle(
  text: string,
  ctx: ExtensionContext,
): Promise<string | null> {
  const model = pickSmallAvailableModel(ctx);
  if (!model) return null;

  const apiKey = await ctx.modelRegistry.getApiKey(model);
  if (!apiKey) return null;

  const messages: Message[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: text.slice(0, 500),
        },
      ],
      timestamp: Date.now(),
    },
  ];

  const response = await completeSimple(
    model,
    { systemPrompt: TITLE_PROMPT, messages },
    { apiKey },
  );

  return response.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
}

export function getFirstUserText(ctx: ExtensionContext): string | null {
  const entries = ctx.sessionManager.getEntries();
  const firstUserEntry = entries.find(
    (e) => e.type === "message" && e.message.role === "user",
  );
  if (!firstUserEntry || firstUserEntry.type !== "message") return null;

  const msg = firstUserEntry.message as UserMessage;
  if (typeof msg.content === "string") {
    return msg.content;
  }
  return msg.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join(" ");
}
