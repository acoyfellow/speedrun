import { expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));

const { decideStart } = await import("../src/governor");

const { clientWindowMs } = await import("../src/config");

const front = (await import("../src/front")).default;

const now = 50_000_000;

test("first start from a visitor is allowed and recorded", () => {
  const verdict = decideStart({ starts: [], clients: {} }, "a", now);

  expect(verdict.allowed).toBe(true);
  expect(verdict.ledger.clients.a).toBe(now);
  expect(verdict.ledger.starts).toEqual([now]);
});

test("same visitor within 10 minutes is refused with a retry time", () => {
  const verdict = decideStart({ starts: [now - 1000], clients: { a: now - 1000 } }, "a", now);

  expect(verdict.reason).toBe("client");
  expect(verdict.retryAfterMs).toBe(clientWindowMs - 1000);
});

test("same visitor after 10 minutes is allowed again", () => {
  const verdict = decideStart({ starts: [], clients: { a: now - clientWindowMs } }, "a", now);

  expect(verdict.allowed).toBe(true);
});

test("fourth race in an hour is refused for a new visitor", () => {
  const starts = [now - 3000, now - 2000, now - 1000];
  const verdict = decideStart({ starts, clients: {} }, "b", now);

  expect(verdict.reason).toBe("global");
  expect(verdict.retryAfterMs).toBeGreaterThan(0);
  expect(verdict.ledger.clients.b).toBeUndefined();
});

function frontEnv(startAllowed: boolean) {
  const forwarded: string[] = [];

  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    CORE: {
      fetch: async (request: Request) => {
        forwarded.push(request.headers.get("authorization") ?? "none");

        return Response.json({ ok: true });
      },
    },
    START_LIMIT: { limit: async () => ({ success: startAllowed }) },
    API_LIMIT: { limit: async () => ({ success: true }) },
  };

  return { env, forwarded };
}

function post(): Request {
  return new Request("https://x/api/races", { method: "POST", body: JSON.stringify({ track: "roman" }) });
}

test("front forwards a start without any token", async () => {
  const { env, forwarded } = frontEnv(true);
  const response = await front.fetch(post(), env);

  expect(response.status).toBe(200);
  expect(forwarded).toEqual(["none"]);
});

test("front burst limit answers 429 with retry-after", async () => {
  const { env, forwarded } = frontEnv(false);
  const response = await front.fetch(post(), env);

  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(forwarded).toEqual([]);
});
