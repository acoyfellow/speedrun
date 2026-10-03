import { readdir } from "node:fs/promises";
import { join } from "node:path";

type TrackFiles = Record<string, string>;

async function collect(dir: string, prefix = ""): Promise<TrackFiles> {
  const out: TrackFiles = {};

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);

    if (entry.isDirectory()) Object.assign(out, await collect(full, rel));
    else out[rel] = await Bun.file(full).text();
  }

  return out;
}

const base = join(import.meta.dir, "..", "tracks");

const names = (await readdir(base, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

const tracks: Record<string, TrackFiles> = {};

for (const name of names.sort()) tracks[name] = await collect(join(base, name));

await Bun.write(
  join(import.meta.dir, "..", "src", "track-files.generated.ts"),
  `export const trackFiles: Record<string, Record<string, string>> = ${JSON.stringify(tracks, null, 2)};\n`,
);
