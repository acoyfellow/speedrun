import { expect, test } from "bun:test";
import { LruCache } from "../src/lru";

test("evicts the oldest entry", () => {
  const cache = new LruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  expect(cache.get("a")).toBeUndefined();
  expect(cache.size).toBe(2);
});

test("reading a key makes it recent", () => {
  const cache = new LruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  expect(cache.get("a")).toBe(1);
  cache.set("c", 3);
  expect(cache.get("a")).toBe(1);
  expect(cache.get("b")).toBeUndefined();
});
