export function formatMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const centis = Math.floor((safe % 1000) / 10);

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
}

export const splitLabels = {
  found_file: "Found file",
  first_edit: "First edit",
  tests_green: "Tests green",
  verified: "Verified",
} as const;

export type SplitTone = "gold" | "green" | "red" | "pending";

export function splitTone(elapsed: number | undefined, best: number | undefined, bluffed: boolean): SplitTone {
  if (elapsed === undefined) return bluffed ? "red" : "pending";

  if (best !== undefined && elapsed <= best) return "gold";

  return "green";
}

const vendorLabels = [
  ["@cf/moonshotai/kimi-k2.7-code", "Moonshot AI Kimi K2.7 Code"],
  ["@cf/zai-org/glm-5.3", "Z.ai GLM 5.3"],
  ["@cf/deepseek-ai/deepseek-v4-pro-0813", "DeepSeek V4 Pro"],
] as const;

export function modelLabel(model: string, fallback: string): string {
  return vendorLabels.find(([id]) => id === model)?.[1] ?? fallback;
}
