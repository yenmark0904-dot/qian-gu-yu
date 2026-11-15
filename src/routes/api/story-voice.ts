import { createFileRoute } from "@tanstack/react-router";
import { RateLimiter } from "@/game/feedback";
import { storyVoiceSpokenText } from "@/game/story-voice";
import { STORY_VOICE_LANGUAGE_CODE, STORY_VOICE_MODEL, storyVoiceId } from "@/game/story-voice-cast";

const MAX_TEXT = 2000;
const noStore = { "cache-control": "no-store" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...noStore } });

const g = globalThis as typeof globalThis & { __qgyStoryVoiceLimit__?: RateLimiter };
const limit = (g.__qgyStoryVoiceLimit__ ??= new RateLimiter(60_000, 80));

async function synthesize(request: Request): Promise<Response> {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return json(403, { error: "forbidden" });
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_TEXT + 512) return json(413, { error: "too_large" });
  let body: { text?: unknown; speaker?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const spoken = storyVoiceSpokenText(typeof body.text === "string" ? body.text : "");
  if (!spoken) return json(400, { error: "empty" });
  if (Array.from(spoken).length > MAX_TEXT) return json(413, { error: "too_large" });
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return json(503, { error: "not_configured" });
  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "").trim() || "unknown";
  const now = Date.now();
  if (!limit.allowed(ip, now)) return json(429, { error: "rate_limited" });
  limit.record(ip, now);
  const speaker = typeof body.speaker === "string" ? body.speaker : "";
  const voiceId = storyVoiceId(speaker);
  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        accept: "audio/mpeg",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: spoken, model_id: STORY_VOICE_MODEL, language_code: STORY_VOICE_LANGUAGE_CODE }),
    });
    if (!upstream.ok) {
      return json(502, { error: "upstream" });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "audio/mpeg",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return json(502, { error: "upstream" });
  }
}

export const Route = createFileRoute("/api/story-voice")({
  server: {
    handlers: {
      POST: ({ request }) => synthesize(request),
    },
  },
});
