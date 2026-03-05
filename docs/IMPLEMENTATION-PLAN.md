# cc-manager v0.2: Implementation Plan

> Focus on ours. Borrow good features from others.
> Our moat: Wave Planning + Staged Merging. Nobody else has this.

---

## Current State (v0.1.0)

- 6 modules, 3150 LOC, 367 tests passing
- 0% auto-merge (TSC gate fails due to isolation paradox)
- Basic child_process spawn, no CI feedback loop, no wave planning

## Target State (v0.2.0)

- 95%+ auto-merge success rate
- Wave-based dependency-aware dispatch
- CI failure → auto-fix loop
- Borrowed best patterns from 18+ competitors

---

## Phase 1: Fix the Core Loop (0% → 80%)

**Goal**: Tasks that run should actually merge.

### 1.1 Staged Merging ← OUR MOAT (nobody has this)

```
Current:  dispatch all → run parallel → merge at end → all fail (TSC)
Target:   dispatch wave → run parallel → merge completed → rebase active → next wave
```

**New file**: `src/staged-merger.ts` (~200 LOC)
```typescript
interface StagedMerger {
  // After a task completes and passes TSC:
  mergeToMain(worktreeId: string): Promise<MergeResult>
  // After merge, rebase all active worktrees:
  rebaseActive(activeWorktrees: string[]): Promise<RebaseResult[]>
}
```

**Modify**: `src/scheduler.ts` — add merge-after-complete hook

### 1.2 Wave Planner ← OUR MOAT (nobody has this)

```
Tasks: [create types.ts, use types.ts, modify scheduler.ts, add tests]
  → Dependency analysis → DAG
  → Wave 1: [create types.ts, modify scheduler.ts, add tests] (parallel)
  → Wave 2: [use types.ts] (after types.ts merged)
```

**New file**: `src/wave-planner.ts` (~300 LOC)
```typescript
interface WavePlanner {
  analyzeDeps(tasks: Task[]): DependencyGraph
  planWaves(graph: DependencyGraph): Wave[]
  // Each wave: max parallel tasks with no inter-dependencies
}

interface Wave {
  id: number
  tasks: Task[]
  dependsOn: number[]  // previous wave IDs that must complete
}
```

**How to analyze deps**: Parse task prompts for file references (imports, creates, modifies).
Use Opus to identify which tasks create new types/exports and which consume them.

### 1.3 Merge Queue with CI Bisect (borrowed from Gas Town's Refinery)

Gas Town's Refinery is the only project with a real merge queue:
```
Multiple PRs ready → batch merge → run CI on tip
  → CI passes: all merged
  → CI fails: binary search to find which PR broke it → reject that one → retry rest
```

**Modify**: `src/staged-merger.ts` — add Refinery-style bisect on CI failure

```typescript
interface MergeQueue {
  // Batch merge completed tasks
  batchMerge(tasks: CompletedTask[]): Promise<MergeResult>
  // On CI failure, binary search for the culprit
  bisectFailure(tasks: CompletedTask[], ciError: string): Promise<Task>
  // Retry without the culprit
  retryWithout(culprit: Task): Promise<MergeResult>
}
```

### 1.4 CI Auto-Fix Loop (borrowed from Composio)

```
Agent creates code → TSC fails → inject TSC errors back into agent → agent fixes → retry
```

**Modify**: `src/agent-runner.ts` — after TSC gate failure:
1. Parse TSC error output
2. Inject error context as continuation prompt
3. Resume agent session (not restart from scratch)

**Borrow from**: Composio's reaction engine pattern + Symphony's continuation turns

### 1.5 Failure Diagnosis Engine ← OUR MOAT

```
TSC error: "Cannot find module './types.js'"
  → Diagnosis: types.ts created by Task A, not yet merged
  → Action: merge Task A first, rebase, retry
```

**New file**: `src/failure-diagnoser.ts` (~200 LOC)

---

## Phase 2: Borrow the Runtime (80% → 90%)

### 2.1 JSONL Event Monitoring (from Composio)

**Stop**: Parsing stdout/self-reporting
**Start**: Read `~/.claude/projects/*/sessions/*.jsonl` directly

```typescript
// Composio reads these fields from JSONL:
// - type: "user" | "assistant" | "tool_use" | "tool_result"
// - timestamp, sessionId, content
```

**New file**: `src/jsonl-monitor.ts` (~100 LOC)
- Watch session JSONL files with `fs.watch()`
- Parse events: message, tool_use, turn_complete
- Replace current stdout-based progress tracking

### 2.2 Stall Timeout (from lalph)

**Current**: Wall-clock timeout kills agent after N minutes
**Better**: Track last output time, kill only if agent produces no output for M seconds

```typescript
// lalph pattern: race output stream vs stall timer
// Every stdout line resets the stall timer
// Agent is alive if producing output, even if slow
```

**Modify**: `src/agent-runner.ts` — replace `setTimeout` with output-activity-based timeout

### 2.3 Worktree Pool (from emdash)

**Current**: Create worktree on-demand (3-7s delay per task)
**Better**: Pre-create reserve worktrees, claim instantly

```typescript
interface WorktreePool {
  reserves: Map<string, ReserveWorktree>
  claimReserve(): Promise<Worktree>     // instant
  replenishInBackground(): void          // async refill
}
```

**Modify**: `src/worktree-pool.ts` — add reserve pool with background replenishment

### 2.4 CLAUDE* Env Filtering (from metabot)

**Problem**: Nested Claude Code sessions fail with "nested session" detection
**Fix**: Filter all `CLAUDE_*` environment variables when spawning agent subprocess

```typescript
// metabot pattern:
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE'))
)
```

**Modify**: `src/agent-runner.ts` — add env filtering to spawn options

### 2.5 GUPP Hook Pattern (from Gas Town)

**Gas Town's GUPP**: "If there is work on your Hook, YOU MUST RUN IT."
Each agent has a pinned task as its work queue. Session starts → auto-execute.

```typescript
// Inject current task into agent's system prompt (CLAUDE.md)
// Agent sees task on startup → immediately starts working
// No polling, no external trigger needed
```

**Modify**: `src/agent-runner.ts` — write task details to worktree's CLAUDE.md before spawn

### 2.6 Handoff + Context Recovery (from Gas Town)

When agent hits context limit or crashes:
1. Write summary of decisions/progress to checkpoint file
2. Start new session with checkpoint as context
3. New session resumes from where old one left off

```typescript
interface HandoffProtocol {
  saveCheckpoint(workerId: string, summary: string): void
  loadCheckpoint(workerId: string): string | null
  seance(workerId: string): PreviousDecisions  // query past session
}
```

**New file**: `src/handoff.ts` (~100 LOC)

### 2.7 Beads Dual Persistence (from Gas Town)

SQLite for fast queries + JSONL for git tracking:
- `.tasks/tasks.db` — SQLite, fast status queries
- `.tasks/tasks.jsonl` — git-tracked, cross-machine sync

**Modify**: `src/store.ts` — add JSONL append on every state change

### 2.8 Three-Phase Lifecycle (from emdash)

```
setup → run → teardown
```

Each phase has its own status, logs, and timeout.
- **setup**: npm install, env prep, custom scripts
- **run**: agent execution
- **teardown**: cleanup, PR creation, notification

**Modify**: `src/agent-runner.ts` — refactor into 3 phases

---

## Phase 3: Borrow the Intelligence (90% → 95%)

### 3.1 Provider Registry (from emdash + vibe-kanban)

Declarative config for each agent type:

```typescript
interface AgentProvider {
  id: string                    // "claude" | "codex" | "gemini"
  command: string               // "claude" | "codex" | "gemini"
  promptFlag: string            // "-p" | "--prompt" | "--message"
  autoApproveFlag?: string      // "--dangerously-skip-permissions"
  sessionIdFlag?: string        // "--session-id"
  resumeFlag?: string           // "-c -r"
  useKeystrokeInjection?: bool  // for agents without prompt flag
}
```

**New file**: `src/providers/registry.ts` (~150 LOC)
- Declarative: adding a new agent = adding a JSON entry
- No code changes needed to support new agents

### 3.2 Attempt Model (from vibe-kanban)

Each task can have multiple attempts:
- Different agents, different prompts, different results
- Compare diffs across attempts
- Pick the best one to merge

**Modify**: `src/store.ts` — add `attempts` table, `task_id` → `attempt[]`

### 3.3 Review Comment Routing (from Composio)

```
PR review comment → orchestrator detects → routes to original agent → agent addresses
```

**New file**: `src/review-router.ts` (~150 LOC)

### 3.4 Linear Integration (from Symphony)

Symphony's Linear GraphQL adapter is clean:
- Poll Linear for active issues
- Map Linear states to internal states
- Agent can query Linear directly via injected tool

**Modify**: `src/integrations/` — add `linear.ts`

---

## Phase 4: Borrow the Polish (user acquisition)

### 4.1 Kanban Dashboard (inspired by vibe-kanban)

Don't build React from scratch. Enhance existing HTML dashboard:
- Kanban columns: Backlog → In Progress → Review → Done
- Real-time SSE updates (already have this)
- Click to view diff, logs, agent output

### 4.2 PRD → Epic → Task (from ccpm)

ccpm's YAML frontmatter + Markdown body pattern:
```yaml
---
name: Auth System
status: backlog
depends_on: [001]
parallel: true
conflicts_with: [003]
---
```

**Borrow**: The decomposition chain + frontmatter format
**Don't borrow**: The 37 slash commands (too complex)

### 4.3 WORKFLOW.md as First-Class (from Symphony)

Symphony's WORKFLOW.md is a contract:
- YAML frontmatter for runtime config
- Liquid templates for agent prompts
- Dynamic reload without restart

**Modify**: `src/workflow-loader.ts` — support YAML frontmatter + Liquid templates

### 4.4 IM Bridge (from metabot)

Telegram bot for mobile monitoring:
- `cc-m ls` from your phone
- Notifications on task completion/failure
- Quick approve/reject

**New file**: `src/integrations/telegram.ts` (~200 LOC)

---

## What We Do NOT Borrow

| Feature | Why Not |
|---------|---------|
| vibe-kanban's Rust backend | We're TypeScript. Our stack is fine. |
| vibe-kanban's ElectricSQL | Overkill for single-user CLI tool |
| ccpm's 37 slash commands | Too complex. We automate, not prompt. |
| Symphony's Elixir | Language mismatch |
| container-use's Dagger | Worktrees are sufficient for now |
| cmux's Swift/macOS | We're cross-platform CLI |
| emdash's Electron | We're terminal-first |
| Gas Town's Go language | Language mismatch, but patterns are gold |
| Gas Town's Dolt DB | SQLite + JSONL is simpler and sufficient |
| Gas Town's MEOW stack | Over-abstracted for our needs (Beads are enough) |

---

## Priority Execution Order

```
Sprint 1 (P0 — make it work):
  1. staged-merger.ts        ← OUR MOAT
  2. wave-planner.ts         ← OUR MOAT
  3. merge queue + CI bisect (Gas Town's Refinery pattern)
  4. CI auto-fix loop        (Composio pattern)
  5. failure-diagnoser.ts    ← OUR MOAT

Sprint 2 (P1 — make it robust):
  6. GUPP hook pattern       (from Gas Town — task in CLAUDE.md)
  7. handoff.ts              (from Gas Town — context recovery)
  8. jsonl-monitor.ts        (from Composio)
  9. stall timeout           (from lalph)
  10. worktree pool          (from emdash)
  11. CLAUDE* env filtering  (from metabot)
  12. three-phase lifecycle  (from emdash)

Sprint 3 (P2 — make it smart):
  13. provider registry      (from emdash/vibe-kanban)
  14. attempt model          (from vibe-kanban)
  15. dual persistence       (from Gas Town — SQLite + JSONL)
  16. review-router.ts       (from Composio)
  17. linear.ts              (from Symphony)

Sprint 4 (P3 — make it beautiful):
  18. kanban dashboard       (inspired by vibe-kanban)
  19. WORKFLOW.md upgrade     (from Symphony)
  20. telegram.ts            (from metabot)
```

---

## File Changes Summary

| Sprint | New Files | Modified Files | Est. LOC |
|--------|-----------|----------------|----------|
| 1 | staged-merger.ts, wave-planner.ts, failure-diagnoser.ts | scheduler.ts, agent-runner.ts, staged-merger.ts (merge queue) | ~900 |
| 2 | handoff.ts, jsonl-monitor.ts | agent-runner.ts (GUPP + stall + env + lifecycle), worktree-pool.ts | ~600 |
| 3 | providers/registry.ts, review-router.ts, integrations/linear.ts | store.ts (dual persistence + attempts) | ~600 |
| 4 | integrations/telegram.ts | workflow-loader.ts, dashboard HTML | ~400 |
| **Total** | **8 new** | **7 modified** | **~2500** |

---

## Success Metrics

```
After Sprint 1: 0% → 80% auto-merge (staged merging alone fixes most failures)
After Sprint 2: 80% → 90% (robust runtime, fewer crashes/hangs)
After Sprint 3: 90% → 95% (smart routing, multi-attempt, review loop)
After Sprint 4: 95% + beautiful UI + mobile access
```

---

## The One Sentence

**cc-manager is the only orchestrator that understands task dependencies before dispatch, merges incrementally instead of all-at-once, and diagnoses failures to fix the environment rather than retry blindly.**

Every borrowed feature serves this core thesis. Nothing we borrow dilutes our moat.
