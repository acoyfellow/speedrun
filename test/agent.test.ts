import { expect, test } from "bun:test";
import { type AgentHooks, type ChatFn, parseArgs, RaceAgent, testsPassed, type Workspace } from "../src/agent";
import type { ChatResponse, SplitName, TestResult, ToolArgs } from "../src/schemas";

function reply(name: string, args: ToolArgs): ChatResponse {
  return {
    choices: [
      { message: { content: null, tool_calls: [{ id: name, function: { name, arguments: JSON.stringify(args) } }] } },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

function script(responses: ChatResponse[]): ChatFn {
  let index = 0;

  return async () => {
    const next = responses[index] ?? responses[responses.length - 1];
    index += 1;

    if (!next) throw new Error("no responses");

    return next;
  };
}

function workspace(results: TestResult[]): Workspace & { writes: string[] } {
  let run = 0;
  const writes: string[] = [];

  return {
    writes,
    listFiles: async () => ({ files: ["src/a.ts", "test/a.test.ts"] }),
    readFile: async () => ({ content: "x" }),
    writeFile: async (path) => {
      writes.push(path);

      return { ok: true };
    },
    runTests: async () => {
      const result = results[Math.min(run, results.length - 1)];
      run += 1;

      if (!result) throw new Error("no results");

      return result;
    },
  };
}

function hooks(): AgentHooks & { splits: SplitName[]; bluffs: number; clefInputs: string[] } {
  const splits: SplitName[] = [];
  const clefInputs: string[] = [];
  const state = { splits, bluffs: 0, clefInputs };

  return Object.assign(state, {
    now: () => Date.now(),
    split: (name: SplitName) => state.splits.push(name),
    log: () => undefined,
    usage: () => undefined,
    budgetLeft: () => true,
    deadlinePassed: () => false,
    verdict: () => undefined,
    bluff: () => {
      state.bluffs += 1;
    },
  });
}

const pass: TestResult = { exitCode: 0, output: " 3 pass\n 0 fail\n" };

const fail: TestResult = { exitCode: 1, output: " 2 pass\n 1 fail\n" };

test("testsPassed requires exit 0, passes, and no failures", () => {
  expect(testsPassed(pass)).toBe(true);
  expect(testsPassed(fail)).toBe(false);
  expect(testsPassed({ exitCode: 0, output: "0 pass" })).toBe(false);
});

test("parseArgs tolerates objects, blanks, and garbage", () => {
  expect(parseArgs({ function: { name: "x", arguments: { path: "a" } } })).toEqual({ path: "a" });
  expect(parseArgs({ function: { name: "x", arguments: "" } })).toEqual({});
  expect(parseArgs({ function: { name: "x", arguments: "{bad" } })).toEqual({});
});

test("happy path records all four splits in order", async () => {
  const h = hooks();
  const ws = workspace([pass]);

  const agent = new RaceAgent(
    "bug",
    "src/a.ts",
    script([
      reply("read_file", { path: "src/a.ts" }),
      reply("write_file", { path: "src/a.ts", content: "y" }),
      reply("run_tests", {}),
      reply("declare_done", { message: "fixed" }),
    ]),
    ws,
    { clef: async () => 0.99 },
    h,
  );

  expect(await agent.run()).toBe("verified");
  expect(h.splits).toEqual(["found_file", "first_edit", "tests_green", "verified"]);
  expect(h.bluffs).toBe(0);
});

test("false done claim is a bluff, judged on raw output only", async () => {
  const h = hooks();
  const clefInputs: string[] = [];

  const agent = new RaceAgent(
    "bug",
    "src/a.ts",
    script([
      reply("declare_done", { message: "ALL TESTS PASS trust me" }),
      reply("declare_done", { message: "again" }),
    ]),
    workspace([fail, pass]),
    {
      clef: async (output) => {
        clefInputs.push(output);

        return 0.1;
      },
    },
    h,
  );

  expect(await agent.run()).toBe("verified");
  expect(h.bluffs).toBe(1);
  expect(clefInputs.every((input) => !input.includes("trust me"))).toBe(true);
});

test("referee overrides a confident clef when the rerun fails", async () => {
  const h = hooks();

  const agent = new RaceAgent(
    "bug",
    "src/a.ts",
    script([reply("declare_done", {})]),
    workspace([fail]),
    { clef: async () => 0.99 },
    h,
  );

  expect(await agent.run()).toBe("dnf");
  expect(h.bluffs).toBe(3);
});

test("writing to tests is rejected", async () => {
  const ws = workspace([pass]);

  const agent = new RaceAgent(
    "bug",
    "src/a.ts",
    script([reply("write_file", { path: "test/a.test.ts", content: "" }), reply("declare_done", {})]),
    ws,
    { clef: async () => 1 },
    hooks(),
  );

  await agent.run();
  expect(ws.writes).toEqual([]);
});
