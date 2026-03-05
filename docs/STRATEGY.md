# cc-manager Strategy Notes

## Competitive Landscape (2026-03)
- 18+ competing projects in "coding agent orchestrator" space
- Top: vibe-kanban (22K stars), humanlayer (9.7K), ccpm (7.6K), claude-squad (6.2K)
- Closest competitor: ComposioHQ/agent-orchestrator (3.7K stars, 8-slot plugin, CI auto-fix)
- ALL competitors are dumb dispatchers — none do dependency-aware wave planning

## cc-manager Key Insight
Every orchestrator does: dispatch → hope → retry
cc-manager should do: analyze deps → plan waves → merge incrementally → diagnose failures

## Learned from 2026-03-05 Sprint
- 20 tasks, 10 workers, $12.29 total cost
- 0% auto-merge (TSC gate), but all code was correct (367 tests pass after manual merge)
- Root cause: parallel worktrees can't see each other's new types
- Fix needed: staged merging between waves, not all-at-once dispatch

## Four Pillars
1. Dependency-aware dispatch (build DAG before dispatching)
2. Staged merging (merge completed → rebase active → continue)
3. Failure diagnosis (parse errors → identify root cause → auto-fix)
4. **Agent self-evolution** (monitor 3 agent versions → detect new features → auto-upgrade integration)
   - cc-manager consumes the agents it orchestrates to upgrade itself
   - See [3-agents-reference.md](3-agents-reference.md) "Self-Evolution: Agent Version Monitor" section

## Key Borrowed Patterns (priority order)
1. Refinery merge queue + CI bisect (Gas Town) — batch merge, binary search failure
2. CI auto-fix loop (Composio) — inject failure logs back into agent
3. GUPP hook pattern (Gas Town) — task injected into CLAUDE.md, auto-execute
4. Handoff + Seance (Gas Town) — context recovery across sessions
5. JSONL event monitoring (Composio) — read ~/.claude/projects/*/sessions/*.jsonl
6. Stall timeout (lalph) — output activity, not wall-clock
7. Worktree pool pre-warming (emdash) — instant task start
8. CLAUDE* env filtering (metabot) — prevent nested session errors
9. Provider registry (emdash/vibe-kanban) — declarative agent config
10. Attempt model (vibe-kanban) — multiple tries per task, compare diffs
11. Dual persistence (Gas Town) — SQLite + JSONL git-tracked
12. Three-phase lifecycle (emdash) — setup/run/teardown
13. WORKFLOW.md (symphony) — YAML frontmatter + Liquid template prompt

## Gas Town (steveyegge/gastown) — Closest Competitor
- Go-based, Dolt + JSONL, tmux sessions
- Convoy ≈ our Wave (but manual, not auto-analyzed)
- Refinery ≈ our Staged Merger (Bors-style, with CI bisect)
- GUPP = hook-based auto-push (agent auto-executes pinned task)
- Handoff/Seance = context recovery across sessions
- Our advantage: automatic dependency analysis + proactive failure diagnosis

## Documentation Map
- docs/plans/2026-03-05-v0.2-implementation-plan.md — v0.2 concrete plan (9 features, 3 phases)
- docs/3-agents-reference.md — Claude CLI, Claude SDK, Codex CLI features + gaps + routing
- docs/research/2026-03-05-agent-landscape.md — Perplexity Computer, GPT-5.4, latest SDK/CLI research
- docs/SOURCE-CODE-ANALYSIS.md — 11 competitor deep-dives
- docs/BUILD-VS-BORROW.md — what to build vs borrow
- docs/PRODUCT-VISION.md — three pillars + priority order
- docs/COMPETITIVE-ANALYSIS.md — market map + feature matrix
- docs/ROADMAP.md — v0.1.x → v0.2.0 unified roadmap
- docs/GAP-ANALYSIS.md — self-assessment + action plan

## User Role Model
- User is CEO, cc-m is CTO with R&D team
- cc-manager should run autonomously: Issues in → PRs merged out
- One metric: end-to-end success rate (current: 0%, target: 95%)
