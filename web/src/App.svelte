<script lang="ts">
  import { onMount } from "svelte";
  import { z } from "zod";
  import { RaceState, splitNames } from "../../src/schemas";
  import { formatMs, modelLabel, splitLabels, splitTone } from "./format";

  const Tracks = z.object({ tracks: z.array(z.object({ id: z.string(), title: z.string(), brief: z.string() })) });

  const Races = z.object({ races: z.array(z.string()) });

  const StartResult = z.object({ race: RaceState }).or(z.object({ error: z.string(), retryAfterMs: z.number().optional() }));

  const Message = z.object({ type: z.literal("state"), race: RaceState });

  let tracks = $state<z.infer<typeof Tracks>["tracks"]>([]);

  let recent = $state<string[]>([]);

  let race = $state<z.infer<typeof RaceState> | null>(null);

  let now = $state(Date.now());

  let error = $state("");

  let starting = $state(false);

  let loading = $state(true);

  let loadError = $state("");

  let socket: WebSocket | null = null;

  const toneClass = {
    gold: "text-amber-300 bg-amber-400/10 ring-amber-400/50",
    green: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/40",
    red: "text-rose-300 bg-rose-500/15 ring-rose-500/60",
    pending: "text-zinc-400 bg-zinc-800/40 ring-zinc-700",
  };

  const statusClass = {
    verified: "bg-amber-400 text-zinc-950",
    dnf: "bg-zinc-700 text-zinc-300",
    error: "bg-rose-600 text-white",
    verifying: "bg-sky-500 text-zinc-950 animate-pulse",
    running: "bg-emerald-500 text-zinc-950",
    booting: "bg-zinc-600 text-white animate-pulse",
    queued: "bg-zinc-800 text-zinc-400",
  } satisfies Record<z.infer<typeof RaceState>["runners"][number]["status"], string>;

  let elapsed = $derived(
    race?.startedAt ? (race.endedAt ?? now) - race.startedAt : 0,
  );

  let bestSplits = $derived.by(() => {
    const best: Record<string, number> = {};

    for (const runner of race?.runners ?? []) {
      for (const split of runner.splits) {
        const current = best[split.name];

        if (current === undefined || split.elapsedMs < current) best[split.name] = split.elapsedMs;
      }
    }

    return best;
  });

  let ranking = $derived(
    [...(race?.runners ?? [])].sort((a, b) => (a.finalMs ?? Infinity) - (b.finalMs ?? Infinity)).map((r) => r.id),
  );

  function connect(id: string) {
    socket?.close();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${location.host}/api/races/${id}/ws`);
    socket.onmessage = (event) => {
      const parsed = Message.safeParse(JSON.parse(String(event.data)));

      if (parsed.success) race = parsed.data.race;
    };

    socket.onclose = () => {
      if (race && (race.status === "running" || race.status === "pending")) setTimeout(() => connect(id), 1500);
    };
  }

  async function start(track: string) {
    starting = true;
    error = "";

    const response = await fetch("/api/races", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ track }),
    });

    const parsed = StartResult.safeParse(await response.json());
    starting = false;

    if (!parsed.success) {
      error = `Could not start the race (HTTP ${response.status}).`;

      return;
    }

    if ("error" in parsed.data) {
      error = parsed.data.retryAfterMs
        ? `${parsed.data.error} Next slot in ${Math.ceil(parsed.data.retryAfterMs / 60000)} min.`
        : parsed.data.error;

      return;
    }

    race = parsed.data.race;
    history.replaceState(null, "", `#${parsed.data.race.id}`);
    connect(parsed.data.race.id);
  }

  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 47);
    fetch("/api/tracks").then(async (r) => {
      const parsed = Tracks.safeParse(await r.json());

      if (parsed.success) tracks = parsed.data.tracks;
    });
    fetch("/api/races").then(async (r) => {
      const parsed = Races.safeParse(await r.json());

      if (parsed.success) recent = parsed.data.races.toReversed();
    });
    const hash = location.hash.slice(1);

    if (hash) connect(hash);

    return () => {
      clearInterval(timer);
      socket?.close();
    };
  });
</script>

<div aria-hidden="true" class="pointer-events-none fixed inset-0 z-0 bg-[url(/backdrop.jpg)] bg-cover bg-center opacity-30 "></div>
<div aria-hidden="true" class="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.85)_75%)]"></div>
<main class="relative z-10 mx-auto max-w-7xl px-[max(1rem,env(safe-area-inset-left))] pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] font-mono">
  <header class="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-4">
    <div>
      <h1 class="bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-500 bg-clip-text text-5xl font-black italic tracking-tighter text-transparent">
        SPEEDRUN
      </h1>
      <p class="text-sm text-zinc-400">Three AI models race to fix the same bug, and a referee reruns the tests before any finish counts.</p>
    </div>
    <div class="text-right">
      <div class="text-5xl sm:text-6xl font-black tabular-nums tracking-tight {race?.status === 'running' ? 'text-emerald-300' : race ? 'text-amber-300' : 'text-zinc-500'}">
        {formatMs(elapsed)}
      </div>
      <div class="text-xs uppercase tracking-widest text-zinc-400">
        {race ? `${race.track} · ${race.status} · ${race.totalTokens.toLocaleString()} / ${race.tokenCap.toLocaleString()} tok · $${race.costUsd.toFixed(4)}` : loading ? "loading" : "no race yet"}
      </div>
    </div>
  </header>

  <p class="mt-4 text-sm text-zinc-300">3 races per hour for everyone. If the limit is reached, watch a recent race.</p>
  {#if loading}
    <p class="mt-2 text-sm text-zinc-400" aria-live="polite">Loading tracks and recent races…</p>
  {/if}
  {#if loadError}
    <p class="mt-2 rounded bg-rose-500/15 px-3 py-2 text-sm text-rose-300" role="alert">{loadError}</p>
  {/if}
  <section class="mt-4 grid gap-3 md:grid-cols-3" aria-label="Tracks">
    {#each tracks as track (track.id)}
      <button
        class="group min-h-11 rounded-lg bg-zinc-900 p-3 text-left ring-1 ring-zinc-800 transition hover:-translate-y-0.5 hover:ring-amber-400 disabled:opacity-40"
        disabled={starting}
        onclick={() => start(track.id)}
      >
        <div class="font-bold text-amber-300 group-hover:text-amber-200">▶ {track.title}</div>
        <div class="text-xs text-zinc-400">{track.brief}</div>
      </button>
    {/each}
  </section>
  {#if error}
    <p class="mt-2 rounded bg-rose-500/15 px-3 py-2 text-sm text-rose-300" role="alert">{error}</p>
  {/if}

  {#if race}
    <section class="mt-6 grid gap-4 lg:grid-cols-3">
      {#each race.runners as runner (runner.id)}
        <article class="flex flex-col overflow-hidden rounded-xl bg-zinc-900 ring-1 {runner.status === 'verified' ? 'ring-amber-400 shadow-lg shadow-amber-500/20' : 'ring-zinc-800'}">
          <div class="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
            <div>
              <h2 class="font-bold">{modelLabel(runner.model, runner.label)}</h2>
              <div class="text-xs text-zinc-400">#{ranking.indexOf(runner.id) + 1} · on Workers AI</div>
            </div>
            <span class="rounded px-2 py-0.5 text-xs font-bold uppercase {statusClass[runner.status]}">{runner.status}</span>
          </div>
          <div class="text-3xl font-black tabular-nums px-3 pt-2 {runner.finalMs !== null ? 'text-amber-300' : 'text-zinc-200'}">
            {runner.finalMs !== null ? formatMs(runner.finalMs) : formatMs(elapsed + runner.penaltyMs)}
            {#if runner.bluffs > 0}
              <span class="ml-2 animate-pulse rounded bg-rose-600 px-2 py-0.5 align-middle text-xs text-white">BLUFF ×{runner.bluffs}</span>
            {/if}
          </div>
          <ol class="space-y-1 p-3">
            {#each splitNames as name (name)}
              {@const split = runner.splits.find((s) => s.name === name)}
              {@const tone = splitTone(split?.elapsedMs, bestSplits[name], runner.bluffs > 0 && name === "verified")}
              <li class="flex justify-between rounded px-2 py-1 text-sm ring-1 transition-all duration-300 {toneClass[tone]}">
                <span>{splitLabels[name]}</span>
                <span class="tabular-nums">{split ? formatMs(split.elapsedMs) : "--:--.--"}</span>
              </li>
            {/each}
          </ol>
          <div class="grid grid-cols-3 gap-1 px-3 text-xs text-zinc-400">
            <span>steps {runner.steps}</span>
            <span>tok {(runner.inputTokens + runner.outputTokens).toLocaleString()}</span>
            <span>${runner.costUsd.toFixed(4)}</span>
            <span>clef {runner.clefScore === null ? "–" : runner.clefScore.toFixed(3)}</span>
            <span>rerun {runner.rerunPassed === null ? "–" : runner.rerunPassed ? "PASS" : "FAIL"}</span>
            <span class="truncate" title={runner.artifact ?? ""}>{runner.artifact ? "archived" : ""}</span>
          </div>
          <pre aria-label="Diff" class="mx-3 mt-2 h-48 overflow-auto rounded bg-black/60 p-2 text-[11px] leading-snug">{#each runner.diff.split("\n") as line, i (i)}<span class={line.startsWith("+") ? "text-emerald-400" : line.startsWith("-") ? "text-rose-400" : line.startsWith("@@") ? "text-sky-400" : "text-zinc-400"}>{line}
</span>{/each}</pre>
          <ul aria-label="Agent log" class="m-3 h-32 space-y-0.5 overflow-auto text-[11px]">
            {#each runner.log.toReversed() as entry, i (i)}
              <li class={entry.kind === "bluff" ? "font-bold text-rose-400" : entry.kind === "verify" ? "text-sky-300" : entry.kind === "error" ? "text-rose-300" : entry.kind === "think" ? "text-zinc-400 italic" : "text-zinc-300"}>
                {entry.kind === "tool" ? "›" : "·"} {entry.text}
              </li>
            {/each}
          </ul>
        </article>
      {/each}
    </section>
  {/if}

  {#if recent.length}
    <section class="mt-6 text-xs text-zinc-400">
      <h2 class="mb-1">Recent races</h2>
      {#each recent as id (id)}
        <a class="mr-2 inline-flex min-h-11 items-center px-1 text-amber-400 hover:underline" href={`#${id}`} onclick={() => connect(id)}>{id}</a>
      {/each}
    </section>
  {/if}
  <footer class="mt-8 space-y-1 text-xs text-zinc-400">
    <p>Limits: 3 races per hour across all visitors, 1 race per visitor every 10 minutes, a 10 minute timeout, and a {(600000).toLocaleString()} token cap per race.</p>
    <p>Costs: each race shows its token count and model cost in US dollars, priced from the per-model rates in src/config.ts. Container time is not included.</p>
    <p>Models: Moonshot AI Kimi, Z.ai GLM, and DeepSeek run on Workers AI. Clef, made by Cloudflare, scores the raw test output, then the referee reruns the tests.</p>
    <p><a class="inline-flex min-h-11 items-center text-amber-400 hover:underline" href="https://github.com/acoyfellow/speedrun">Source on GitHub</a></p>
  </footer>
</main>
