export const racesPerHour = 3;

export const clientWindowMs = 10 * 60 * 1000;

export const raceTimeoutMs = 10 * 60 * 1000;

export const raceTokenCap = 600_000;

export const runnerTokenCap = 200_000;

export const maxStepsPerRunner = 30;

export const bluffPenaltyMs = 30_000;

export const maxBluffs = 3;

export const containerSleepAfter = "2m";

export const gatewayId = "default";

export const clefModel = "@cf/cloudflare/clef";

export const clefQuestion = "Do these test results show all tests passing?";

export type ModelPricing = { readonly input: number; readonly output: number };

export const roster = [
  {
    id: "kimi",
    model: "@cf/moonshotai/kimi-k2.7-code",
    label: "Moonshot AI Kimi K2.7 Code",
    price: { input: 0.95, output: 4 },
  },
  { id: "glm", model: "@cf/zai-org/glm-5.3", label: "Z.ai GLM 5.3", price: { input: 1.4, output: 4.4 } },
  {
    id: "deepseek",
    model: "@cf/deepseek-ai/deepseek-v4-pro-0813",
    label: "DeepSeek V4 Pro",
    price: { input: 1.32, output: 3.96 },
  },
] as const;

export type RosterEntry = (typeof roster)[number];

export type RunnerModel = RosterEntry["model"];

export function costUsd(price: ModelPricing, inputTokens: number, outputTokens: number): number {
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
