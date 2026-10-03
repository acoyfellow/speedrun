export const trackFiles: Record<string, Record<string, string>> = {
  "lru": {
    "test/lru.test.ts": "import { expect, test } from \"bun:test\";\nimport { LruCache } from \"../src/lru\";\n\ntest(\"evicts the oldest entry\", () => {\n  const cache = new LruCache<string, number>(2);\n  cache.set(\"a\", 1);\n  cache.set(\"b\", 2);\n  cache.set(\"c\", 3);\n  expect(cache.get(\"a\")).toBeUndefined();\n  expect(cache.size).toBe(2);\n});\n\ntest(\"reading a key makes it recent\", () => {\n  const cache = new LruCache<string, number>(2);\n  cache.set(\"a\", 1);\n  cache.set(\"b\", 2);\n  expect(cache.get(\"a\")).toBe(1);\n  cache.set(\"c\", 3);\n  expect(cache.get(\"a\")).toBe(1);\n  expect(cache.get(\"b\")).toBeUndefined();\n});\n",
    "README.md": "# lru\n\nA tiny LRU cache. Users report that recently read keys still get evicted first.\n",
    "package.json": "{ \"name\": \"track-lru\", \"private\": true, \"type\": \"module\", \"scripts\": { \"test\": \"bun test\" } }\n",
    "src/lru.ts": "export class LruCache<K, V> {\n  private readonly entries = new Map<K, V>();\n\n  constructor(private readonly capacity: number) {}\n\n  get(key: K): V | undefined {\n    return this.entries.get(key);\n  }\n\n  set(key: K, value: V): void {\n    this.entries.delete(key);\n    this.entries.set(key, value);\n    if (this.entries.size > this.capacity) {\n      const oldest = this.entries.keys().next();\n      if (!oldest.done) {\n        this.entries.delete(oldest.value);\n      }\n    }\n  }\n\n  get size(): number {\n    return this.entries.size;\n  }\n}\n"
  },
  "roman": {
    "test/roman.test.ts": "import { expect, test } from \"bun:test\";\nimport { toRoman } from \"../src/roman\";\n\ntest(\"additive values\", () => {\n  expect(toRoman(3)).toBe(\"III\");\n  expect(toRoman(2023)).toBe(\"MMXXIII\");\n});\n\ntest(\"subtractive values\", () => {\n  expect(toRoman(4)).toBe(\"IV\");\n  expect(toRoman(9)).toBe(\"IX\");\n  expect(toRoman(1994)).toBe(\"MCMXCIV\");\n});\n\ntest(\"range\", () => {\n  expect(() => toRoman(0)).toThrow(RangeError);\n});\n",
    "README.md": "# roman\n\nConverts integers to roman numerals. Users report `4` renders as `IIII` and `1994` is wrong.\n",
    "package.json": "{ \"name\": \"track-roman\", \"private\": true, \"type\": \"module\", \"scripts\": { \"test\": \"bun test\" } }\n",
    "src/roman.ts": "const numerals: ReadonlyArray<readonly [number, string]> = [\n  [1000, \"M\"],\n  [500, \"D\"],\n  [100, \"C\"],\n  [50, \"L\"],\n  [10, \"X\"],\n  [5, \"V\"],\n  [1, \"I\"],\n];\n\nexport function toRoman(value: number): string {\n  if (!Number.isInteger(value) || value < 1 || value > 3999) {\n    throw new RangeError(\"value must be an integer from 1 to 3999\");\n  }\n  let rest = value;\n  let out = \"\";\n  for (const [amount, symbol] of numerals) {\n    while (rest >= amount) {\n      out += symbol;\n      rest -= amount;\n    }\n  }\n  return out;\n}\n"
  },
  "slugify": {
    "test/slugify.test.ts": "import { expect, test } from \"bun:test\";\nimport { slugify } from \"../src/slugify\";\n\ntest(\"simple words\", () => {\n  expect(slugify(\"Hello World\")).toBe(\"hello-world\");\n});\n\ntest(\"collapses repeated whitespace and dashes\", () => {\n  expect(slugify(\"Hello   World\")).toBe(\"hello-world\");\n  expect(slugify(\"a - b\")).toBe(\"a-b\");\n});\n\ntest(\"drops punctuation\", () => {\n  expect(slugify(\"What's up, Doc?\")).toBe(\"whats-up-doc\");\n});\n",
    "README.md": "# slugify\n\nTurns titles into URL slugs. Users report that `\"Hello   World\"` becomes `hello---world`.\n",
    "package.json": "{ \"name\": \"track-slugify\", \"private\": true, \"type\": \"module\", \"scripts\": { \"test\": \"bun test\" } }\n",
    "src/slugify.ts": "export function slugify(input: string): string {\n  return input\n    .trim()\n    .toLowerCase()\n    .replace(/[^a-z0-9\\s-]/g, \"\")\n    .replace(/\\s/g, \"-\");\n}\n"
  }
};
