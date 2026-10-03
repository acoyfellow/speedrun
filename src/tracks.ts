import { trackFiles } from "./track-files.generated";

export type Track = {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly target: string;
  readonly files: Record<string, string>;
};

type TrackInfo = { readonly title: string; readonly brief: string; readonly target: string };

const meta = new Map<string, TrackInfo>(
  Object.entries({
    slugify: {
      title: "Slugify Any%",
      brief: "Repeated whitespace and dashes produce multiple dashes in slugs.",
      target: "src/slugify.ts",
    },
    roman: {
      title: "Roman Numerals Glitchless",
      brief: "Subtractive numerals like IV and XC are never produced.",
      target: "src/roman.ts",
    },
    lru: {
      title: "LRU Cache 100%",
      brief: "Reading a key does not mark it as recently used, so it gets evicted.",
      target: "src/lru.ts",
    },
  }),
);

export function listTracks(): Track[] {
  return Object.entries(trackFiles).flatMap(([id, files]) => {
    const info = meta.get(id);

    return info ? [{ id, files, ...info }] : [];
  });
}

export function getTrack(id: string): Track | null {
  return listTracks().find((track) => track.id === id) ?? null;
}
