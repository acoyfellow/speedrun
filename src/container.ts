import { Container } from "@cloudflare/containers";
import type { z } from "zod";
import { containerSleepAfter } from "./config";
import {
  DiffResponse,
  ErrorResponse,
  FileResponse,
  FilesResponse,
  InitResponse,
  OkResponse,
  PushResponse,
  TestResponse,
  type TestResult,
} from "./schemas";

type RunnerPayload =
  | { readonly files: Record<string, string> }
  | { readonly path: string; readonly content: string }
  | { readonly remote: string; readonly token: string; readonly branch: string; readonly splits: string }
  | Record<string, never>;

export class RunnerContainer extends Container<Env> {
  override defaultPort = 8080;
  override sleepAfter = containerSleepAfter;
  override enableInternet = true;
}

export class RunnerClient {
  constructor(private readonly stub: { fetch(request: Request): Promise<Response> }) {}

  private async call<T extends z.ZodType>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> {
    const response = await this.stub.fetch(new Request(`http://runner${path}`, init));
    const json: unknown = await response.json();
    const failure = ErrorResponse.safeParse(json);

    if (!response.ok || (failure.success && !schema.safeParse(json).success)) {
      throw new Error(failure.success ? failure.data.error : `runner ${path} failed with ${response.status}`);
    }

    return schema.parse(json);
  }

  private post(payload: RunnerPayload, method = "POST"): RequestInit {
    return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) };
  }

  init(files: Record<string, string>) {
    return this.call(InitResponse, "/init", this.post({ files }));
  }

  listFiles() {
    return this.call(FilesResponse, "/files");
  }

  readFile(path: string) {
    return this.call(FileResponse, `/file?path=${encodeURIComponent(path)}`);
  }

  writeFile(path: string, content: string) {
    return this.call(OkResponse, "/file", this.post({ path, content }, "PUT"));
  }

  runTests(): Promise<TestResult> {
    return this.call(TestResponse, "/test", this.post({}));
  }

  diff() {
    return this.call(DiffResponse, "/diff");
  }

  push(remote: string, token: string, branch: string, splits: string) {
    return this.call(PushResponse, "/push", this.post({ remote, token, branch, splits }));
  }
}
