import { expect, test } from "bun:test";
import { join } from "node:path";

for (const track of ["slugify", "roman", "lru"]) {
  test(`track ${track} starts with a failing test`, async () => {
    const proc = Bun.spawn(["bun", "test"], {
      cwd: join(import.meta.dir, "..", "tracks", track),
      stdout: "pipe",
      stderr: "pipe",
    });

    const code = await proc.exited;
    expect(code).not.toBe(0);
  });
}
