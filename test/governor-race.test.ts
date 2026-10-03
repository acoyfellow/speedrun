import { expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));

mock.module("@cloudflare/containers", () => ({ Container: class {} }));

const { decide } = await import("../src/governor");

const { newRace, rankRunners } = await import("../src/race");

const { costUsd, roster } = await import("../src/config");

const { listTracks } = await import("../src/tracks");

const { RaceState } = await import("../src/schemas");

test("governor allows three races per hour then blocks", () => {
  const now = 10_000_000;
  const first = decide([], now);
  expect(first.allowed).toBe(true);
  const full = decide([now - 1000, now - 2000, now - 3000], now);
  expect(full.allowed).toBe(false);
  expect(full.retryAfterMs).toBeGreaterThan(0);
  expect(decide([now - 3_700_000, now - 1000, now - 2000], now).allowed).toBe(true);
});

test("new race validates and has three distinct models", () => {
  const race = RaceState.parse(newRace("abc", "slugify", 1));
  expect(race.runners).toHaveLength(3);
  expect(new Set(race.runners.map((r) => r.model)).size).toBe(3);
  expect(roster[0].model).toContain("kimi-k2");
});

test("ranking puts finishers first by final time", () => {
  const race = newRace("abc", "slugify", 1);
  const [a, b, c] = race.runners;

  if (!a || !b || !c) throw new Error("missing runners");
  a.finalMs = 5000;
  c.finalMs = 3000;
  expect(rankRunners(race.runners).map((r) => r.id)).toEqual([c.id, a.id, b.id]);
});

test("cost is per million tokens", () => {
  expect(costUsd({ input: 1, output: 2 }, 1_000_000, 500_000)).toBe(2);
});

test("ships three tracks each with a failing test", () => {
  const tracks = listTracks();
  expect(tracks.map((t) => t.id).sort()).toEqual(["lru", "roman", "slugify"]);

  for (const track of tracks) {
    expect(track.files[track.target]).toBeDefined();
    expect(Object.keys(track.files).some((path) => path.startsWith("test/"))).toBe(true);
  }
});
