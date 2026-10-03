# SPEEDRUN

Three AI models race to fix the same bug in containers, and a referee reruns the tests before any finish counts.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/speedrun)

Live: https://speedrun.coey.dev

![The SPEEDRUN backdrop](web/public/og.jpg)

## How it works

1. A track is a small TypeScript repo with one planted bug and a failing test. Three tracks live in `tracks/`: `slugify`, `roman`, and `lru`.
2. Anyone can start a race from the page, with no token. Starting a race creates three runners. Each runner gets its own Cloudflare Container with bun and git, holding a fresh git repo of the track.
3. Each runner runs a tool-calling loop on Workers AI through AI Gateway `default`:
   - Moonshot AI Kimi K2.7 Code (`@cf/moonshotai/kimi-k2.7-code`)
   - Z.ai GLM 5.3 (`@cf/zai-org/glm-5.3`)
   - DeepSeek V4 Pro (`@cf/deepseek-ai/deepseek-v4-pro-0813`)

   The tools are `list_files`, `read_file`, `write_file`, `run_tests`, and `declare_done`. They run inside that runner's container.
4. Splits are timestamps from the start: `found_file`, `first_edit`, `tests_green`, `verified`.
5. When an agent claims done, the referee reruns `bun test` in the container. Clef (`@cf/cloudflare/clef`, made by Cloudflare) sees only the raw test output and scores "Do these test results show all tests passing?". The rerun has the final say. A false claim is a BLUFF and adds a 30 second penalty. Three bluffs is a DNF.
6. Each attempt's diff and split log go to R2 under `races/<id>/` and to the branch `runner/<id>` in the Artifacts repo `race-<raceId>`.
7. Race state lives in the `RaceRoom` Durable Object. Spectators get updates over a WebSocket at `/api/races/<id>/ws`.

## Evidence

- [receipts/001-first-race.json](receipts/001-first-race.json): the first two races, on workers.dev.
- [receipts/002-coey-dev.json](receipts/002-coey-dev.json): races on speedrun.coey.dev. In race `musbl872-f95f71`, Kimi K2.7 Code verified in 0:07.19, DeepSeek V4 Pro in 0:14.51, and GLM 5.3 in 2:22.63. Clef scored 0.994 for each runner, and every rerun passed.
- [receipts/004-deploy-button.json](receipts/004-deploy-button.json): a deploy of the self-host config under a throwaway name.
- [receipts/004-truth-audit.json](receipts/004-truth-audit.json): each claim, matched to a file and line.
- [receipts/lighthouse-mobile.json](receipts/lighthouse-mobile.json): Lighthouse mobile scores.
- [findings.md](findings.md): what worked and what did not.

## Limits and costs

- 3 races per hour for everyone. If the limit is reached, watch a recent race. The `Governor` Durable Object enforces this.
- 1 race start per visitor every 10 minutes. The `Governor` keeps a hash of each IP address for 10 minutes. A per-IP Workers rate limit also refuses bursts.
- A token cap of 600,000 per race and 200,000 per runner, and at most 30 steps per runner.
- A 10 minute race timeout, enforced by a Durable Object alarm.
- Containers sleep after 2 minutes idle.
- The page shows each race's token count and model cost. The cost comes from the per-model prices in `src/config.ts`. It does not include container time or Clef calls. Race `musbl872-f95f71` cost $0.0177 in model tokens.

## Self-host

The Deploy button uses `wrangler-button.jsonc`. It is one Worker (`src/selfhost.ts`) with the UI, API, Workers AI, R2, Artifacts, Durable Objects, Containers, and rate limits. It has no account ID and no custom domain. It deploys to `workers.dev` in your own account. I have not confirmed that the button flow works end to end.

```sh
bun install
bun run build
npx wrangler r2 bucket create speedrun-attempts
npx wrangler deploy -c wrangler-button.jsonc
```

`.guardrailignore` lists only `wrangler-button.jsonc`. guardrail flags it because `workers_dev` is true and the Worker has an AI binding on a public URL. That is the purpose of the self-host config: it deploys to your own account, and the race limits protect it. The production configs are not ignored.

The app needs no secrets. See [vars.example.md](vars.example.md). Each race uses Workers AI tokens and container time in your account. The limits above apply.

## Develop locally

```sh
bun install
bun run verify
```

`verify` runs the type checks, biome, the anti-slop oxlint rules, `scripts/copy-check.ts`, and the tests.

Production uses two Workers. `speedrun` (`wrangler.prod.jsonc`, `src/front.ts`) serves the UI, applies per-IP limits, and calls `speedrun-core` (`core/wrangler.prod.jsonc`, `src/core.ts`) over a service binding. The core has no public URL. Deploy both with `bun run deploy:prod`.

## API

- `GET /api/tracks`
- `POST /api/races` with body `{"track":"roman"}`. No token is needed. Returns 429 with `retry-after` when a limit is reached.
- `GET /api/races` lists recent race IDs.
- `GET /api/races/:id` returns a snapshot.
- `GET /api/races/:id/ws` is the live spectator socket.

## Stack

Svelte 5, Tailwind v4, Cloudflare Workers, Durable Objects, Containers, Workers AI, AI Gateway, R2, Artifacts, zod, biome, and oxlint.

## License

MIT. See [LICENSE](LICENSE).
