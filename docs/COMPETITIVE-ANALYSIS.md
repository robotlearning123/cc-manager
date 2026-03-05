# Coding Agent Orchestrator: Competitive Analysis

**Date**: 2026-03-05
**Category**: Tools that orchestrate existing coding agent CLIs (not frameworks for building agents from scratch)

---

## Market Map

```
                        Full Automation
                             ▲
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              │  agent-orch  │  cc-manager  │
              │  (Composio)  │  (Agent Next)│
              │              │              │
              │    symphony  │   lalph      │
              │    (OpenAI)  │              │
   CLI-only ──┼──────────────┼──────────────┼── GUI-first
              │              │              │
              │ claude-squad │  vibe-kanban │
              │    cmux      │  humanlayer  │
              │    amux      │  emdash      │
              │              │  parallel-   │
              │              │    code      │
              └──────────────┼──────────────┘
                             │
                             ▼
                      Manual Control
```

---

## Tier 1: Direct Competitors (Full Orchestrators)

### 1. BloopAI/vibe-kanban — 22,439 stars
- **URL**: https://github.com/BloopAI/vibe-kanban
- **Agents**: 10+ (Claude Code, Copilot, Gemini CLI, Codex, Amp, Cursor, OpenCode, Droid, CCR, Qwen Code)
- **Lang**: Rust (49.6%) + TypeScript (46.4%)
- **Architecture**: Kanban board UI as task manager, each task in isolated git worktree. SQLx persistence.
- **Isolation**: Git worktree, one branch per task
- **Key differentiator**: Visual kanban is the core UX — drag tasks, assign to agents, view diffs, create PRs. Built-in preview browser.
- **Weakness**: Manual task creation/assignment (no auto-dispatch), no budget control.
- **vs cc-manager**: vibe-kanban is human-managed kanban; cc-manager is automated queue dispatch.

### 2. humanlayer/humanlayer (CodeLayer) — 9,654 stars
- **URL**: https://github.com/humanlayer/humanlayer
- **Agents**: Claude Code primarily ("Superhuman for Claude Code")
- **Lang**: TypeScript (59.2%) + Go (33.6%) + Docker Compose
- **Architecture**: IDE-level experience. "MULTICLAUDE" for parallel execution. ACP (Agent Control Plane) as distributed scheduler.
- **Isolation**: Git worktree + optional remote cloud workers
- **Key differentiator**: "Advanced Context Engineering" for large codebases. Keyboard-first IDE replacement.
- **Weakness**: Heavy, steep learning curve. Primarily Claude Code only.
- **vs cc-manager**: humanlayer is a full IDE replacement; cc-manager is a lightweight CLI orchestrator.

### 3. automazeio/ccpm — 7,558 stars
- **URL**: https://github.com/automazeio/ccpm
- **Agents**: Claude Code via `/pm:` commands
- **Architecture**: CLAUDE.md spec + `.claude/` directory structure (PRDs, epics, tasks) + GitHub Issues as single source of truth.
- **Isolation**: Git worktree, one branch per task
- **Key differentiator**: Spec-driven workflow (PRD → epic → task → Issue → agent). Full traceability. Supports human+AI mixed collaboration.
- **Weakness**: Requires manual PRD/epic creation. No budget control. No multi-agent type support.
- **vs cc-manager**: ccpm is "requirements to execution" PM framework; cc-manager focuses on execution-layer orchestration.

### 4. smtg-ai/claude-squad — 6,218 stars
- **URL**: https://github.com/smtg-ai/claude-squad
- **Agents**: Claude Code, Aider, Codex, Gemini, OpenCode, Amp
- **Lang**: Go (87.9%)
- **Architecture**: tmux session manager + git worktree isolation. TUI interface, keyboard-driven.
- **Isolation**: Git worktree, one branch per session
- **Key differentiator**: Pure TUI, Go, extremely lightweight. `-p` flag for any agent command. `--dangerously-skip-permissions` yolo mode.
- **Weakness**: Manual-driven (user starts/manages each agent in TUI). No task queue, no budget, no auto-merge.
- **vs cc-manager**: claude-squad is manual TUI multiplexer; cc-manager is automated queue orchestrator.

### 5. openai/symphony — 4,232 stars
- **URL**: https://github.com/openai/symphony
- **Agents**: Codex primarily
- **Lang**: Elixir reference implementation + spec docs
- **Architecture**: Monitors Linear/work boards → auto-spawns agents → CI verification → safe PR landing.
- **Key differentiator**: OpenAI official. Emphasizes "harness engineering" (codebase must adopt specific practices). More spec/protocol than turnkey tool.
- **Weakness**: Requires team adoption of the spec. No budget control, no GUI.
- **vs cc-manager**: symphony is spec + reference impl; cc-manager is ready-to-use tool.

### 6. ComposioHQ/agent-orchestrator — 3,709 stars
- **URL**: https://github.com/ComposioHQ/agent-orchestrator
- **Agents**: Claude Code, Codex, Aider, OpenCode
- **Lang**: TypeScript
- **Architecture**: 8-slot plugin architecture. Runtimes (tmux/Docker/k8s), workspaces (worktree/clone), issue trackers (GitHub/Linear) are all pluggable. Reads Claude Code's structured JSONL event file for monitoring.
- **Isolation**: Git worktree (default) or clone
- **Task source**: GitHub Issues, Linear
- **Key differentiator**:
  - Auto-handles CI failures (injects failure logs back into agent session)
  - Auto-addresses code review comments (routes to corresponding agent)
  - Dashboard for 30 parallel agents
  - Self-improvement loop: records performance metrics, adjusts strategies
  - **Built itself**: 30 agents in parallel, 8 days, 40,000 LOC TypeScript, 84.6% CI success
- **Weakness**: No budget control. More focused on CI/PR lifecycle than task queue management.
- **vs cc-manager**: Closest full-feature competitor. Composio has more mature plugin system; cc-manager has budget control.

---

## Tier 2: Parallel Runners / TUI Tools

| Project | Stars | Agents | Key Feature | Weakness |
|---------|-------|--------|-------------|----------|
| [manaflow-ai/cmux](https://github.com/manaflow-ai/cmux) | 4,184 | CC/OpenCode/Codex | macOS native, GPU-accelerated terminal, notification-driven | macOS only, no auto-dispatch |
| [dagger/container-use](https://github.com/dagger/container-use) | 3,586 | Any MCP agent | **Container isolation** (not worktree), Dagger engine, cross-env consistency | Runtime layer only, no task queue |
| [stravu/crystal](https://github.com/stravu/crystal) | 2,968 | Codex/CC | Desktop app | **Deprecated** Feb 2026, replaced by Nimbalyst |
| [generalaction/emdash](https://github.com/generalaction/emdash) | 2,372 | **22 agents** (most) | YC W26, Linear/GitHub/Jira import, SSH/SFTP remote | Early stage, unclear auto-merge |
| [subsy/ralph-tui](https://github.com/subsy/ralph-tui) | 2,047 | CC/OpenCode/Factory/Gemini/Codex | Autonomous serial loop, PRD+Beads task tracker | **Serial only** (one task at a time) |
| [coder/mux](https://github.com/coder/mux) | 1,294 | Multi-LLM (API, not CLI) | SSH remote execution, cost tracking | Calls APIs directly, not CLI wrappers |
| [johannesjo/parallel-code](https://github.com/johannesjo/parallel-code) | 313 | CC/Codex/Gemini | Electron GUI, mobile QR code monitoring | No task queue, no auto-merge |

---

## Tier 3: Niche / Special Purpose

| Project | Stars | Unique Angle |
|---------|-------|-------------|
| [xvirobotics/metabot](https://github.com/xvirobotics/metabot) | 96 | **IM bridge** — control CC teams via Feishu/Telegram. Shared MetaMemory (SQLite). Agent Bus REST API for inter-agent delegation. Cron scheduling. |
| [tim-smart/lalph](https://github.com/tim-smart/lalph) | 92 | **Architecture closest to cc-manager**: issue-driven, label-based routing, auto-merge, task dependencies, git worktree concurrency. |
| [dsifry/metaswarm](https://github.com/dsifry/metaswarm) | 95 | 18 agents collaboration framework |
| [nyldn/claude-octopus](https://github.com/nyldn/claude-octopus) | 1,016 | Multi-agent consensus mechanism |
| [andyrewlee/amux](https://github.com/andyrewlee/amux) | 42 | Minimal TUI multiplexer |

---

## Tier 4: Commercial / Closed Source

| Product | Key Feature |
|---------|-------------|
| **GitHub Agent HQ** | GitHub-native. Assign same issue to Copilot+Claude+Codex simultaneously, compare results. Enterprise audit trail. |
| **Cognition Devin** (MultiDevin) | Multiple Devin VMs in parallel. Closed SaaS. |
| **Factory** | Enterprise agent fleet management. SOC2 compliant. |

---

## Feature Comparison Matrix

| Feature | cc-manager | agent-orch (Composio) | vibe-kanban | claude-squad | symphony | ccpm |
|---------|-----------|----------------------|-------------|--------------|----------|------|
| **Budget cap ($$$)** | **YES** | No | No | No | No | No |
| Auto task dispatch | **YES** | **YES** | Manual | Manual | **YES** | Manual |
| Auto-merge pipeline | **YES** | **YES** (CI-aware) | PR creation | Manual | **YES** | Manual |
| Cross-agent review | **YES** (C3) | **YES** | No | No | No | No |
| Plugin architecture | Planned (v0.1.4) | **YES** (8-slot) | No | No | Spec | No |
| Self-evolution | Planned (v0.1.4) | **YES** | No | No | No | No |
| Issue tracker integration | **YES** (C1) | **YES** | No | No | **YES** (Linear) | **YES** (GitHub) |
| State machine | **YES** (C5) | **YES** | No | No | No | No |
| Agent memory / learning | **YES** (memory.ts) | **YES** | No | No | No | No |
| GUI / Dashboard | Basic web | Dashboard | **Kanban** | TUI | No | No |
| One-line start | `cc-manager --repo .` | Config required | Config required | `cs` | Config required | Config required |
| Multi-agent types | CC/CX/any CLI | CC/CX/Aider/OpenCode | 10+ agents | 6 agents | CX | CC only |
| Worktree isolation | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** |
| Container isolation | No | Docker/k8s option | No | No | No | No |
| SSE real-time events | **YES** | **YES** | No | Terminal | No | No |
| Cost tracking | **YES** | No | No | No | No | No |
| Tests | 367 | Unknown | Unknown | Unknown | Unknown | Unknown |

---

## Star Count Rankings (verified 2026-03-05)

| # | Project | Stars | Category |
|---|---------|-------|----------|
| 1 | BloopAI/vibe-kanban | 22,439 | Kanban GUI |
| 2 | humanlayer/humanlayer | 9,654 | IDE + Orchestrator |
| 3 | automazeio/ccpm | 7,558 | PM Protocol |
| 4 | smtg-ai/claude-squad | 6,218 | TUI Multiplexer |
| 5 | openai/symphony | 4,232 | Spec + Ref Impl |
| 6 | manaflow-ai/cmux | 4,184 | macOS Terminal |
| 7 | ComposioHQ/agent-orchestrator | 3,709 | Full Orchestrator |
| 8 | dagger/container-use | 3,586 | Container Runtime |
| 9 | stravu/crystal | 2,968 | Desktop (deprecated) |
| 10 | generalaction/emdash | 2,372 | Desktop, 22 agents |
| 11 | subsy/ralph-tui | 2,047 | Serial Loop |
| 12 | coder/mux | 1,294 | Multi-LLM Desktop |
| 13 | nyldn/claude-octopus | 1,016 | Consensus |
| 14 | johannesjo/parallel-code | 313 | Electron GUI |
| 15 | xvirobotics/metabot | 96 | IM Bridge (Feishu/TG) |
| 16 | dsifry/metaswarm | 95 | 18-agent collab |
| 17 | tim-smart/lalph | 92 | Issue-driven (closest to cc-manager) |
| 18 | andyrewlee/amux | 42 | Minimal TUI |
| — | **agent-next/cc-manager** | **~50** | **Queue + Budget Orchestrator** |
