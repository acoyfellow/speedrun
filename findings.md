# Findings

## What worked

- Kimi K2.7 Code, GLM 5.3, and DeepSeek V4 Pro all handle OpenAI-style tool calling on Workers AI through AI Gateway `default`. Every runner in both recorded races reached `verified` with zero bluffs.
- Kimi was fastest in both races: roman in 9.0s and lru in 12.3s.
- Clef scored passing `bun test` output at about 0.994 every time. The referee rerun agreed in every case.
- Artifacts branch pushes from inside the container worked. Each runner has a commit on `runner/<id>`.

## Honest failures and caveats

- No bluff has happened live yet. The bluff path, and the case where the rerun overrides a confident Clef, are covered only by unit tests (`test/agent.test.ts`).
- Race `murbcfq6-d5c174` ran on the first deploy, before race starts needed the bearer token. A local commit hook (guardrail) blocked committing a public workers.dev Worker with an unauthenticated AI binding, so I added the bearer gate and redeployed. Race `murbi9hi-2451b8` ran on the final authenticated deploy.
- Installs had to go through `npm` with `--@cloudflare:registry=https://registry.npmjs.org/`. The user-level `@cloudflare` scope points at an internal registry behind Access, and bun could not resolve through it. The agent tooling would not create a project-level npm config file, so the lockfile is `package-lock.json`.
- `worker-configuration.d.ts` is generated during `check` and is gitignored. Its generated doc comments trip the no-comments hook.
- Clef has no entry in the generated `AiModels`, so `src/ai-models.d.ts` augments it.
- The cost receipt counts only model tokens at list price. Container time and Clef calls are not metered in the app.
- The tracks are easy (all three models solve each one in under a minute). Harder tracks would make the race more interesting.
- When a race times out mid-run, runner loops are only stopped at their next step check. An in-flight model call can still finish after the timeout.

## Public race start

- Race starts no longer need a bearer token. The `Governor` Durable Object allows 3 races per hour for everyone and 1 start per hashed IP address every 10 minutes. The front Worker's per-IP rate limit refuses bursts before they reach the core.
