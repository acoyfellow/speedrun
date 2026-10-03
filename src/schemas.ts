import { z } from "zod";

export const splitNames = ["found_file", "first_edit", "tests_green", "verified"] as const;

export const SplitName = z.enum(splitNames);

export type SplitName = z.infer<typeof SplitName>;

export const Split = z.object({ name: SplitName, at: z.number(), elapsedMs: z.number() });

export type Split = z.infer<typeof Split>;

export const RunnerStatus = z.enum(["queued", "booting", "running", "verifying", "verified", "dnf", "error"]);

export type RunnerStatus = z.infer<typeof RunnerStatus>;

export const LogEntry = z.object({
  at: z.number(),
  kind: z.enum(["tool", "think", "bluff", "verify", "error", "info"]),
  text: z.string(),
});

export type LogEntry = z.infer<typeof LogEntry>;

export const Runner = z.object({
  id: z.string(),
  model: z.string(),
  label: z.string(),
  status: RunnerStatus,
  splits: z.array(Split),
  bluffs: z.number(),
  penaltyMs: z.number(),
  finalMs: z.number().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  steps: z.number(),
  diff: z.string(),
  clefScore: z.number().nullable(),
  rerunPassed: z.boolean().nullable(),
  artifact: z.string().nullable(),
  log: z.array(LogEntry),
});

export type Runner = z.infer<typeof Runner>;

export const RaceStatus = z.enum(["pending", "running", "finished", "timeout", "error"]);

export const RaceState = z.object({
  id: z.string(),
  track: z.string(),
  status: RaceStatus,
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  runners: z.array(Runner),
  totalTokens: z.number(),
  tokenCap: z.number(),
  costUsd: z.number(),
  storage: z.string().nullable(),
});

export type RaceState = z.infer<typeof RaceState>;

export const StartRaceInput = z.object({ track: z.string().min(1).max(40) });

export const StartRaceCommand = z.object({ id: z.string(), track: z.string() });

export const ToolCall = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  function: z.object({ name: z.string(), arguments: z.union([z.string(), z.record(z.string(), z.json())]) }),
});

export type ToolCall = z.infer<typeof ToolCall>;

export const ToolArgs = z.record(z.string(), z.json());

export type ToolArgs = z.infer<typeof ToolArgs>;

export const ArgumentsText = z.string().transform((text) => (text.trim() === "" ? "{}" : text));

export const JsonText = z.string().transform((text, ctx) => {
  try {
    return z.json().parse(JSON.parse(text));
  } catch {
    ctx.addIssue({ code: "custom", message: "invalid json" });

    return z.NEVER;
  }
});

export const ChatResponse = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z.array(ToolCall).nullable().optional(),
        }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number().default(0), completion_tokens: z.number().default(0) }).optional(),
});

export type ChatResponse = z.infer<typeof ChatResponse>;

export const ClefResponse = z.object({
  answers: z.object({ pass: z.object({ noul: z.number().min(0).max(1) }) }),
});

export const InitResponse = z.object({ ok: z.boolean(), files: z.array(z.string()) });

export const FilesResponse = z.object({ files: z.array(z.string()) });

export const FileResponse = z.object({ content: z.string() });

export const OkResponse = z.object({ ok: z.boolean() });

export const TestResponse = z.object({ exitCode: z.number(), output: z.string() });

export type TestResult = z.infer<typeof TestResponse>;

export const DiffResponse = z.object({ diff: z.string() });

export const PushResponse = z.object({ ok: z.boolean(), sha: z.string(), log: z.string() });

export const ErrorResponse = z.object({ error: z.string() });

export const PathArgs = z.object({ path: z.string().min(1) });

export const WriteArgs = z.object({ path: z.string().min(1), content: z.string() });

export const DoneArgs = z.object({ message: z.string().default("") });

export const GovernorDecision = z.object({
  allowed: z.boolean(),
  reason: z.enum(["ok", "client", "global"]),
  retryAfterMs: z.number(),
});

export type GovernorDecision = z.infer<typeof GovernorDecision>;
