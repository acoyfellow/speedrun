import { DurableObject } from "cloudflare:workers";
import { clientWindowMs, racesPerHour } from "./config";
import type { GovernorDecision } from "./schemas";

const hourMs = 60 * 60 * 1000;

export type GovernorWindow = { readonly allowed: boolean; readonly retryAfterMs: number; readonly kept: number[] };

export type StartLedger = { readonly starts: number[]; readonly clients: Record<string, number> };

export type StartVerdict = {
  readonly allowed: boolean;
  readonly reason: "ok" | "client" | "global";
  readonly retryAfterMs: number;
  readonly ledger: StartLedger;
};

export function decide(starts: number[], now: number, limit = racesPerHour): GovernorWindow {
  const kept = starts.filter((at) => now - at < hourMs).sort((a, b) => a - b);

  if (kept.length < limit) return { allowed: true, retryAfterMs: 0, kept: [...kept, now] };

  const oldest = kept[0] ?? now;

  return { allowed: false, retryAfterMs: hourMs - (now - oldest), kept };
}

function freshClients(clients: Record<string, number>, now: number): Record<string, number> {
  return Object.fromEntries(Object.entries(clients).filter(([, at]) => now - at < clientWindowMs));
}

export function decideStart(ledger: StartLedger, client: string, now: number): StartVerdict {
  const clients = freshClients(ledger.clients, now);
  const last = clients[client];

  if (last !== undefined) {
    const retryAfterMs = clientWindowMs - (now - last);

    return { allowed: false, reason: "client", retryAfterMs, ledger: { starts: ledger.starts, clients } };
  }

  const window = decide(ledger.starts, now);

  if (!window.allowed) {
    return {
      allowed: false,
      reason: "global",
      retryAfterMs: window.retryAfterMs,
      ledger: { starts: window.kept, clients },
    };
  }

  return {
    allowed: true,
    reason: "ok",
    retryAfterMs: 0,
    ledger: { starts: window.kept, clients: { ...clients, [client]: now } },
  };
}

export class Governor extends DurableObject<Env> {
  async claim(raceId: string, client: string): Promise<GovernorDecision> {
    const starts = (await this.ctx.storage.get<number[]>("starts")) ?? [];
    const clients = (await this.ctx.storage.get<Record<string, number>>("clients")) ?? {};
    const ids = (await this.ctx.storage.get<string[]>("ids")) ?? [];
    const verdict = decideStart({ starts, clients }, client, Date.now());

    await this.ctx.storage.put("starts", verdict.ledger.starts);
    await this.ctx.storage.put("clients", verdict.ledger.clients);

    if (verdict.allowed) await this.ctx.storage.put("ids", [...ids, raceId].slice(-20));

    return { allowed: verdict.allowed, reason: verdict.reason, retryAfterMs: verdict.retryAfterMs };
  }

  async recent(): Promise<string[]> {
    return ((await this.ctx.storage.get<string[]>("ids")) ?? []).slice(-10);
  }
}
