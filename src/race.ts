import { DurableObject } from "cloudflare:workers";
import { RaceAgent } from "./agent";
import {
  bluffPenaltyMs,
  costUsd,
  type RosterEntry,
  raceTimeoutMs,
  raceTokenCap,
  roster,
  runnerTokenCap,
} from "./config";
import { RunnerClient } from "./container";
import { chat, clefScore } from "./models";
import { type LogEntry, type RaceState, RaceState as RaceStateSchema, type Runner, type SplitName } from "./schemas";
import { getTrack, type Track } from "./tracks";

export function newRunner(entry: RosterEntry): Runner {
  return {
    id: entry.id,
    model: entry.model,
    label: entry.label,
    status: "queued",
    splits: [],
    bluffs: 0,
    penaltyMs: 0,
    finalMs: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    steps: 0,
    diff: "",
    clefScore: null,
    rerunPassed: null,
    artifact: null,
    log: [],
  };
}

export function newRace(id: string, track: string, now: number): RaceState {
  return {
    id,
    track,
    status: "pending",
    createdAt: now,
    startedAt: null,
    endedAt: null,
    runners: roster.map(newRunner),
    totalTokens: 0,
    tokenCap: raceTokenCap,
    costUsd: 0,
    storage: null,
  };
}

export function rankRunners(runners: Runner[]): Runner[] {
  return [...runners].sort((a, b) => (a.finalMs ?? Number.POSITIVE_INFINITY) - (b.finalMs ?? Number.POSITIVE_INFINITY));
}

export class RaceRoom extends DurableObject<Env> {
  private state: RaceState | null = null;
  private dirty = false;

  private async load(): Promise<RaceState | null> {
    if (this.state) return this.state;
    const stored = await this.ctx.storage.get("race");
    const parsed = RaceStateSchema.safeParse(stored);
    this.state = parsed.success ? parsed.data : null;

    return this.state;
  }

  private broadcast(): void {
    if (!this.state) return;
    const payload = JSON.stringify({ type: "state", race: this.state });

    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "send failed");
      }
    }

    this.dirty = true;
  }

  private async persist(): Promise<void> {
    if (this.state && this.dirty) {
      this.dirty = false;
      await this.ctx.storage.put("race", this.state);
    }
  }

  async snapshot(): Promise<RaceState | null> {
    return this.load();
  }

  async start(id: string, trackId: string): Promise<RaceState> {
    const existing = await this.load();

    if (existing) return existing;
    const track = getTrack(trackId);

    if (!track) throw new Error(`unknown track ${trackId}`);
    this.state = newRace(id, trackId, Date.now());
    await this.ctx.storage.put("race", this.state);
    await this.ctx.storage.setAlarm(Date.now() + 20_000);
    this.ctx.waitUntil(this.runRace(this.state, track));

    return this.state;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    const race = await this.load();

    if (race) pair[1].send(JSON.stringify({ type: "state", race }));

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override async webSocketMessage(): Promise<void> {}

  override async alarm(): Promise<void> {
    const race = await this.load();

    if (!race || race.status === "finished" || race.status === "timeout" || race.status === "error") return;
    const now = Date.now();

    if (race.startedAt && now - race.startedAt > raceTimeoutMs) {
      for (const runner of race.runners) {
        if (!["verified", "dnf", "error"].includes(runner.status)) runner.status = "dnf";
      }

      race.status = "timeout";
      race.endedAt = now;
      this.broadcast();
    }

    await this.persist();

    if (race.status === "running" || race.status === "pending") await this.ctx.storage.setAlarm(now + 20_000);
  }

  private log(runner: Runner, kind: LogEntry["kind"], text: string): void {
    runner.log.push({ at: Date.now(), kind, text });

    if (runner.log.length > 80) runner.log.splice(0, runner.log.length - 80);
    this.broadcast();
  }

  private async runRace(race: RaceState, track: Track): Promise<void> {
    const repo = await this.createArtifactRepo(race.id).catch(() => null);
    race.storage = repo ? `artifacts:${repo.name}` : "r2";

    const clients = race.runners.map((runner) => ({
      runner,
      client: new RunnerClient(this.env.RUNNER.getByName(`${race.id}-${runner.id}`)),
    }));

    for (const { runner } of clients) runner.status = "booting";
    this.broadcast();

    const booted = await Promise.all(
      clients.map(async ({ runner, client }) => {
        try {
          await client.init(track.files);

          return true;
        } catch (error) {
          runner.status = "error";
          this.log(runner, "error", `boot failed: ${error instanceof Error ? error.message : "unknown"}`);

          return false;
        }
      }),
    );

    race.status = "running";
    race.startedAt = Date.now();

    for (const [index, { runner }] of clients.entries()) if (booted[index]) runner.status = "running";
    this.broadcast();
    await this.persist();
    await Promise.all(
      clients.map(async ({ runner, client }, index) => {
        if (!booted[index]) return;
        await this.runRunner(race, track, runner, client);
        await this.archive(race, runner, client, repo);
        this.broadcast();
        await this.persist();
      }),
    );

    if (race.status === "running") race.status = "finished";
    race.endedAt = race.endedAt ?? Date.now();
    this.broadcast();
    await this.persist();
    await this.env.ATTEMPTS.put(`races/${race.id}/race.json`, JSON.stringify(race, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  private async createArtifactRepo(raceId: string): Promise<{ name: string; remote: string; token: string }> {
    const created = await this.env.ARTIFACTS.create(`race-${raceId}`, { description: "speedrun race attempts" });

    return { name: created.name, remote: created.remote, token: created.token };
  }

  private async runRunner(race: RaceState, track: Track, runner: Runner, client: RunnerClient): Promise<void> {
    const entry = roster.find((item) => item.id === runner.id);

    if (!entry || !race.startedAt) return;
    const startedAt = race.startedAt;

    const agent = new RaceAgent(
      track.brief,
      track.target,
      async (messages) => {
        runner.steps += 1;

        return chat(this.env.AI, entry.model, messages);
      },
      client,
      { clef: (output) => clefScore(this.env.AI, output) },
      {
        now: () => Date.now(),
        split: (name: SplitName) => {
          const at = Date.now();
          runner.splits.push({ name, at, elapsedMs: at - startedAt });
          this.refreshDiff(runner, client);
          this.broadcast();
        },
        log: (kind, text) => this.log(runner, kind, text),
        usage: (input, output) => {
          runner.inputTokens += input;
          runner.outputTokens += output;
          runner.costUsd = costUsd(entry.price, runner.inputTokens, runner.outputTokens);
          race.totalTokens = race.runners.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
          race.costUsd = race.runners.reduce((sum, r) => sum + r.costUsd, 0);
          this.broadcast();
        },
        budgetLeft: () => race.totalTokens < race.tokenCap && runner.inputTokens + runner.outputTokens < runnerTokenCap,
        deadlinePassed: () => Date.now() - startedAt > raceTimeoutMs || race.status === "timeout",
        verdict: ({ clefScore: score, rerunPassed }) => {
          runner.clefScore = score;
          runner.rerunPassed = rerunPassed;
          runner.status = "verifying";
          this.broadcast();
        },
        bluff: () => {
          runner.bluffs += 1;
          runner.penaltyMs += bluffPenaltyMs;
          runner.status = "running";
          this.broadcast();
        },
      },
    );

    try {
      const outcome = await agent.run();

      if (outcome === "verified") {
        const verified = runner.splits.find((split) => split.name === "verified");
        runner.status = "verified";
        runner.finalMs = (verified?.elapsedMs ?? Date.now() - startedAt) + runner.penaltyMs;
      } else {
        runner.status = "dnf";
      }
    } catch (error) {
      runner.status = "error";
      this.log(runner, "error", error instanceof Error ? error.message.slice(0, 300) : "unknown error");
    }
  }

  private refreshDiff(runner: Runner, client: RunnerClient): void {
    this.ctx.waitUntil(
      client
        .diff()
        .then(({ diff }) => {
          runner.diff = diff;
          this.broadcast();
        })
        .catch(() => undefined),
    );
  }

  private async archive(
    race: RaceState,
    runner: Runner,
    client: RunnerClient,
    repo: { name: string; remote: string; token: string } | null,
  ): Promise<void> {
    const diff = await client.diff().catch(() => ({ diff: runner.diff }));
    runner.diff = diff.diff;

    const splits = JSON.stringify(
      { runner: runner.id, model: runner.model, splits: runner.splits, log: runner.log },
      null,
      2,
    );

    await this.env.ATTEMPTS.put(`races/${race.id}/${runner.id}.diff`, runner.diff);
    await this.env.ATTEMPTS.put(`races/${race.id}/${runner.id}.splits.json`, splits, {
      httpMetadata: { contentType: "application/json" },
    });
    runner.artifact = `r2:races/${race.id}/${runner.id}`;

    if (!repo) return;

    const pushed = await client.push(repo.remote, repo.token, `runner/${runner.id}`, splits).catch((error: Error) => {
      this.log(runner, "error", `artifact push failed: ${error.message}`);

      return null;
    });

    if (pushed?.ok) runner.artifact = `artifacts:${repo.name}#runner/${runner.id}@${pushed.sha.slice(0, 12)}`;
    else if (pushed) this.log(runner, "error", `artifact push failed: ${pushed.log}`);
  }
}
