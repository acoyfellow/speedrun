export interface FrontLimits {
  START_LIMIT: RateLimit;
  API_LIMIT: RateLimit;
}

export interface FrontEnv extends FrontLimits {
  ASSETS: Fetcher;
  CORE: Fetcher;
}

export type Forward = (request: Request) => Promise<Response>;

function clientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

async function withinLimit(request: Request, limits: FrontLimits): Promise<boolean> {
  const limiter = request.method === "POST" ? limits.START_LIMIT : limits.API_LIMIT;
  const { success } = await limiter.limit({ key: clientKey(request) });

  return success;
}

export async function routeApi(request: Request, limits: FrontLimits, forward: Forward): Promise<Response> {
  if (!(await withinLimit(request, limits))) {
    return Response.json(
      { error: "Too many requests from this address. Wait a minute and try again." },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  return forward(request);
}

export default {
  async fetch(request: Request, env: FrontEnv): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    return routeApi(request, env, (forwarded) => env.CORE.fetch(forwarded));
  },
} satisfies ExportedHandler<FrontEnv>;
