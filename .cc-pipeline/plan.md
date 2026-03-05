# Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement v0.1.6 Phase 1 Critical Path: fix prompt accumulation on retry, add staged rebase after merge, and support array dependency DAGs.

**Architecture:** Three independent features layered bottom-up through types → store → worktree-pool → agent-runner → scheduler. Types change first (Wave 0), then store + worktree-pool in parallel (Wave 1), then agent-runner (Wave 2), then scheduler integrates everything (Wave 3), then tests (Wave 4).

**Tech Stack:** TypeScript 5, Node.js ESM, better-sqlite3, node:test + assert/strict

---

## Summary

**Feature 1 — Prompt accumulation fix + model escalation:** Each retry currently appends error context to `task.prompt`, so by retry 3 the prompt contains 3 stacked error sections. Fix by saving the original prompt in `task._originalPrompt` on first retry, then rebuilding from `_originalPrompt + latest error` on each subsequent retry. Add model escalation: when `retryCount >= 2` set `task.modelOverride = "claude-opus-4-6"` so hard tasks get a more powerful model. `_originalPrompt` is persisted in SQLite (new `original_prompt` column migration). `modelOverride` is transient (set in memory at retry time, recomputed each retry).

**Feature 2 — Staged rebase:** After a successful merge, other busy workers operate on a stale `main`. Add `WorktreePool.getActiveWorkers(exclude?)` (returns busy worker names, optionally excluding one) and `WorktreePool.rebaseOnMain(workerName)` (rebases branch onto current `main` tip, returns false on conflict). After every successful merge in `scheduler.executeAndRelease`, fire `rebaseOnMain` on all other active workers as best-effort (errors caught and logged, never blocking dispatch).

**Feature 3 — Dependency DAG:** `dependsOn` currently accepts only a single string task ID. Extend to `string | string[]` (backward-compatible). The dispatch loop checks ALL dependencies; if any is failed/timeout/cancelled the task fails immediately; if any is still pending/running the task is re-queued. Store serializes array values as JSON (detected on read by `startsWith('[')`).

---

## Files to Create
_(none — all changes are modifications to existing files)_

## Files to Modify
- `src/types.ts` — add `_originalPrompt?`, `modelOverride?` to Task; change `dependsOn` to `string | string[]`; update `createTask` opts
- `src/store.ts` — add `original_prompt` column migration; update taskToParams/rowToTask for `_originalPrompt`; serialize array `dependsOn` as JSON; update `fieldMap` in `update()`
- `src/worktree-pool.ts` — add `getActiveWorkers(exclude?)` and `rebaseOnMain(workerName)` public methods
- `src/agent-runner.ts` — use `task.modelOverride ?? task.model ?? this.model` in `runClaudeSDK` and `runClaude`
- `src/scheduler.ts` — fix prompt accumulation in `executeAndRelease` + `requeue`; add model escalation; update dependency check loop for arrays; call `pool.rebaseOnMain` on other workers after successful merge; update `submit()` opts type
- `src/__tests__/scheduler.test.ts` — update `makePool()` mock; add tests for prompt accumulation fix, model escalation, array dependsOn
- `src/__tests__/worktree-pool.test.ts` — add tests for `getActiveWorkers` and `rebaseOnMain`

---

## Waves (execution order)

### Wave 0: Types (single task, blocks everything else)

#### Task 1: Update `src/types.ts`

**Files:**
- Modify: `src/types.ts`

**Step 1: Add two new optional fields to the Task interface**

After line 39 (`model?: string;`), insert:
```typescript
  modelOverride?: string;
  _originalPrompt?: string;
```

**Step 2: Change `dependsOn` type**

Line 34: change `dependsOn?: string;` to:
```typescript
  dependsOn?: string | string[];
```

No changes needed to `createTask` body — `opts?.dependsOn` assignment already works for `string | string[]`.

**Step 3: Run tsc to verify**
```bash
npx tsc --noEmit
```
Expected: no errors (this is a pure type widening, no breaking changes)

**Step 4: Commit**
```bash
git add -A && git commit -m "feat(types): add modelOverride, _originalPrompt; widen dependsOn to string|string[]"
```

---

### Wave 1: Store + WorktreePool (parallel — independent files, both depend on Wave 0)

#### Task 2: Update `src/store.ts`

**Files:**
- Modify: `src/store.ts`

This task has four parts. Apply them in sequence within this task.

**Part A — Add migration for `original_prompt` column**

In `migrate()`, after the existing `review` column migration block (around line 89, after `"ALTER TABLE tasks ADD COLUMN review TEXT"`), add:
```typescript
    // Add original_prompt column to preserve original prompt across retries
    try {
      this.db.exec("ALTER TABLE tasks ADD COLUMN original_prompt TEXT");
    } catch {
      // Column already exists — safe to ignore
    }
```

**Part B — Update `taskToParams()`**

The existing method returns 25 params. Replace it entirely:
```typescript
  private taskToParams(task: Task): unknown[] {
    return [
      task.id, task.prompt, task.status, task.worktree ?? null,
      task.output, task.error, JSON.stringify(task.events),
      task.createdAt, task.startedAt ?? null, task.completedAt ?? null,
      task.timeout, task.maxBudget, task.costUsd,
      task.tokenInput, task.tokenOutput, task.durationMs, task.retryCount, task.maxRetries,
      task.priority ?? "normal",
      JSON.stringify(task.tags ?? []),
      task.dependsOn == null
        ? null
        : Array.isArray(task.dependsOn)
          ? JSON.stringify(task.dependsOn)
          : task.dependsOn,
      task.webhookUrl ?? null, task.summary ?? null,
      task.agent ?? "claude",
      JSON.stringify(task.review ?? null),
      task._originalPrompt ?? null,
    ];
  }
```
(26 params now — `original_prompt` is the last one)

**Part C — Update all SQL statements to include `original_prompt`**

There are 4 SQL statements across `save()`, `updateBatch()`, and `saveBatch()` — two variants each (INSERT and UPDATE). Update all of them:

INSERT (add `original_prompt` to column list and add `?` to VALUES — goes from 25 `?` to 26):
```sql
INSERT OR IGNORE INTO tasks
(id, prompt, status, worktree, output, error, events, created_at,
 started_at, completed_at, timeout, max_budget, cost_usd,
 token_input, token_output, duration_ms, retry_count, max_retries, priority, tags,
 depends_on, webhook_url, summary, agent, review, original_prompt)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

UPDATE (add `original_prompt=?` before `WHERE id=?`):
```sql
UPDATE tasks SET
  prompt=?, status=?, worktree=?, output=?, error=?, events=?, created_at=?,
  started_at=?, completed_at=?, timeout=?, max_budget=?, cost_usd=?,
  token_input=?, token_output=?, duration_ms=?, retry_count=?, max_retries=?,
  priority=?, tags=?, depends_on=?, webhook_url=?, summary=?, agent=?, review=?,
  original_prompt=?
WHERE id=?
```

Apply these SQL changes to `save()`, `updateBatch()` (insertStmt + updateStmt), and `saveBatch()` (insertStmt + updateStmt) — 6 SQL strings total.

**Part D — Update `update()` fieldMap and `rowToTask()`**

In `update()` fieldMap, replace the existing `dependsOn` entry and add `_originalPrompt`:
```typescript
      dependsOn:   { col: "depends_on", serialize: (v) => {
        if (v == null) return null;
        return Array.isArray(v) ? JSON.stringify(v as unknown[]) : v as string;
      }},
      _originalPrompt: { col: "original_prompt" },
```

In `rowToTask()`, replace the `dependsOn` line and add `_originalPrompt`:
```typescript
      dependsOn: (() => {
        const raw = row.depends_on as string | null | undefined;
        if (!raw) return undefined;
        if (raw.startsWith("[")) {
          try { return JSON.parse(raw) as string[]; } catch { return raw; }
        }
        return raw;
      })(),
      _originalPrompt: (row.original_prompt as string | null) ?? undefined,
```

**Step 5: Run tsc**
```bash
npx tsc --noEmit
```
Expected: no errors. Fix any type errors before committing.

**Step 6: Commit**
```bash
git add -A && git commit -m "feat(store): persist _originalPrompt; serialize dependsOn array as JSON"
```

---

#### Task 3: Add rebase methods to `src/worktree-pool.ts`

**Files:**
- Modify: `src/worktree-pool.ts`

**Step 1: Add two public methods**

Insert after the `getWorkerStats()` method (around line 386) and before the private `git()` helper:

```typescript
  /**
   * Returns names of all currently-busy workers, optionally excluding one.
   * Used by the scheduler to find other workers to rebase after a merge.
   */
  getActiveWorkers(exclude?: string): string[] {
    const result: string[] = [];
    for (const w of this.workers.values()) {
      if (w.busy && w.name !== exclude) result.push(w.name);
    }
    return result;
  }

  /**
   * Rebases the worker's branch onto the current tip of main.
   * Returns true on success, false if there were conflicts (rebase is aborted).
   * Best-effort — callers must not block on failure.
   */
  async rebaseOnMain(workerName: string): Promise<boolean> {
    const w = this.workers.get(workerName);
    if (!w) return false;
    try {
      const { stdout } = await this.git("rev-parse", "main");
      const mainSha = stdout.trim();
      await this.gitIn(w.path, "rebase", mainSha);
      return true;
    } catch {
      await this.gitIn(w.path, "rebase", "--abort").catch(() => {});
      log("warn", "[pool] rebaseOnMain: conflict, aborted", { worker: workerName });
      return false;
    }
  }
```

**Step 2: Run tsc**
```bash
npx tsc --noEmit
```
Expected: no errors

**Step 3: Commit**
```bash
git add -A && git commit -m "feat(worktree-pool): add getActiveWorkers() and rebaseOnMain()"
```

---

### Wave 2: AgentRunner model override (depends on Wave 0)

#### Task 4: Update `src/agent-runner.ts`

**Files:**
- Modify: `src/agent-runner.ts`

**Step 1: Update `runClaudeSDK()` model selection**

Find (~line 400):
```typescript
          model: task.model ?? this.model,
```
Change to:
```typescript
          model: task.modelOverride ?? task.model ?? this.model,
```

**Step 2: Update `runClaude()` model selection**

Find (~line 438):
```typescript
        "--model", task.model ?? this.model,
```
Change to:
```typescript
        "--model", task.modelOverride ?? task.model ?? this.model,
```

**Step 3: Run tsc**
```bash
npx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**
```bash
git add -A && git commit -m "feat(agent-runner): honour task.modelOverride in runClaude and runClaudeSDK"
```

---

### Wave 3: Scheduler — integrate all three features (depends on Waves 1 + 2)

#### Task 5: Update `src/scheduler.ts`

**Files:**
- Modify: `src/scheduler.ts`

Apply four sub-changes in sequence. Run `npx tsc --noEmit` after all four before committing.

---

**Sub-change A: Fix prompt accumulation in `executeAndRelease()`**

Find the retry block starting at ~line 544:
```typescript
      if (task.status === "failed" && task.retryCount < task.maxRetries) {
        shouldRetry = true;
        const prevError = task.error ?? "";
        task.retryCount++;
        task.status = "pending";
        task.completedAt = undefined;
        // Inject previous error into prompt so the agent can learn from it
        if (prevError) {
          const errorContext = prevError.length > 500 ? prevError.slice(0, 500) + "..." : prevError;
          task.prompt = `${task.prompt}\n\n---\n## Previous Attempt Failed (attempt ${task.retryCount})\nError: ${errorContext}\nFix the error above and try again.`;
        }
        task.error = "";
        // Swap agent on retry for better chance of success
        const prevAgent = task.agent ?? "claude";
        task.agent = AgentRunner.pickFallbackAgent(prevAgent);
        log("info", "task retrying with error context", { taskId: task.id, attempt: task.retryCount, maxRetries: task.maxRetries, agent: prevAgent, fallback: task.agent });
      }
```

Replace with:
```typescript
      if (task.status === "failed" && task.retryCount < task.maxRetries) {
        shouldRetry = true;
        const prevError = task.error ?? "";
        task.retryCount++;
        task.status = "pending";
        task.completedAt = undefined;
        // Save original prompt on first retry; rebuild from it on subsequent retries
        if (!task._originalPrompt) {
          task._originalPrompt = task.prompt;
        }
        if (prevError) {
          const errorContext = prevError.length > 500 ? prevError.slice(0, 500) + "..." : prevError;
          task.prompt = `${task._originalPrompt}\n\n---\n## Previous Attempt Failed (attempt ${task.retryCount})\nError: ${errorContext}\nFix the error above and try again.`;
        } else {
          task.prompt = task._originalPrompt;
        }
        // Escalate to opus on second retry (retryCount has already been incremented above)
        if (task.retryCount >= 2) {
          task.modelOverride = "claude-opus-4-6";
        }
        task.error = "";
        // Swap agent on retry for better chance of success
        const prevAgent = task.agent ?? "claude";
        task.agent = AgentRunner.pickFallbackAgent(prevAgent);
        log("info", "task retrying with error context", { taskId: task.id, attempt: task.retryCount, maxRetries: task.maxRetries, agent: prevAgent, fallback: task.agent });
      }
```

---

**Sub-change B: Fix prompt accumulation in `requeue()`**

Find in `requeue()` (~lines 149–164):
```typescript
    // Inject previous error into prompt so agent can learn from it
    const prevError = task.error ?? "";
    if (prevError) {
      const errorContext = prevError.length > 500 ? prevError.slice(0, 500) + "..." : prevError;
      task.prompt = `${task.prompt}\n\n---\n## Previous Attempt Failed (attempt ${task.retryCount + 1})\nError: ${errorContext}\nFix the error above and try again.`;
    }

    task.status = "pending";
    task.error = "";
    task.retryCount += 1;
    task.completedAt = undefined;
```

Replace with:
```typescript
    // Save original prompt on first retry; rebuild from it on subsequent retries
    const prevError = task.error ?? "";
    if (!task._originalPrompt) {
      task._originalPrompt = task.prompt;
    }
    if (prevError) {
      const errorContext = prevError.length > 500 ? prevError.slice(0, 500) + "..." : prevError;
      task.prompt = `${task._originalPrompt}\n\n---\n## Previous Attempt Failed (attempt ${task.retryCount + 1})\nError: ${errorContext}\nFix the error above and try again.`;
    } else {
      task.prompt = task._originalPrompt;
    }

    task.status = "pending";
    task.error = "";
    task.retryCount += 1;
    task.completedAt = undefined;
    // Escalate to opus on second+ manual retry
    if (task.retryCount >= 2) {
      task.modelOverride = "claude-opus-4-6";
    }
```

---

**Sub-change C: Update dependency DAG check in `loop()`**

Find the dependency check block (~lines 443–461):
```typescript
      if (task.dependsOn) {
        const dep = this.tasks.get(task.dependsOn) ?? this.store.get(task.dependsOn) ?? undefined;
        if (dep?.status !== "success") {
          // If dependency is in a terminal failure state (or missing), fail this task
          if (!dep || dep.status === "failed" || dep.status === "timeout" || dep.status === "cancelled") {
            task.status = "failed";
            task.error = `dependency ${task.dependsOn} is ${dep?.status ?? "missing"}`;
            task.completedAt = new Date().toISOString();
            this.store.save(task);
            this.onEvent?.({ type: "task_final", taskId: task.id, status: task.status });
            continue;
          }
          // Still pending/running — re-queue and wait
          log("info", "task waiting on dependency", { taskId: task.id, dependsOn: task.dependsOn });
          this.queue.push(task);
          await this.waitForDispatch(1_000);
          continue;
        }
      }
```

Replace with:
```typescript
      if (task.dependsOn) {
        const depIds = Array.isArray(task.dependsOn) ? task.dependsOn : [task.dependsOn];
        let anyFailed = false;
        let failedDepId: string | undefined;
        let failedDepStatus: string | undefined;
        let allSuccess = true;

        for (const depId of depIds) {
          const dep = this.tasks.get(depId) ?? this.store.get(depId) ?? undefined;
          if (!dep || dep.status === "failed" || dep.status === "timeout" || dep.status === "cancelled") {
            anyFailed = true;
            failedDepId = depId;
            failedDepStatus = dep?.status ?? "missing";
            break;
          }
          if (dep.status !== "success") {
            allSuccess = false;
          }
        }

        if (anyFailed) {
          task.status = "failed";
          task.error = `dependency ${failedDepId} is ${failedDepStatus}`;
          task.completedAt = new Date().toISOString();
          this.store.save(task);
          this.onEvent?.({ type: "task_final", taskId: task.id, status: task.status });
          continue;
        }
        if (!allSuccess) {
          log("info", "task waiting on dependency", { taskId: task.id, dependsOn: task.dependsOn });
          this.queue.push(task);
          await this.waitForDispatch(1_000);
          continue;
        }
      }
```

---

**Sub-change D: Staged rebase after merge + update `submit()` opts type**

Find in `executeAndRelease()` the merge result line (~line 514):
```typescript
      const mergeResult = await this.pool.release(workerName, shouldMerge, task.id);

      if (shouldMerge && !mergeResult.merged) {
```

After `pool.release(...)`, insert the rebase block:
```typescript
      const mergeResult = await this.pool.release(workerName, shouldMerge, task.id);

      // After a successful merge, rebase other active workers onto new main (best-effort)
      if (shouldMerge && mergeResult.merged) {
        for (const otherWorker of this.pool.getActiveWorkers(workerName)) {
          this.pool.rebaseOnMain(otherWorker).catch((err: unknown) => {
            log("warn", "staged rebase failed (best-effort)", { worker: otherWorker, error: String(err) });
          });
        }
      }

      if (shouldMerge && !mergeResult.merged) {
```

Also update the `submit()` method signature to accept `dependsOn?: string | string[]`:

Find (~line 72):
```typescript
  submit(prompt: string, opts?: { id?: string; timeout?: number; maxBudget?: number; priority?: import("./types.js").TaskPriority; dependsOn?: string; webhookUrl?: string; tags?: string[]; agent?: string; allowLongPrompt?: boolean }): Task {
```

Change `dependsOn?: string` to `dependsOn?: string | string[]`.

---

**Step 5: Run tsc**
```bash
npx tsc --noEmit
```
Expected: no errors. Fix any type errors before proceeding.

**Step 6: Run existing tests to verify nothing broke**
```bash
node --import tsx --test src/__tests__/scheduler.test.ts
```
Expected: all existing tests pass (some may fail due to missing `getActiveWorkers`/`rebaseOnMain` in the mock — see Task 6 fix below, but do not commit tests yet)

**Step 7: Commit**
```bash
git add -A && git commit -m "feat(scheduler): fix prompt accumulation, model escalation, array dependsOn, staged rebase"
```

---

### Wave 4: Tests (parallel — different test files)

#### Task 6: Tests for WorktreePool new methods

**Files:**
- Modify: `src/__tests__/worktree-pool.test.ts`

Append two new `describe` blocks at the end of the file (after the existing "WorktreePool stats" block):

```typescript
// ---------------------------------------------------------------------------
// getActiveWorkers
// ---------------------------------------------------------------------------

describe("WorktreePool.getActiveWorkers", () => {
  it("returns empty array when no workers are busy", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 2);
      await pool.init();

      assert.deepStrictEqual(pool.getActiveWorkers(), [], "no workers should be active initially");
    } finally {
      cleanup();
    }
  });

  it("returns all busy worker names", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 3);
      await pool.init();

      const w1 = await pool.acquire();
      const w2 = await pool.acquire();
      assert.ok(w1 !== null && w2 !== null);

      const active = pool.getActiveWorkers();
      assert.strictEqual(active.length, 2, "should report 2 active workers");
      assert.ok(active.includes(w1.name), "should include first acquired worker");
      assert.ok(active.includes(w2.name), "should include second acquired worker");
    } finally {
      cleanup();
    }
  });

  it("excludes the named worker from results", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 3);
      await pool.init();

      const w1 = await pool.acquire();
      const w2 = await pool.acquire();
      assert.ok(w1 !== null && w2 !== null);

      const active = pool.getActiveWorkers(w1.name);
      assert.strictEqual(active.length, 1, "should return 1 after excluding one");
      assert.strictEqual(active[0], w2.name, "remaining entry should be the non-excluded worker");
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// rebaseOnMain
// ---------------------------------------------------------------------------

describe("WorktreePool.rebaseOnMain", () => {
  it("returns false for unknown worker name", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 1);
      await pool.init();

      const result = await pool.rebaseOnMain("nonexistent");
      assert.strictEqual(result, false, "unknown worker should return false");
    } finally {
      cleanup();
    }
  });

  it("returns true when branch is already up to date with main", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 1);
      await pool.init();

      // Worker was just reset to current main tip — nothing to rebase
      const worker = await pool.acquire();
      assert.ok(worker !== null);

      const result = await pool.rebaseOnMain(worker.name);
      assert.strictEqual(result, true, "up-to-date branch should rebase successfully");
    } finally {
      cleanup();
    }
  });

  it("returns true after rebasing worker branch onto new main commits", async () => {
    const { repoPath, cleanup } = await makeTempRepo();
    try {
      const pool = new WorktreePool(repoPath, 2);
      await pool.init();

      // Acquire worker-0 and add a commit on its branch (non-conflicting file)
      const w0 = await pool.acquire();
      assert.ok(w0 !== null);
      fs.writeFileSync(path.join(w0.path, "worker-file.txt"), "worker work\n");
      const git0 = (...args: string[]) => execFileAsync("git", args, { cwd: w0.path });
      await git0("add", "worker-file.txt");
      await git0("commit", "-m", "worker commit");

      // Simulate a new commit landing on main via worker-1
      const w1 = await pool.acquire();
      assert.ok(w1 !== null);
      fs.writeFileSync(path.join(w1.path, "main-new.txt"), "new on main\n");
      const git1 = (...args: string[]) => execFileAsync("git", args, { cwd: w1.path });
      await git1("add", "main-new.txt");
      await git1("commit", "-m", "new main commit");
      const { stdout: newSha } = await git1("rev-parse", "HEAD");
      // Update main ref to simulate a squash merge landing
      await execFileAsync("git", ["update-ref", "refs/heads/main", newSha.trim()], { cwd: repoPath });

      // Rebase w0 onto new main
      const result = await pool.rebaseOnMain(w0.name);
      assert.strictEqual(result, true, "rebase onto non-conflicting main should succeed");
    } finally {
      cleanup();
    }
  });
});
```

**Step 1: Append the two describe blocks**

**Step 2: Run the test file**
```bash
node --import tsx --test src/__tests__/worktree-pool.test.ts
```
Expected: all tests pass including new ones

**Step 3: Commit**
```bash
git add -A && git commit -m "test(worktree-pool): getActiveWorkers and rebaseOnMain coverage"
```

---

#### Task 7: Tests for Scheduler new behaviour

**Files:**
- Modify: `src/__tests__/scheduler.test.ts`

**Step 1: Update `makePool()` mock at the top of the file**

The existing `makePool()` returns an object without `getActiveWorkers` or `rebaseOnMain`. The scheduler now calls both. Find `makePool()` and add the two stubs:

```typescript
function makePool(): WorktreePool {
  return {
    available: 2,
    busy: 0,
    acquire: async () => ({ name: "w0", path: "/tmp/w0", branch: "worker/w0", busy: true }),
    release: async () => ({ merged: true }),
    init: async () => {},
    getStatus: () => [],
    getActiveWorkers: (_exclude?: string) => [],
    rebaseOnMain: async (_name: string) => true,
  } as unknown as WorktreePool;
}
```

**Step 2: Append new describe blocks at the end of the file**

```typescript
// ---------------------------------------------------------------------------
// Prompt accumulation fix
// ---------------------------------------------------------------------------

describe("Scheduler retry — prompt accumulation fix", () => {
  it("second retry rebuilds prompt from _originalPrompt, not accumulated prompt", async () => {
    let callCount = 0;
    const capturedPrompts: string[] = [];

    const runner = {
      run: async (task: Task) => {
        callCount++;
        capturedPrompts.push(task.prompt);
        if (callCount <= 2) {
          task.status = "failed";
          task.error = `error on attempt ${callCount}`;
          task.durationMs = 10;
        } else {
          task.status = "success";
          task.durationMs = 10;
        }
        return task;
      },
      getRunningTasks: () => [],
      reviewDiffWithAgent: async () => ({ approve: true, score: 80, issues: [], suggestions: [] }),
    } as unknown as import("../agent-runner.js").AgentRunner;

    const store = makeStore();
    const s = new Scheduler(makePool(), runner, store);
    s.start();

    s.submit("original prompt text", { maxRetries: 3 });
    // Allow enough time for 3 attempts
    await new Promise((r) => setTimeout(r, 600));
    await s.stop();

    // Every attempt after the first should see exactly one "## Previous Attempt Failed" section
    for (let i = 1; i < capturedPrompts.length; i++) {
      const sections = (capturedPrompts[i].match(/## Previous Attempt Failed/g) ?? []).length;
      assert.strictEqual(sections, 1,
        `Attempt ${i + 1} prompt should have exactly 1 error section, got ${sections}.\nPrompt: ${capturedPrompts[i].slice(0, 300)}`);
    }
  });

  it("stores _originalPrompt on first retry", async () => {
    let callCount = 0;

    const runner = {
      run: async (task: Task) => {
        callCount++;
        if (callCount === 1) {
          task.status = "failed";
          task.error = "first failure";
          task.durationMs = 10;
        } else {
          task.status = "success";
          task.durationMs = 10;
        }
        return task;
      },
      getRunningTasks: () => [],
      reviewDiffWithAgent: async () => ({ approve: true, score: 80, issues: [], suggestions: [] }),
    } as unknown as import("../agent-runner.js").AgentRunner;

    const store = makeStore();
    const s = new Scheduler(makePool(), runner, store);
    s.start();

    const task = s.submit("the real original prompt", { maxRetries: 1 });
    await new Promise((r) => setTimeout(r, 400));
    await s.stop();

    assert.strictEqual(task._originalPrompt, "the real original prompt",
      "_originalPrompt should be saved after first retry");
  });
});

// ---------------------------------------------------------------------------
// Model escalation
// ---------------------------------------------------------------------------

describe("Scheduler retry — model escalation", () => {
  it("sets modelOverride to claude-opus-4-6 on retryCount >= 2", async () => {
    const modelOverrides: Array<string | undefined> = [];
    let callCount = 0;

    const runner = {
      run: async (task: Task) => {
        callCount++;
        modelOverrides.push(task.modelOverride);
        task.status = "failed";
        task.error = "always fails";
        task.durationMs = 10;
        return task;
      },
      getRunningTasks: () => [],
      reviewDiffWithAgent: async () => ({ approve: true, score: 80, issues: [], suggestions: [] }),
    } as unknown as import("../agent-runner.js").AgentRunner;

    const s = new Scheduler(makePool(), runner, makeStore());
    s.start();
    s.submit("test model escalation", { maxRetries: 2 });
    await new Promise((r) => setTimeout(r, 600));
    await s.stop();

    // 3 total attempts: attempt 0, 1, 2
    // On attempt at retryCount=2 (third call), modelOverride should be "claude-opus-4-6"
    assert.ok(callCount >= 3, `expected at least 3 attempts, got ${callCount}`);
    assert.strictEqual(modelOverrides[2], "claude-opus-4-6",
      `third attempt (retryCount=2) should use claude-opus-4-6, got: ${modelOverrides[2]}`);
    // First two attempts should not have modelOverride set
    assert.strictEqual(modelOverrides[0], undefined, "first attempt should not have modelOverride");
    assert.strictEqual(modelOverrides[1], undefined, "second attempt (retryCount=1) should not have modelOverride");
  });
});

// ---------------------------------------------------------------------------
// Array dependsOn (DAG)
// ---------------------------------------------------------------------------

describe("Scheduler dependency DAG — array dependsOn", () => {
  it("task with string[] dependsOn waits for all deps before running", async () => {
    const store = makeStore();
    const completionOrder: string[] = [];

    const runner = {
      run: async (task: Task) => {
        await new Promise((r) => setTimeout(r, 30));
        task.status = "success";
        task.durationMs = 30;
        completionOrder.push(task.id);
        return task;
      },
      getRunningTasks: () => [],
      reviewDiffWithAgent: async () => ({ approve: true, score: 80, issues: [], suggestions: [] }),
    } as unknown as import("../agent-runner.js").AgentRunner;

    // Pool with 3 workers so deps can run in parallel
    const pool = {
      available: 3,
      busy: 0,
      acquire: (() => {
        let n = 0;
        return async () => ({ name: `w${n++}`, path: `/tmp/w${n}`, branch: `worker/w${n}`, busy: true });
      })(),
      release: async () => ({ merged: true }),
      init: async () => {},
      getStatus: () => [],
      getActiveWorkers: () => [],
      rebaseOnMain: async () => true,
    } as unknown as import("../worktree-pool.js").WorktreePool;

    const s = new Scheduler(pool, runner, store);
    s.start();

    const dep1 = s.submit("dep task 1");
    const dep2 = s.submit("dep task 2");
    const dependent = s.submit("dependent task", { dependsOn: [dep1.id, dep2.id] });

    await new Promise((r) => setTimeout(r, 600));
    await s.stop();

    const savedDependent = store.get(dependent.id);
    assert.strictEqual(savedDependent?.status, "success",
      `dependent task should succeed, got: ${savedDependent?.status}`);

    const dep1Idx = completionOrder.indexOf(dep1.id);
    const dep2Idx = completionOrder.indexOf(dep2.id);
    const depIdx = completionOrder.indexOf(dependent.id);
    assert.ok(dep1Idx !== -1, "dep1 should have completed");
    assert.ok(dep2Idx !== -1, "dep2 should have completed");
    assert.ok(depIdx !== -1, "dependent should have completed");
    assert.ok(dep1Idx < depIdx, "dep1 must complete before dependent");
    assert.ok(dep2Idx < depIdx, "dep2 must complete before dependent");
  });

  it("dependent task fails immediately when any dep in array fails", async () => {
    const store = makeStore();

    const runner = {
      run: async (task: Task) => {
        if (task.prompt === "will fail") {
          task.status = "failed";
          task.error = "intentional failure";
        } else {
          task.status = "success";
        }
        task.durationMs = 10;
        return task;
      },
      getRunningTasks: () => [],
      reviewDiffWithAgent: async () => ({ approve: true, score: 80, issues: [], suggestions: [] }),
    } as unknown as import("../agent-runner.js").AgentRunner;

    const pool = {
      available: 2,
      busy: 0,
      acquire: (() => {
        let n = 0;
        return async () => ({ name: `w${n++}`, path: `/tmp/w${n}`, branch: `worker/w${n}`, busy: true });
      })(),
      release: async () => ({ merged: true }),
      init: async () => {},
      getStatus: () => [],
      getActiveWorkers: () => [],
      rebaseOnMain: async () => true,
    } as unknown as import("../worktree-pool.js").WorktreePool;

    const s = new Scheduler(pool, runner, store);
    s.start();

    const depFailing = s.submit("will fail", { maxRetries: 0 });
    const depOk = s.submit("will succeed");
    const dependent = s.submit("dep on both", { dependsOn: [depFailing.id, depOk.id] });

    await new Promise((r) => setTimeout(r, 500));
    await s.stop();

    const savedDependent = store.get(dependent.id);
    assert.strictEqual(savedDependent?.status, "failed",
      `dependent should be failed when a dep fails, got: ${savedDependent?.status}`);
    assert.ok(savedDependent?.error.includes(depFailing.id),
      `error message should reference the failed dep ID. Got: ${savedDependent?.error}`);
  });

  it("string dependsOn (single ID, backward-compat) still works", () => {
    const store = makeStore();
    const s = new Scheduler(makePool(), makeRunner(), store);

    const dep = s.submit("parent task");
    dep.status = "success";
    store.save(dep);

    // String (not array) — must not break
    const child = s.submit("child task", { dependsOn: dep.id });
    assert.strictEqual(child.status, "pending",
      "child with string dependsOn should be pending (not immediately failed)");
  });
});
```

**Step 3: Run the full scheduler test file**
```bash
node --import tsx --test src/__tests__/scheduler.test.ts
```
Expected: all tests pass

**Step 4: Run the entire test suite**
```bash
node --import tsx --test src/__tests__/*.test.ts
```
Expected: all tests pass

**Step 5: Commit**
```bash
git add -A && git commit -m "test(scheduler): prompt accumulation fix, model escalation, array dependsOn coverage"
```

---

## Risks

| Risk | Mitigation |
|------|-----------|
| **SQL param count mismatch** — `taskToParams` now returns 26 params but SQL might still expect 25 | Count `?` placeholders in every INSERT/UPDATE statement after editing. 26 columns in INSERT, 25 SET clauses + 1 WHERE in UPDATE (26 total params, same array) |
| **`retryCount` increment order** — in `executeAndRelease`, `retryCount++` happens BEFORE the `>= 2` check. In `requeue()`, `retryCount += 1` happens AFTER. Be careful: escalation fires at retryCount=2 in both places | Double-check: after `task.retryCount++` the value is 2 on the third attempt. In requeue, `retryCount += 1` then `if (task.retryCount >= 2)` — same logic |
| **Rebase locking** — `rebaseOnMain` calls `gitIn` which runs in a worktree. If the worktree is actively running an agent that is also calling git, rebase could conflict | Rebase is best-effort, fires after the current worker's merge completes (that worker is already released). Other active workers are using different worktree paths |
| **Test timing flakiness** — async scheduler tests use `setTimeout` delays. Slow CI might fail | If tests flake, increase delays. 600ms allows 3 × 10ms-duration runs with plenty of scheduling overhead |
| **`dependsOn` JSON round-trip** — reading old DB rows where `depends_on` is a plain string like `"abc123"` must not be accidentally JSON-parsed | The `startsWith('[')` guard handles this — only arrays are parsed as JSON |
