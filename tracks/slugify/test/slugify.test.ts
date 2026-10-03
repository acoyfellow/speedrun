import { expect, test } from "bun:test";
import { slugify } from "../src/slugify";

test("simple words", () => {
  expect(slugify("Hello World")).toBe("hello-world");
});

test("collapses repeated whitespace and dashes", () => {
  expect(slugify("Hello   World")).toBe("hello-world");
  expect(slugify("a - b")).toBe("a-b");
});

test("drops punctuation", () => {
  expect(slugify("What's up, Doc?")).toBe("whats-up-doc");
});
