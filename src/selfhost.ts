import core from "./core";
import { type FrontLimits, routeApi } from "./front";

export { RunnerContainer } from "./container";

export { Governor } from "./governor";

export { RaceRoom } from "./race";

type SelfHostEnv = Env & FrontLimits & { ASSETS: Fetcher };

export default {
  async fetch(request: Request, env: SelfHostEnv): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    return routeApi(request, env, (forwarded) => core.fetch(forwarded, env));
  },
} satisfies ExportedHandler<SelfHostEnv>;
