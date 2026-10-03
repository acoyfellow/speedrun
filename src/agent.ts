import { z } from "zod";
import { bluffPenaltyMs, maxBluffs, maxStepsPerRunner } from "./config";
import {
  ArgumentsText,
  type ChatResponse,
  DoneArgs,
  JsonText,
  PathArgs,
  type SplitName,
  type TestResult,
  ToolArgs,
  type ToolCall,
  WriteArgs,
} from "./schemas";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: OutgoingToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string; name: string };

export type OutgoingToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export function toOutgoing(call: ToolCall, id: string): OutgoingToolCall {
  return { id, type: "function", function: { name: call.function.name, arguments: argumentsText(call) } };
}

export interface Workspace {
  listFiles(): Promise<{ files: string[] }>;
  readFile(path: string): Promise<{ content: string }>;
  writeFile(path: string, content: string): Promise<{ ok: boolean }>;
  runTests(): Promise<TestResult>;
}

export interface Judge {
  clef(rawTestOutput: string): Promise<number>;
}

export interface AgentHooks {
  now(): number;
  split(name: SplitName): void;
  log(kind: "tool" | "think" | "bluff" | "verify" | "error" | "info", text: string): void;
  usage(inputTokens: number, outputTokens: number): void;
  budgetLeft(): boolean;
  deadlinePassed(): boolean;
  verdict(result: { clefScore: number; rerunPassed: boolean }): void;
  bluff(): void;
}

export type AgentOutcome = "verified" | "dnf";

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List every file in the repository.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the repository.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Overwrite a file with the full new content.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_tests",
      description: "Run the test suite with bun test and return the output.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "declare_done",
      description: "Claim the bug is fixed. The referee reruns the tests. A false claim is a bluff penalty.",
      parameters: { type: "object", properties: { message: { type: "string" } }, required: [] },
    },
  },
] as const;

export function systemPrompt(brief: string): string {
  return [
    "You are a speedrunning coding agent. Fix the bug in this small TypeScript repository as fast as possible.",
    `Bug report: ${brief}`,
    "Never edit files under test/. Fix the source code.",
    "Use the tools. Keep steps minimal: list files, read the source and test, write the fix, run tests, then call declare_done.",
    "A referee independently reruns the tests when you declare done. Declaring done with failing tests costs a bluff penalty.",
  ].join("\n");
}

export function argumentsText(call: ToolCall): string {
  const text = z.string().safeParse(call.function.arguments);

  return text.success ? text.data : JSON.stringify(call.function.arguments);
}

export function parseArgs(call: ToolCall): ToolArgs {
  const text = ArgumentsText.pipe(JsonText).pipe(ToolArgs).safeParse(argumentsText(call));

  return text.success ? text.data : {};
}

export function testsPassed(result: TestResult): boolean {
  return result.exitCode === 0 && !/\b[1-9]\d* fail\b/.test(result.output) && /\b[1-9]\d* pass\b/.test(result.output);
}

export function normalizePath(path: string): string {
  let clean = path.trim();

  if (clean.startsWith("./")) clean = clean.slice(2);

  while (clean.startsWith("/")) clean = clean.slice(1);

  return clean;
}

function assistantMessage(content: string, outgoing: OutgoingToolCall[]): ChatMessage {
  if (outgoing.length === 0) return { role: "assistant", content };

  return { role: "assistant", content, tool_calls: outgoing };
}

function truncate(text: string, limit = 6000): string {
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;
}

export type ChatFn = (messages: ChatMessage[]) => Promise<ChatResponse>;

export class RaceAgent {
  private seen = new Set<SplitName>();
  private bluffs = 0;

  constructor(
    private readonly brief: string,
    private readonly target: string,
    private readonly chat: ChatFn,
    private readonly workspace: Workspace,
    private readonly judge: Judge,
    private readonly hooks: AgentHooks,
  ) {}

  private mark(name: SplitName): void {
    if (this.seen.has(name)) return;
    this.seen.add(name);
    this.hooks.split(name);
  }

  private isTestPath(path: string): boolean {
    return normalizePath(path).startsWith("test/");
  }

  async referee(): Promise<{ verified: boolean; report: string }> {
    const rerun = await this.workspace.runTests();
    const rerunPassed = testsPassed(rerun);
    const clefScore = await this.judge.clef(rerun.output);
    this.hooks.verdict({ clefScore, rerunPassed });
    this.hooks.log("verify", `rerun ${rerunPassed ? "PASS" : "FAIL"} · clef ${clefScore.toFixed(3)}`);

    return { verified: rerunPassed, report: truncate(rerun.output, 3000) };
  }

  private async execute(call: ToolCall): Promise<{ content: string; done: boolean }> {
    const args = parseArgs(call);

    switch (call.function.name) {
      case "list_files": {
        const { files } = await this.workspace.listFiles();

        return { content: files.join("\n"), done: false };
      }

      case "read_file": {
        const parsed = PathArgs.safeParse(args);

        if (!parsed.success) return { content: "error: path is required", done: false };
        const normalized = normalizePath(parsed.data.path);
        const { content } = await this.workspace.readFile(normalized);

        if (normalized === this.target) this.mark("found_file");

        return { content: truncate(content), done: false };
      }

      case "write_file": {
        const parsed = WriteArgs.safeParse(args);

        if (!parsed.success) return { content: "error: path and content are required", done: false };

        if (this.isTestPath(parsed.data.path)) return { content: "error: editing tests is not allowed", done: false };
        await this.workspace.writeFile(normalizePath(parsed.data.path), parsed.data.content);
        this.mark("found_file");
        this.mark("first_edit");

        return { content: "written", done: false };
      }

      case "run_tests": {
        const result = await this.workspace.runTests();

        if (testsPassed(result)) this.mark("tests_green");

        return { content: `exit ${result.exitCode}\n${truncate(result.output)}`, done: false };
      }

      case "declare_done": {
        const message = DoneArgs.safeParse(args);
        this.hooks.log("info", `claims done: ${message.success ? message.data.message.slice(0, 200) : ""}`);

        return this.claimDone();
      }

      default:
        return { content: `error: unknown tool ${call.function.name}`, done: false };
    }
  }

  private async claimDone(): Promise<{ content: string; done: boolean }> {
    const { verified, report } = await this.referee();

    if (verified) {
      this.mark("tests_green");
      this.mark("verified");

      return { content: "verified", done: true };
    }

    this.bluffs += 1;
    this.hooks.bluff();
    this.hooks.log("bluff", `BLUFF +${bluffPenaltyMs / 1000}s`);

    return { content: `BLUFF: the referee reran the tests and they fail.\n${report}`, done: false };
  }

  async run(): Promise<AgentOutcome> {
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt(this.brief) },
      { role: "user", content: "Go. The timer is running." },
    ];

    for (let step = 0; step < maxStepsPerRunner; step += 1) {
      if (!this.hooks.budgetLeft()) {
        this.hooks.log("error", "token cap reached");

        return "dnf";
      }

      if (this.hooks.deadlinePassed()) return "dnf";

      if (this.bluffs >= maxBluffs) {
        this.hooks.log("error", "too many bluffs");

        return "dnf";
      }

      const response = await this.chat(messages);
      this.hooks.usage(response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0);
      const choice = response.choices[0];

      if (!choice) return "dnf";
      const calls = choice.message.tool_calls ?? [];
      const content = choice.message.content ?? "";

      if (content.trim()) this.hooks.log("think", content.slice(0, 300));
      const ids = calls.map((call, index) => call.id ?? `call_${step}_${index}`);
      const outgoing = calls.map((call, index) => toOutgoing(call, ids[index] ?? `call_${step}_${index}`));
      messages.push(assistantMessage(content, outgoing));

      if (calls.length === 0) {
        const outcome = await this.claimDone();

        if (outcome.done) return "verified";
        messages.push({ role: "user", content: outcome.content });
        continue;
      }

      for (const [index, call] of calls.entries()) {
        const callId = ids[index] ?? `call_${step}_${index}`;
        this.hooks.log("tool", `${call.function.name}${this.describe(call)}`);

        const result = await this.execute(call).catch((error: Error) => ({
          content: `error: ${error.message}`,
          done: false,
        }));

        messages.push({ role: "tool", tool_call_id: callId, name: call.function.name, content: result.content });

        if (result.done) return "verified";
      }
    }

    this.hooks.log("error", "step limit reached");

    return "dnf";
  }

  private describe(call: ToolCall): string {
    const parsed = PathArgs.safeParse(parseArgs(call));

    return parsed.success ? ` ${parsed.data.path}` : "";
  }
}
