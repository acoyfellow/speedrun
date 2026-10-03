import { type RaceState, StartRaceInput } from "./schemas";
import { listTracks } from "./tracks";

export { RunnerContainer } from "./container";

export { Governor } from "./governor";

export { RaceRoom } from "./race";

type TrackSummary = { readonly id: string; readonly title: string; readonly brief: string };

type ApiBody =
  | { readonly error: string; readonly retryAfterMs?: number }
  | { readonly race: RaceState }
  | { readonly races: string[] }
  | { readonly tracks: TrackSummary[] };

const limitMessages = {
  client: "You can start one race every 10 minutes. Watch a recent race meanwhile.",
  global: "3 races per hour for everyone. The limit is reached, so watch a recent race.",
} as const;

function json(body: ApiBody, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function newRaceId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
}

async function clientKey(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));

  return [...new Uint8Array(digest).slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function startRace(request: Request, env: Env): Promise<Response> {
  const input = StartRaceInput.safeParse(await request.json().catch(() => null));

  if (!input.success) return json({ error: "track is required" }, 400);

  if (!listTracks().some((track) => track.id === input.data.track)) return json({ error: "unknown track" }, 400);

  const id = newRaceId();
  const decision = await env.GOVERNOR.getByName("global").claim(id, await clientKey(request));

  if (decision.reason !== "ok") {
    const seconds = Math.ceil(decision.retryAfterMs / 1000);

    return Response.json(
      { error: limitMessages[decision.reason], retryAfterMs: decision.retryAfterMs },
      { status: 429, headers: { "cache-control": "no-store", "retry-after": String(seconds) } },
    );
  }

  const race = await env.RACE.getByName(id).start(id, input.data.track);

  return json({ race });
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/api/tracks") {
    return json({ tracks: listTracks().map(({ id, title, brief }) => ({ id, title, brief })) });
  }

  if (url.pathname === "/api/races" && request.method === "POST") return startRace(request, env);

  if (url.pathname === "/api/races" && request.method === "GET") {
    return json({ races: await env.GOVERNOR.getByName("global").recent() });
  }

  const raceId = parts[2];

  if (parts[1] === "races" && raceId && /^[a-z0-9-]{4,40}$/.test(raceId)) {
    if (parts[3] === "ws") return env.RACE.getByName(raceId).fetch(request);

    const race = await env.RACE.getByName(raceId).snapshot();

    return race ? json({ race }) : json({ error: "not found" }, 404);
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleApi(request, env, new URL(request.url));
  },
} satisfies ExportedHandler<Env>;
