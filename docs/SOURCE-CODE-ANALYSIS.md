# Competitor Source Code Analysis

> Deep-dive of 11 coding agent orchestrator projects.
> Research date: 2026-03-05

---

## Tier 1: Full Orchestrators

### 1. ComposioHQ/agent-orchestrator (3.7K stars)

**Architecture**: TypeScript, 8-slot plugin system, YAML config, stateless flat-file

**Key patterns**:
- **JSONL Event Monitoring**: Reads `~/.claude/projects/*/sessions/*.jsonl` directly instead of parsing stdout. Every message, tool call, and turn completion is a structured event.
- **8-Slot Plugin Architecture**: Runtime (tmux/docker/k8s), Agent (claude/codex/aider), Workspace (worktree/clone), Tracker (github/linear), SCM, Notifier, Terminal, Lifecycle
- **CI Auto-Fix Reaction Engine**: CI fails → parse error logs → inject back into agent session → agent fixes → retry. This is their killer feature.
- **Review Comment Routing**: PR comment → route to the agent that wrote the code → agent addresses it
- **Self-built**: 30 agents, 8 days, 40K LOC, 84.6% CI success

**Borrow**: JSONL monitoring, CI feedback loop, review routing

### 2. BloopAI/vibe-kanban (22K stars)

**Architecture**: Rust 49.6% (Axum + Tokio + SQLx) + TypeScript 48% (React + TanStack + Zustand)

**Key patterns**:
- **Attempt 1:N model**: Each task can have multiple attempts with different agents/prompts. Compare diffs across attempts. This treats LLM non-determinism as a product feature.
- **`ts-rs` cross-language types**: Rust structs auto-generate TypeScript interfaces. Backend change → frontend build fails. Eliminates API drift.
- **Per-path async mutex**: Worktree creation uses `LazyLock<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>` for concurrent safety
- **Four-step worktree cleanup**: `git worktree remove --force` → delete `.git/worktrees/` metadata → `fs::remove_dir_all` → `git worktree prune`
- **Orphan cleanup on startup**: Scan worktree base dir, delete directories with no DB record
- **Electric SQL**: Local-first SQLite sync for offline-capable kanban board
- **`enum_dispatch` agent trait**: Adding new agent = add enum variant + implement trait methods
- **MCP dual integration**: Acts as both MCP client (connecting to tools) AND MCP server (exposing board to agents)

**Borrow**: Attempt model, worktree cleanup sequence, startup orphan cleanup

### 3. automazeio/ccpm (7.6K stars)

**Architecture**: Pure Markdown protocol — all logic in `.claude/commands/pm/*.md` slash commands

**Key patterns**:
- **PRD → Epic → Task → Issue pipeline**: 5-phase discipline with full traceability
- **File rename as mapping**: `001.md` → `{issue-id}.md` after GitHub sync. No database needed.
- **Command YAML frontmatter**: Each command declares its required tools (`Read, Write, Bash, Task`)
- **`epics/` in .gitignore**: Local PM workspace stays local, GitHub Issues are team truth
- **Context isolation**: Sub-agents read `.claude/context/`, return only summaries
- **`/pm:next`**: Auto-picks next priority task with full epic context
- **`parallel: true` + `depends_on` + `conflicts_with`**: Task metadata for scheduling

**Borrow**: Task dependency metadata format, `/pm:next` auto-pick, context isolation

### 4. openai/symphony (4.2K stars)

**Architecture**: Elixir OTP GenServer, WORKFLOW.md as single config

**Key patterns**:
- **WORKFLOW.md = YAML frontmatter + Liquid template prompt**: Single file configures tracker, workspace, agent, polling, hooks, and agent prompt
- **Workspace hooks**: `after_create / before_run / after_run / before_remove` lifecycle
- **Skills as `.codex/*.md`**: `land.md` teaches agent to squash-merge safely. Skills are copyable Markdown.
- **Tracker writes through agent**: Symphony only reads Linear; agent writes via injected `linear_graphql` tool
- **Thread sandbox**: `workspace-write` limits agent to its own directory
- **Deterministic workspace key**: `sanitize(issue.identifier)` → directory name. No DB needed to rebuild state.
- **Continuation turns**: After max_turns, agent pauses. Next poll cycle resumes with continuation guidance prompt.
- **Proof-of-work package**: CI status + review addressed + complexity + walkthrough

**Borrow**: WORKFLOW.md format, workspace hooks, continuation turns, proof-of-work

### 5. smtg-ai/claude-squad (6.2K stars)

**Architecture**: Go 87.9%, tmux session manager, Bubbletea TUI

**Key patterns**:
- **tmux as process container**: `tmux new-session -d -s "agent-0" -x 200 -y 50`. Survives crashes, user can `tmux attach` to watch.
- **PTY input injection**: `tmux send-keys -t session "prompt text" Enter` for agents without --prompt flag
- **SHA256 completion detection**: Hash pane content every tick. If hash unchanged for N ticks → agent is idle/done.
- **Git worktree lifecycle**: `Setup() → Cleanup() → Remove() → Pause() → Resume()`
- **`state.json` persistence**: Minimal state file for crash recovery

**Borrow**: tmux runtime, SHA256 completion detection, worktree lifecycle

---

## Tier 2: Specialized Tools

### 6. tim-smart/lalph (92 stars) — closest to cc-manager

**Key patterns**:
- **Label-based agent routing**: Issue labels map to agent presets (e.g., "fast-lane" → Sonnet, "deep-think" → Opus)
- **Stall timeout**: Tracks last output time, not wall-clock. Agent alive if producing output.
- **Issue dependency graph**: Wait for dependency PR to merge before starting next issue
- **Plan mode → `.specs/`**: High-level spec → auto-generate PRD → auto-create sub-issues
- **Finalizer auto-rollback**: `Effect.addFinalizer` resets issue to "todo" on failure
- **Chooser → task.json protocol**: LLM writes choice to file, orchestrator reads it

**Borrow**: Stall timeout, label routing, issue dependency graph

### 7. generalaction/emdash (2.4K stars, YC W26)

**Key patterns**:
- **Worktree pool pre-warming**: Background pre-create reserve worktrees. `claimReserve()` returns instantly.
- **22-provider registry**: Declarative config for each agent's CLI flags, prompt method, resume method
- **Keystroke injection**: For agents without `--prompt` flag, inject via PTY keystrokes
- **PTY env var whitelist**: Only pass listed env vars to agent (prevent secret leakage)
- **Three-phase lifecycle**: `setup → run → teardown`, each with own status/logs/timeout
- **HTTP hook server + UUID token**: Agent → HTTP POST → orchestrator, decoupled event notification
- **`killProcessTree`**: `process.kill(-pid, signal)` for process group cleanup

**Borrow**: Worktree pool, provider registry, three-phase lifecycle, process group kill

### 8. dagger/container-use (3.6K stars)

**Key patterns**:
- **Git notes for state storage**: Container ID and config stored in `refs/notes/container-use`. No external DB. `git fetch` syncs state.
- **`environment_checkpoint`**: Snapshot container state at key points, rollback on failure
- **12 MCP tools**: `environment_create/open/run_cmd/file_read/write/edit/add_service/checkpoint`
- **Single/multi-tenant MCP modes**: Per-chat or shared server

**Borrow**: Git notes for state, checkpoint/rollback concept

### 9. xvirobotics/metabot (96 stars)

**Key patterns**:
- **Agent Bus REST API**: `POST /api/tasks` (delegate), `POST /api/bots` (create agent), `POST /api/schedule` (cron)
- **CLAUDE* env var filtering**: Filter `CLAUDE_*` vars to avoid nested session detection
- **MetaMemory**: SQLite + Markdown dual knowledge base, shared across all agents
- **chatId → sessionId persistence**: Resume agent sessions across IM conversations
- **Cron scheduler**: Persistent to JSON, survives restart

**Borrow**: CLAUDE* env filtering, Agent Bus API pattern, cron scheduler

### 10. manaflow-ai/cmux (4.2K stars)

**Key patterns**:
- **OSC 777 notification protocol**: Terminal escape sequences for agent notifications
- **Claude Code hook integration**: `Stop` and `PostToolUse` hooks → notification → workspace auto-reorder
- **UNIX domain socket control**: `cmux workspace create/focus/notify` via socket API
- **Sidebar status aggregation**: branch + PR + ports + last notification in one line

**Borrow**: Hook-based notifications, status aggregation model

### 11. humanlayer/humanlayer (9.6K stars)

**Key patterns**:
- **ACP (Agent Control Plane)**: Distributed scheduler for remote cloud workers
- **"Advanced Context Engineering"**: Specialized for large codebases
- **MULTICLAUDE**: Parallel Claude Code execution

### 12. steveyegge/gastown (Steve Yegge)

**Architecture**: Go 1.23+, Dolt (versioned SQLite) + JSONL, tmux sessions, git worktrees

**The closest project to our vision.** Gas Town has:

**Role hierarchy**:
- **Mayor** = coordinator (user's single entry point, dispatches work)
- **Polecats** = ephemeral worker agents (20-30 parallel, each in own worktree)
- **Refinery** = merge queue manager (serial merge, conflict resolution)
- **Witness** = supervisor (detects stuck agents, triggers recovery)
- **Deacon** = daemon (patrol every 5 min, health monitoring)

**Key patterns**:
- **Convoy ≈ Wave**: Batch related tasks, `convoy stage` → `convoy launch`. BUT: manually created, no auto dependency analysis.
- **Refinery ≈ Staged Merger**: Bors-style batch merge → run CI on tip → binary search for failure source on CI fail. Serial integration of parallel MR streams.
- **GUPP (Universal Propulsion Principle)**: "If there is work on your Hook, YOU MUST RUN IT." — each agent has a pinned task as work queue, auto-executes on session start.
- **Beads dual persistence**: SQLite (fast query) + JSONL (git-tracked). JSONL commits with code for cross-machine sync.
- **Handoff + Seance**: `gt handoff` gracefully restarts agent at context limit. `gt seance` lets new session query previous session's decisions.
- **NDI (Non-Deterministic Idempotency)**: All workflows assume agent can crash anytime. Tasks resume from any intermediate state.
- **Six-stage lifecycle**: CREATE → LIVE → CLOSE → DECAY → COMPACT → FLATTEN. Wisp Reaper auto-closes stale tasks after 7 days.
- **MEOW stack**: Formulas (TOML templates) → Protomolecules → Molecules (multi-step workflows) → Beads (atomic tasks) → Wisps (ephemeral)

**What Gas Town has that we don't**:
- Refinery merge queue with CI bisect
- Handoff/Seance context recovery
- Role-based architecture (Mayor/Polecat/Refinery/Witness)
- GUPP hook-based auto-push

**What we have that Gas Town doesn't**:
- **Automatic dependency analysis** (Gas Town's Convoy is manual)
- **Cross-task type tracking** (which task creates types another needs)
- **Proactive failure diagnosis** (parse error → identify root cause → fix env)

**Borrow**: Refinery merge queue + bisect, GUPP hook pattern, Handoff context recovery, Beads dual persistence, role separation

---

## Cross-Cutting Patterns (appears in 3+ projects)

| Pattern | Projects | Description |
|---------|----------|-------------|
| Git worktree isolation | ALL 11 | Every project uses worktrees for agent isolation |
| YAML/MD config files | ccpm, symphony, lalph | Single-file declarative configuration |
| Agent as subprocess | ALL except container-use | spawn CLI process, monitor stdout/stderr |
| SSE for real-time updates | vibe-kanban, composio, cc-manager | Server-sent events for dashboard |
| SQLite for state | vibe-kanban, emdash, metabot | Local-first persistence |
| `gh` CLI for GitHub | ALL with GitHub integration | Standard PR/issue management |
| Exponential backoff retry | symphony, composio, cc-manager | Failure recovery |
| Process group kill | emdash, claude-squad | `-pid` signal for clean teardown |

---

## What Nobody Does (our moat opportunity)

| Feature | Status across all 11 projects |
|---------|-------------------------------|
| **Dependency-aware wave planning** | Gas Town has manual Convoy. Nobody does auto-analysis. |
| **Staged merging between waves** | Gas Town's Refinery is closest (Bors-style). But no wave↔merge integration. |
| **Proactive failure diagnosis** | ZERO projects. All do reactive retry. |
| **Cross-task type dependency tracking** | ZERO projects. All treat tasks as independent. |

Gas Town's Refinery is the closest to our staged merging vision, but it lacks:
1. Auto dependency analysis (Convoys are manual)
2. Wave↔merge integration (Refinery runs independently of dispatch)
3. Proactive diagnosis (still reactive retry)

**Our moat = the integration**: analyze deps → auto-plan waves → staged merge → diagnose failures. Nobody connects all four.
