# cc-manager: Product Vision — "Best in Class"

**Date**: 2026-03-05
**Status**: Strategic rethink after competitive analysis

---

## The Honest Assessment

We ran 20 tasks today. 0% auto-merge success. The code was all good (367 tests pass after manual merge), but the orchestrator failed to deliver end-to-end results.

Meanwhile:
- Composio: 84.6% CI success, 30 parallel agents, 40K LOC in 8 days
- vibe-kanban: 22K stars, beautiful kanban UI
- claude-squad: 6K stars, dead simple TUI

**We are not competing on features. We are behind.**

---

## What "Best" Actually Means

The user doesn't care about:
- How many plugins we support
- What our type system looks like
- Whether we have a state machine

The user cares about ONE thing:

> "I have 50 GitHub Issues. I want them all done by tomorrow morning. With working code, passing tests, and merged PRs."

**Success rate is the only metric that matters.**

Everything else — plugins, memory, self-evolution — is meaningless if the basic loop doesn't work.

---

## Why Orchestrators Fail Today

Every orchestrator (including ours) has the same fundamental problem:

```
Issue → Dispatch agent → Agent writes code → Gate check → FAIL
                                                  ↓
                                            Mark as failed
                                            (user does manual work)
```

The failure modes:

### 1. Isolation Paradox
Agents work in isolated worktrees. Agent A creates a new type. Agent B needs that type but can't see it. TSC fails for both.

**Nobody solves this.** Composio, vibe-kanban, claude-squad — they all have this problem. They just retry and hope.

### 2. Dumb Dispatch
Current orchestrators are glorified `for task in tasks: spawn(agent, task)`. No understanding of:
- Task dependency (type definitions before consumers)
- Conflict prediction (two agents editing same file)
- Optimal ordering (foundation first, features second)

### 3. No Recovery Intelligence
When a task fails, orchestrators either:
- Retry with the same prompt (insanity)
- Give up (waste)
- Let the user fix it (defeat)

Nobody does: "TSC failed because type X is missing → find which other task creates type X → merge that first → retry"

---

## The Vision: Intelligent Orchestration

cc-manager should be the orchestrator that **understands what it's doing**.

Not a task queue. Not a worktree manager. An **intelligent build planner for agent work**.

### Core Insight

The best orchestrator is not the one that dispatches fastest.
It's the one that **fails least**.

```
                    Current Orchestrators          cc-manager v0.2
                    ─────────────────────          ──────────────────
Dispatch            Parallel, hope for best        Dependency-aware DAG
Isolation           Full isolation (causes TSC)    Staged merging between waves
Failure handling    Retry or give up               Diagnose → fix dependency → retry
Task ordering       FIFO / priority                Topological sort by code deps
Conflict            Detect after fail              Predict before dispatch
Success rate        ~80%                           Target: 95%+
```

### The Three Pillars

#### Pillar 1: Dependency-Aware Dispatch

Before dispatching, analyze the task set:

```
Tasks:
  T1: Create types.ts (new types)
  T2: Create router.ts (imports types.ts)
  T3: Modify scheduler.ts (imports nothing new)
  T4: Create memory.ts (imports store.ts patterns)

Dependency graph:
  T1 → T2 (T2 depends on T1's types)
  T3 → (independent)
  T4 → (independent)

Execution plan:
  Wave 1: T1, T3, T4 (parallel, no deps)
  Wave 2: T2 (after T1 merges)
```

Between waves: merge completed work to main, rebase remaining worktrees.

This is what we should have done today. Instead we dispatched all 10 in parallel and got 0% auto-merge.

#### Pillar 2: Staged Merging

Don't wait for all tasks to finish. Merge as you go:

```
Time 0:  Dispatch Wave 1 (T1, T3, T4)
Time 2m: T3 completes, TSC passes → merge to main
Time 3m: T1 completes, TSC passes → merge to main
Time 3m: Rebase T4's worktree onto new main
Time 4m: T4 completes, TSC passes → merge to main
Time 4m: Dispatch Wave 2 (T2) on updated main
Time 6m: T2 completes, TSC passes → merge to main
         ALL DONE. 100% success.
```

vs current approach:
```
Time 0:  Dispatch all (T1, T2, T3, T4) in parallel
Time 5m: T2 fails (can't find types from T1)
         T1, T3, T4 fail (TSC sees missing cross-refs)
         0% auto-merge. User manually cherry-picks.
```

#### Pillar 3: Failure Diagnosis Engine

When a task fails, don't just retry. Diagnose:

```
Task T2 failed.
TSC error: "Cannot find module './types.js'"

Diagnosis:
  1. T2 imports from types.ts
  2. types.ts was created by T1 in worker/worker-0
  3. T1 hasn't merged to main yet
  4. Resolution: merge T1 first, rebase T2's worktree, retry T2

Action: merge T1 → rebase T2 → retry T2
```

This turns "retry with same prompt" into "fix the environment, then retry".

For code-level failures:
```
Task T5 failed.
Agent output: "Error: property 'tags' does not exist on type TaskCreateInput"

Diagnosis:
  1. Agent hallucinated a 'tags' field on TaskCreateInput
  2. TaskCreateInput is defined in types.ts
  3. Fix: remove 'tags' from the generated code

Action: spawn fix agent with targeted prompt:
  "In file X, remove the 'tags' property — it doesn't exist on TaskCreateInput"
```

---

## Product Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     cc-manager v0.2                          │
│                                                             │
│  ┌─────────────────┐                                        │
│  │  Issue Source    │  GitHub Issues / Linear / CLI / API    │
│  └────────┬────────┘                                        │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │  Task Analyzer   │  ← NEW: analyze code deps, predict    │
│  │                  │    conflicts, build execution DAG      │
│  └────────┬────────┘                                        │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │  Wave Planner    │  ← NEW: topological sort into waves,  │
│  │                  │    maximize parallelism within waves   │
│  └────────┬────────┘                                        │
│           ▼                                                 │
│  ┌─────────────────────────────────────────┐                │
│  │  Execution Engine                        │                │
│  │                                          │                │
│  │  Wave 1: ┌──┐ ┌──┐ ┌──┐                │                │
│  │          │W0│ │W1│ │W2│  (parallel)     │                │
│  │          └──┘ └──┘ └──┘                 │                │
│  │            ↓                             │                │
│  │  Staged Merge: merge completed → rebase  │  ← NEW        │
│  │            ↓                             │                │
│  │  Wave 2: ┌──┐ ┌──┐                     │                │
│  │          │W3│ │W4│  (parallel)          │                │
│  │          └──┘ └──┘                      │                │
│  │            ↓                             │                │
│  │  Staged Merge → rebase → ...            │                │
│  └─────────────────────────────────────────┘                │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │ Failure Diagnoser│  ← NEW: parse TSC/test errors,        │
│  │                  │    identify root cause, auto-fix       │
│  └────────┬────────┘                                        │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │  PR / Merge      │  cross-review → merge → close issue   │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## What We Build (Priority Order)

### P0: Make the basic loop work (success rate from 0% to 80%+)

1. **Staged merging** — merge completed tasks immediately, don't wait for all
2. **Worktree rebase** — after each merge, rebase active worktrees onto new main
3. **TSC error diagnosis** — parse TSC errors, identify missing deps, auto-resolve

This alone would have turned today's 0/20 into ~16/20.

### P1: Make it smart (success rate from 80% to 95%+)

4. **Task dependency analysis** — before dispatch, analyze which tasks create/consume types/files
5. **Wave planning** — group independent tasks into waves, sequence dependent tasks
6. **Conflict prediction** — detect when two tasks will edit the same file, sequence them

### P2: Make it beautiful (user acquisition)

7. **Real-time dashboard** — show wave progress, dependency graph, live agent output
8. **One-command experience** — `cc-m run "do all open issues"` (Opus decomposes, plans, executes)
9. **Mobile notifications** — Telegram/Slack bot for completion alerts

### P3: Make it unstoppable (moat)

10. **Learning from failures** — every failure becomes a routing/prompting improvement
11. **Agent benchmarking** — continuously test which agent is best for which task type
12. **Self-evolution** — auto-upgrade agents, auto-discover new ones

---

## Success Metric

One number: **End-to-end success rate**.

```
Success = (tasks that auto-merge with passing tests) / (total tasks submitted)

Today:     0/20 = 0%     ← embarrassing
Target P0: 16/20 = 80%   ← competitive with Composio
Target P1: 19/20 = 95%   ← best in class
Target P2: with auto-retry and diagnosis, effective 99%
```

Everything we build must move this number up.

---

## Why This Wins

Every other orchestrator is a **dumb dispatcher** with a nice UI.

cc-manager will be the **smart dispatcher** that:
1. Understands task dependencies before dispatch
2. Merges incrementally instead of all-or-nothing
3. Diagnoses failures and fixes them automatically

The analogy: other orchestrators are `make -j10` (parallel but dumb).
cc-manager should be `bazel` (understands the dependency graph, caches intermediates, retries intelligently).

No amount of UI polish or plugin architecture will beat 95% success rate.
The user will tolerate an ugly dashboard if their issues get solved overnight.
