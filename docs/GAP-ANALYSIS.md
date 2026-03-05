# cc-manager: Gap Analysis & Action Plan

> Simple but powerful. Fix what's broken, connect what's disconnected, add what's missing.

---

## 1. Self-Assessment

### What works
- Worktree pool (create/acquire/release/merge)
- SQLite persistence (WAL, 24-col tasks table)
- SSE real-time events
- Priority queue with event-driven dispatch
- TSC build gate
- Multi-agent (Claude CLI/SDK, Codex, any CLI)
- Budget control
- Web dashboard + CLI (cc-m)

### What's dead code (~40%)
- `state-machine.ts` — FSM never called by Scheduler
- `router.ts` — smart routing never called
- `memory.ts` — execution memory never called
- `workpad.ts` — progress files never written
- `store.claimTask()` — atomic claim never used
- `orchestrator.ts` — DAG decomposition has no API endpoint

### What's broken
- `listTasks()` reads only memory, not SQLite → empty after restart
- Rate limit hardcoded to single key → effectively disabled
- Two conflicting `AgentPlugin` interfaces
- Pool lock is 10ms spin → should be Promise queue

---

## 2. Gap vs Competitors

### Critical (blocks success rate)

| Gap | What competitors do | Effort |
|-----|--------------------:|-------:|
| No staged merging | Gas Town Refinery: serial merge queue + CI bisect | ~200 LOC |
| No wave planning | Gas Town Convoy (manual), nobody auto-analyzes | ~300 LOC |
| No CI feedback loop | Composio: inject CI errors → agent fixes → retry | ~100 LOC |
| No failure diagnosis | Nobody (our moat): parse TSC error → fix env → retry | ~200 LOC |

### Important (blocks robustness)

| Gap | What competitors do | Effort |
|-----|--------------------:|-------:|
| No stall timeout | lalph: output activity, not wall-clock | ~30 LOC |
| No JSONL monitoring | Composio: read session JSONL directly | ~100 LOC |
| No context recovery | Gas Town Handoff/Seance: checkpoint + resume | ~100 LOC |
| No worktree pre-warm | emdash: reserve pool, instant claim | ~50 LOC |
| Dead code not wired | Our own modules exist but aren't connected | ~100 LOC |

### Nice-to-have (blocks adoption)

| Gap | What competitors do | Effort |
|-----|--------------------:|-------:|
| No provider registry | emdash: declarative agent config | ~150 LOC |
| No attempt model | vibe-kanban: multiple tries, compare diffs | ~100 LOC |
| No auth | Everyone except simple tools | ~50 LOC |
| No Telegram/IM | metabot: mobile monitoring | ~200 LOC |

---

## 3. Action Plan: 3 Sprints

### Sprint 1: Wire + Core Loop (0% → 80%)

**Wire dead code:**
- Connect FSM to Scheduler (use `transition()` instead of raw string assignment)
- Connect Router to dispatch (pick best agent per task)
- Connect Memory to post-execution (record outcomes)
- Add `/api/orchestrate` endpoint for Orchestrator
- Fix `listTasks()` to merge memory + SQLite
- Fix rate limit bug

**Add core loop:**
- `staged-merger.ts` — merge completed tasks immediately, rebase active worktrees
- `wave-planner.ts` — analyze deps, topological sort into waves
- CI feedback in `agent-runner.ts` — on TSC fail, inject errors as retry context
- `failure-diagnoser.ts` — parse TSC errors, identify missing deps, auto-resolve

### Sprint 2: Robustness (80% → 90%)

- Stall timeout (replace wall-clock with output-activity)
- JSONL monitor (read Claude session files)
- Handoff protocol (checkpoint + resume)
- Worktree pre-warming (reserve pool)
- Promise-based pool lock (replace spin)

### Sprint 3: Polish (90% → 95%)

- Provider registry (declarative agent config)
- Attempt model (multiple tries per task)
- API auth (Bearer token)
- Enhanced dashboard (kanban lanes)

---

## 4. Sprint 1 Scaffold

### New files (4):

```
src/staged-merger.ts     — merge queue + rebase active worktrees
src/wave-planner.ts      — dependency analysis + wave generation
src/failure-diagnoser.ts — parse errors + identify root cause + suggest fix
src/pipeline.ts          — connects everything: wave → dispatch → merge → diagnose
```

### Modified files (4):

```
src/scheduler.ts    — use FSM transitions, call Router, call Memory
src/agent-runner.ts — CI feedback loop (inject TSC errors on retry)
src/server.ts       — add /api/orchestrate, fix listTasks, fix rate limit
src/index.ts        — wire Pipeline into startup
```

### Design principle:

Each new module is a pure function or simple class with:
- Clear input/output types
- No hidden state
- Testable in isolation
- <200 LOC each
