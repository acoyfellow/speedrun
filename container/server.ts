import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { z } from "zod";

const root = "/work/repo";

type Json = z.infer<typeof JsonObject>;

const JsonObject = z.record(z.string(), z.json());

const InitInput = z.object({ files: z.record(z.string(), z.string()) });

const PushInput = z.object({
  remote: z.string(),
  token: z.string(),
  branch: z.string(),
  splits: z.string().optional(),
});

const WriteInput = z.object({ path: z.string(), content: z.string() });

function reply(body: Json, status = 200): Response {
  return Response.json(body, { status });
}

function safePath(relative: string): string | null {
  const clean = normalize(relative).replace(/^\/+/, "");

  if (clean.startsWith("..") || clean.includes("/../") || clean.startsWith(".git")) {
    return null;
  }

  return join(root, clean);
}

async function run(cmd: string[], timeoutMs = 60000): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", GIT_TERMINAL_PROMPT: "0" },
  });

  const timer = setTimeout(() => proc.kill(), timeoutMs);

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  clearTimeout(timer);

  return { code, out: `${stdout}${stderr}` };
}

async function walk(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) files.push(...(await walk(join(dir, entry.name), rel)));
    else files.push(rel);
  }

  return files.sort();
}

async function body(req: Request): Promise<Json> {
  const parsed = JsonObject.safeParse(await req.json());

  return parsed.success ? parsed.data : {};
}

async function init(input: Json): Promise<Response> {
  const parsed = InitInput.safeParse(input);

  if (!parsed.success) return reply({ error: "files required" }, 400);

  const files = parsed.data.files;
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  for (const [path, content] of Object.entries(files)) {
    const target = safePath(path);

    if (!target) return reply({ error: `bad file ${path}` }, 400);
    await mkdir(dirname(target), { recursive: true });
    await Bun.write(target, content);
  }

  await run(["git", "init", "-q", "-b", "main"]);
  await run(["git", "config", "user.email", "speedrun@coey.dev"]);
  await run(["git", "config", "user.name", "speedrun"]);
  await run(["git", "add", "-A"]);
  const commit = await run(["git", "commit", "-q", "-m", "track start"]);

  return reply({ ok: commit.code === 0, files: await walk(root) });
}

async function push(input: Json): Promise<Response> {
  const parsed = PushInput.safeParse(input);

  if (!parsed.success) return reply({ error: "remote, token, branch required" }, 400);

  const { remote, token, branch, splits } = parsed.data;

  if (splits !== undefined) await Bun.write(join(root, "SPLITS.json"), splits);
  await run(["git", "checkout", "-q", "-B", branch]);
  await run(["git", "add", "-A"]);
  await run(["git", "commit", "-q", "--allow-empty", "-m", `attempt ${branch}`]);
  const url = new URL(remote);
  url.username = "x";
  url.password = token;
  const pushed = await run(["git", "push", "-q", "-f", url.toString(), `${branch}:${branch}`], 60000);
  const sha = await run(["git", "rev-parse", "HEAD"]);

  return reply({ ok: pushed.code === 0, sha: sha.out.trim(), log: pushed.out.split(token).join("***").slice(-500) });
}

Bun.serve({
  port: 8080,
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/health") return reply({ ok: true });

      if (url.pathname === "/init" && req.method === "POST") return await init(await body(req));

      if (url.pathname === "/files") return reply({ files: await walk(root) });

      if (url.pathname === "/file" && req.method === "GET") {
        const target = safePath(url.searchParams.get("path") ?? "");

        if (!target) return reply({ error: "bad path" }, 400);
        const file = Bun.file(target);

        if (!(await file.exists())) return reply({ error: "not found" }, 404);

        return reply({ content: await file.text() });
      }

      if (url.pathname === "/file" && req.method === "PUT") {
        const input = WriteInput.safeParse(await body(req));
        const target = input.success ? safePath(input.data.path) : null;

        if (!target || !input.success) return reply({ error: "bad input" }, 400);

        await mkdir(dirname(target), { recursive: true });
        await Bun.write(target, input.data.content);

        return reply({ ok: true });
      }

      if (url.pathname === "/test" && req.method === "POST") {
        const result = await run(["bun", "test"], 90000);

        return reply({ exitCode: result.code, output: result.out.slice(-12000) });
      }

      if (url.pathname === "/diff") {
        const result = await run(["git", "diff", "--no-color", "HEAD"]);

        return reply({ diff: result.out.slice(-20000) });
      }

      if (url.pathname === "/push" && req.method === "POST") return await push(await body(req));

      return reply({ error: "not found" }, 404);
    } catch (error) {
      return reply({ error: error instanceof Error ? error.message : "unknown" }, 500);
    }
  },
});
