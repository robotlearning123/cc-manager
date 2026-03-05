# TODO

Single coordination backlog for multi-agent work. This file is the execution queue for the current codebase as of 2026-03-05.

## Source of Truth

- Prefer code over older roadmap claims.
- Primary planning refs: `docs/plans/2026-03-05-v0.1.7-plan.md`, `docs/plans/2026-03-05-v0.2-implementation-plan.md`, `docs/ROADMAP.md`.
- Latest review findings elevated several correctness and safety bugs above the previous roadmap work.
- This backlog is cumulative: earlier roadmap items stay here if they are still real todos.

## Backlog Continuity

The earlier TODO was not discarded; its still-valid items were merged into the priority queue below.

- Previous `T1 Failure diagnoser core` -> `P2-A3`
- Previous `T2 Task classifier v2` -> `P2-A5`
- Previous `T3 Docs sync` -> `P3-D2`
- Previous `T4 Pipeline/API docs cleanup` -> `P3-D3`
- Previous `T5 Claude resume support` -> `P2-A6`
- Previous `T6 Structured review output` -> `P2-A7`
- Previous `T7 Codex profile/config management` -> `P2-A8`
- Previous `T8 Pricing/cost table refresh` -> `P2-A9`
- Previous `T9 Wire failure diagnoser into retry flow` -> `P2-A4`
- Previous `T10 Enhanced verification gate` -> `P4-A11`
- Previous `T11 Import-graph wave validation` -> `P4-A10`
- Previous `T12 Smart dead-loop detection` -> `P4-A12`
- Previous `T13 Budget-aware model downgrade` -> `P4-A13`
- Previous `T14 Agent self-evolution/version monitoring` -> `P4-A14`
- Previous `T15 Dashboard v2` -> `P4-D4`

## Coordination Rules

- Each agent claims exactly one task.
- Do not edit files owned by another active task.
- Hot-file tasks must be serialized by lane.
- Every code task must add or update narrow tests.
- Update this file when claiming, blocking, or completing a task.

Claim format:

```md
- [ ] P0-A Task name
  owner: agent-name
  status: in_progress
```

## Hot-File Lanes

Use these lanes to avoid merge collisions.

- Lane S: `src/scheduler.ts`, `src/pipeline.ts`
- Lane A: `src/agent-runner.ts`, `src/types.ts`, `src/store.ts`
- Lane V: `src/server.ts`
- Lane W: `src/worktree-pool.ts`
- Lane D: docs and packaging files

## P0: Correctness And Safety

These are blocking issues and should be addressed before new capability work.

- [ ] P0-S1 Review rejection / merge conflict must not report success
  lane: S
  scope: ensure review rejection and merge conflict paths end in a non-success terminal status and correct API events
  files: `src/scheduler.ts`, related tests
  done when: a task blocked from merge cannot remain `success`

- [ ] P0-S2 Pipeline cancel must stop running tasks
  lane: S
  scope: cancellation must stop already-running pipeline tasks, not just pending ones
  files: `src/pipeline.ts`, `src/scheduler.ts`, related tests
  depends_on: none
  done when: cancelled runs cannot keep mutating the repo or merge afterward

- [ ] P0-S3 Isolate concurrent pipeline runs
  lane: S
  scope: remove shared `_lastDecompose` and shared `.cc-pipeline/tasks.json` state across runs
  files: `src/pipeline.ts`, `src/pipeline-store.ts`, related tests
  depends_on: none
  done when: two pipeline runs can decompose and execute without overwriting each other

- [ ] P0-V1 Harden webhook SSRF validation
  lane: V
  scope: replace string-based host blocking with stricter validation that rejects loopback aliases and local/private targets
  files: `src/server.ts`, related tests
  done when: localhost variants and local-address tricks are rejected

- [ ] P0-A1 Fix advertised default runtime behavior
  lane: A
  scope: make `--timeout`, `--budget`, and `--model` apply consistently to normal tasks, or change API/startup behavior and docs to match reality
  files: `src/index.ts`, `src/server.ts`, `src/scheduler.ts`, `src/agent-runner.ts`, docs/tests as needed
  done when: startup defaults match actual runtime behavior for ordinary task submissions

## P1: Data Integrity And Observability

These are important and can mostly proceed in parallel by lane.

- [ ] P1-A2 Task diff and review must use task-specific commit range
  lane: A
  scope: stop diffing only `HEAD~1..HEAD`; capture full task diff/review scope for multi-commit tasks
  files: `src/agent-runner.ts`, `src/scheduler.ts`, related tests
  done when: cross-agent review covers the full task change set

- [ ] P1-V2 Diff endpoint must not depend on mutable worker state
  lane: V
  scope: return task-specific diffs after worker reuse, not current worktree contents
  files: `src/server.ts`, `src/worktree-pool.ts`, `src/store.ts`, related tests
  done when: `/api/tasks/:id/diff` is stable after worker reassignment

- [ ] P1-V3 GET /api/tasks must include persisted history after restart
  lane: V
  scope: merge scheduler in-memory tasks with store-backed history or route directly through persisted data
  files: `src/server.ts`, `src/scheduler.ts`, `src/store.ts`, related tests
  done when: task history survives process restart in the list API

- [ ] P1-D1 Lock down npm publish surface
  lane: D
  scope: prevent `.cc-pipeline/*`, `.cc-manager.db*`, and other local runtime artifacts from shipping in npm packages
  files: `.npmignore`, `package.json`
  done when: `npm pack --dry-run` includes only intended publish artifacts

## P2: Agent Quality Work

Start these after P0 is merged. Serialize within Lane A.

- [ ] P2-A3 Failure diagnoser core
  lane: A
  scope: add structured parsing for TypeScript/build failures
  files: `src/failure-diagnoser.ts`, `src/__tests__/failure-diagnoser.test.ts`
  done when: failures are categorized into actionable buckets such as missing import/export and dependency-order issues

- [ ] P2-A4 Wire failure diagnoser into retry flow
  lane: A
  scope: inject structured diagnosis into retry prompts and task errors
  files: `src/scheduler.ts`, `src/agent-runner.ts`, `src/failure-diagnoser.ts`, tests
  depends_on: P2-A3
  done when: retries include targeted failure context instead of generic error text

- [ ] P2-A5 Task classifier v2
  lane: A
  scope: enrich classification beyond `quick|standard|deep`
  files: `src/task-classifier.ts`, `src/__tests__/task-classifier.test.ts`
  done when: routing metadata supports future agent/model/context decisions without breaking callers

- [ ] P2-A6 Claude resume support
  lane: A
  scope: capture session identifiers and reuse them on retry
  files: `src/agent-runner.ts`, `src/types.ts`, `src/store.ts`, related tests
  done when: retry can continue prior session context instead of always starting cold

- [ ] P2-A7 Structured review output
  lane: A
  scope: replace brittle review parsing with schema-shaped output
  files: `src/agent-runner.ts`, related tests
  done when: review approval, score, and issues are parsed deterministically

- [ ] P2-A8 Codex profile/config management
  lane: A
  scope: generate or validate `~/.codex/config.toml` profiles for default and wide-context execution
  files: `src/agent-runner.ts`, related tests, docs if needed
  done when: Codex routing does not rely on undocumented local manual setup

- [ ] P2-A9 Pricing and cost table refresh
  lane: A
  scope: ensure supported model rates are current and covered by tests
  files: `src/agent-runner.ts`, tests
  done when: supported Claude and Codex model rates are verified in tests

## P3: Docs And Roadmap Cleanup

- [ ] P3-D2 Sync roadmap docs with shipped code
  lane: D
  scope: update docs that still describe pipeline, DAG, or staged rebase as missing
  files: `docs/ROADMAP.md`, `docs/GAP-ANALYSIS.md`, optionally `docs/STRATEGY.md`
  done when: roadmap docs match the current implementation

- [ ] P3-D3 Document pipeline and approval flow
  lane: D
  scope: document current pipeline endpoints, approval flow, and operator workflow
  files: `README.md`, `docs/API.md`, `docs/OPERATIONS.md`
  done when: contributors can discover pipeline behavior without reading source

## Deferred

- [ ] P4-A10 Import-graph wave validation
- [ ] P4-A11 Enhanced verification gate
- [ ] P4-A12 Smart dead-loop detection
- [ ] P4-A13 Budget-aware model downgrade
- [ ] P4-D4 Dashboard v2
- [ ] P4-A14 Agent self-evolution/version monitoring
