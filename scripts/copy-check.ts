import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const arrow = String.fromCharCode(0x2192);

const bannedPhrases = [
  "in today's rapidly evolving landscape",
  "in the realm of",
  "when it comes to",
  "at its core",
  "let's dive into",
  "it's worth noting",
  "it's important to note",
  "a testament to",
  "whether you're",
  "in conclusion",
  "ultimately",
  "game-changer",
  "paradigm shift",
  "seamless",
  "robust",
  "revolutionary",
  "cutting-edge",
  "leverage",
  "unlock",
  "supercharge",
  "effortless",
  "blazing",
  "real containers. real tests.",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    if (statSync(path).isDirectory()) return sourceFiles(path);

    return /\.(svelte|ts|html|webmanifest)$/.test(name) ? [path] : [];
  });
}

function hitsIn(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      const lower = line.toLowerCase().replaceAll("\u2019", "'");
      const found = bannedPhrases.filter((phrase) => lower.includes(phrase));

      if (line.includes(arrow)) found.push("arrow U+2192");

      return found.map((phrase) => `${path}:${index + 1}: ${phrase}`);
    });
}

const files = ["README.md", ...sourceFiles("web"), ...sourceFiles("src")];

const hits = files.flatMap(hitsIn);

for (const hit of hits) console.error(hit);

if (hits.length > 0) process.exit(1);

console.log(`copy-check: ${files.length} files clean`);
