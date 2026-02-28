import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { WorktreePool } from "../worktree-pool.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Spin up a real git repo on `main` with one commit, return path + cleanup. */
async function makeTempRepo(): Promise<{ repoPath: string; cleanup: () => void }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-wt-test-"));
  const git = (...args: string[]) => execFileAsync("git", args, { cwd: dir });

  await git("init", "-b", "main");
  await git("config", "user.email", "test@example.com");
  await git("config", "user.name", "Test");
  fs.writeFileSync(path.join(dir, "README.md"), "# test\n");
  await git("add", ".");
  await git("commit", "-m", "initial commit");

  return {
    repoPath: dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorktreePool", () => {
  it("init() creates the right number of worktrees", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 2);
      await pool.init();

      const status = pool.getStatus();
      assert.strictEqual(status.length, 2, "should have 2 workers");
      assert.ok(
        fs.existsSync(path.join(repoPath, ".worktrees", "worker-0")),
        "worker-0 directory should exist",
      );
      assert.ok(
        fs.existsSync(path.join(repoPath, ".worktrees", "worker-1")),
        "worker-1 directory should exist",
      );
      assert.strictEqual(pool.available, 2, "all workers should start available");
      assert.strictEqual(pool.busy, 0, "no workers should start busy");
    } finally {
      cleanup();
    }
  });

  it("acquire() returns a worker and marks it busy", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 2);
      await pool.init();

      const worker = await pool.acquire();

      assert.ok(worker !== null, "should return a worker when one is free");
      assert.strictEqual(worker.busy, true, "returned worker should be marked busy");
      assert.ok(worker.name.startsWith("worker-"), "worker name should follow naming convention");
      assert.ok(typeof worker.path === "string" && worker.path.length > 0, "worker path should be set");
      assert.ok(worker.branch.startsWith("worker/"), "worker branch should follow naming convention");
      assert.strictEqual(pool.available, 1, "one worker should remain available");
      assert.strictEqual(pool.busy, 1, "one worker should be busy");
    } finally {
      cleanup();
    }
  });

  it("acquire() returns null when all workers are busy", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 1);
      await pool.init();

      const first = await pool.acquire();
      assert.ok(first !== null, "first acquire should succeed");

      const second = await pool.acquire();
      assert.strictEqual(second, null, "should return null when pool is exhausted");
    } finally {
      cleanup();
    }
  });

  it("release() makes worker available again", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 2);
      await pool.init();

      const worker = await pool.acquire();
      assert.ok(worker !== null);
      assert.strictEqual(pool.available, 1);

      await pool.release(worker.name, false);

      assert.strictEqual(pool.available, 2, "released worker should be available again");
      assert.strictEqual(pool.busy, 0, "no workers should remain busy");

      // Verify the worker is genuinely re-acquirable
      const reacquired = await pool.acquire();
      assert.ok(reacquired !== null, "worker should be acquirable after release");
    } finally {
      cleanup();
    }
  });

  it("getStatus() reflects current busy/idle state accurately", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 3);
      await pool.init();

      // Acquire two of the three workers
      const w1 = await pool.acquire();
      const w2 = await pool.acquire();
      assert.ok(w1 !== null && w2 !== null);

      const status = pool.getStatus();
      assert.strictEqual(status.length, 3, "status should list all workers");

      const busyWorkers = status.filter((w) => w.busy);
      const idleWorkers = status.filter((w) => !w.busy);
      assert.strictEqual(busyWorkers.length, 2, "two workers should be busy");
      assert.strictEqual(idleWorkers.length, 1, "one worker should be idle");

      // Every entry must have the required WorkerInfo shape
      for (const w of status) {
        assert.strictEqual(typeof w.name, "string");
        assert.strictEqual(typeof w.path, "string");
        assert.strictEqual(typeof w.branch, "string");
        assert.strictEqual(typeof w.busy, "boolean");
      }
    } finally {
      cleanup();
    }
  });
});
