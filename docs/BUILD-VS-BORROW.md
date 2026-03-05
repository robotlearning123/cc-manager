# cc-manager: Build vs Borrow Strategy

> "We didn't build Claude Code. We orchestrate it.
> Same logic: don't build components. Assemble the best ones."

---

## What to BORROW (proven by others)

### From Composio/agent-orchestrator (3.7K stars)

**1. JSONL Event Monitoring** — DON'T parse stdout
```
Claude Code writes structured JSONL events to session files.
Every user message, assistant response, tool execution, turn completion.
Composio reads these directly instead of scraping terminal output.
```
- Source: `agent-claude-code` plugin reads `~/.claude/projects/*/sessions/*.jsonl`
- We should: Read the same JSONL files. No stdout parsing. No self-reporting.
- Effort: ~100 LOC to read and parse CC session events

**2. 8-Slot Plugin Architecture** — proven abstraction boundaries
```
Runtime:   tmux | docker | k8s | process
Agent:     claude-code | codex | aider | opencode
Workspace: worktree | clone
Tracker:   github | linear
SCM:       github
Notifier:  desktop | slack | webhook
Terminal:  iterm2 | web
Lifecycle: core
```
- We already have plugins/types.ts and registry.ts
- Borrow: their slot categorization. Ours lumps too many concerns together.
- Action: Refactor our plugin interface to match these 8 categories

**3. CI Auto-Fix Loop** — their killer feature
```
Agent creates PR → CI fails → orchestrator injects CI logs back into agent session
→ agent fixes → CI passes → merge
```
- We don't have this at all. Tasks just "fail" at TSC gate.
- Borrow: the pattern of feeding failure output back as context for retry
- This alone would have fixed our 0% success rate today

**4. Review Comment Routing**
```
Reviewer leaves comment on PR → orchestrator routes to agent → agent addresses it
```
- We have C3 (PR reviewer) but not the feedback loop back to the original agent

### From claude-squad (6.2K stars)

**5. tmux Session Management** — battle-tested
```go
// claude-squad creates tmux sessions per agent, tracks state
cmd/session.go → tmux new-session -d -s "agent-0" -x 200 -y 50
```
- Our current approach: `spawn("claude", ["-p", prompt])` — basic child_process
- Borrow: tmux as the runtime layer. More robust, survives crashes, inspectable.
- Bonus: user can `tmux attach -t agent-0` to watch any agent live

**6. One-letter CLI** — `cs` (claude-squad)
- We have `cc-m` (3 chars) vs `cs` (2 chars)
- Not critical, but shows their focus on developer ergonomics

### From vibe-kanban (22K stars)

**7. Kanban UI Concept** — why they have 22K stars
- People want to SEE their agent fleet
- Our dashboard is basic SSE + task list
- Borrow: the mental model of kanban columns (Backlog → In Progress → Review → Done)
- Don't build a full React app; enhance our existing HTML dashboard with kanban lanes

**8. "Each workspace gives an agent a branch, a terminal, and a dev server"**
- The three-piece bundle: branch + terminal + dev server per agent
- We have branch + terminal. Missing: per-agent dev server for testing

### From symphony (OpenAI, 4.2K stars)

**9. WORKFLOW.md Spec** — harness engineering
```
Symphony requires repos to have WORKFLOW.md defining:
- How to plan
- How to execute
- How to verify
```
- We already have C6 (workflow-loader). Good.
- Borrow: their specific WORKFLOW.md structure and make it a first-class citizen

**10. "Walkthrough Video" as Proof**
- Symphony agents produce walkthrough videos showing their changes work
- Wild idea but powerful for review — PR includes a video of the change working

### From ccpm (7.6K stars)

**11. PRD → Epic → Task Decomposition Chain**
- ccpm structures work as: PRD → Epic → Task → GitHub Issue → Agent
- We have C8 (orchestrator decomposition) but no PRD/Epic layer
- Borrow: the multi-level decomposition concept for complex projects

### From metabot (96 stars)

**12. IM Bridge for Mobile Access**
- Control agent fleet from Telegram/Feishu on your phone
- `cc-m ls` but from your phone while commuting
- Low effort via Telegram Bot API, high user delight

### From dagger/container-use (3.6K stars)

**13. Container Isolation Option**
- Worktrees share the host filesystem. Containers are fully sandboxed.
- For high-risk tasks (deleting files, running untrusted code): container > worktree
- Borrow: offer both worktree (fast, default) and container (safe, opt-in)

---

## What to BUILD (nobody has this)

### 1. Wave Planner + Staged Merging ← OUR MOAT

**Nobody does this. Confirmed by web search — zero results.**

```
Current (everyone):
  Dispatch all tasks → run in parallel → merge at end → conflicts/TSC fails

cc-manager (our innovation):
  Analyze deps → split into waves → run wave → merge → rebase → next wave
```

This is the ONE thing that makes us better than Composio.
Composio retries on CI failure (reactive). We prevent failure (proactive).

### 2. Failure Diagnosis Engine

Parse TSC/test errors → identify root cause → auto-resolve:
- Missing type → find which task creates it → merge that first
- Import error → fix import path
- Test failure → spawn targeted fix agent

Composio does "inject CI logs back into agent" (reactive).
We do "parse error, identify root cause, fix environment" (proactive).

### 3. Success Rate Tracking as First-Class Metric

No orchestrator shows you: "Your fleet has 87% success rate, up from 72% last week."
Make this the hero number on the dashboard.

---

## Assembly Plan

```
Phase 1: Borrow the basics (make it work)
  ├── #3 CI auto-fix loop (from Composio pattern)
  ├── #1 JSONL event monitoring (from Composio)
  ├── #5 tmux runtime (from claude-squad)
  └── #9 WORKFLOW.md as first-class (from symphony)

Phase 2: Build our moat (make it smart)
  ├── Wave Planner (OURS — nobody has this)
  ├── Staged Merging (OURS — nobody has this)
  └── Failure Diagnosis Engine (OURS — proactive vs reactive)

Phase 3: Borrow the polish (make it beautiful)
  ├── #7 Kanban-style dashboard (from vibe-kanban concept)
  ├── #12 Telegram bot (from metabot)
  ├── #2 8-slot plugin refactor (from Composio)
  └── #13 Container isolation option (from dagger)

Phase 4: Borrow the scale (make it enterprise)
  ├── #11 PRD→Epic→Task chain (from ccpm)
  ├── #4 Review comment routing (from Composio)
  └── Success rate analytics dashboard
```

---

## The Composable Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    cc-manager v0.2                       │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐ │
│  │ Issue Source │  │ Wave Planner│  │ Failure Diag.  │ │
│  │ (GitHub/     │  │ (OURS)      │  │ (OURS)         │ │
│  │  Linear)     │  │ dep analysis│  │ TSC/test parse │ │
│  │ #borrowed    │  │ topo sort   │  │ auto-resolve   │ │
│  └──────┬──────┘  └──────┬──────┘  └───────┬────────┘ │
│         │                │                  │          │
│         ▼                ▼                  ▼          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Execution Engine                    │   │
│  │                                                  │   │
│  │  Runtime: tmux (#5 claude-squad)                │   │
│  │  Workspace: worktree | container (#13 dagger)   │   │
│  │  Monitoring: JSONL events (#1 Composio)         │   │
│  │  Retry: CI log injection (#3 Composio)          │   │
│  │  Merging: staged merge (OURS)                   │   │
│  └─────────────────────────────────────────────────┘   │
│         │                                              │
│         ▼                                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Interface Layer                     │   │
│  │                                                  │   │
│  │  CLI: cc-m (ours)                               │   │
│  │  Dashboard: kanban lanes (#7 vibe-kanban)       │   │
│  │  Mobile: Telegram bot (#12 metabot)             │   │
│  │  API: REST + SSE (ours)                         │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Sources

- [Composio blog: The Self-Improving AI System That Built Itself](https://composio.dev/blog/the-self-improving-ai-system-that-built-itself)
- [Composio blog: Open-Sourcing Agent Orchestrator](https://pkarnal.com/blog/open-sourcing-agent-orchestrator)
- [Running 20 AI Agents in Parallel](https://pkarnal.com/blog/parallel-ai-agents)
- [ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator)
- [smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad)
- [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban)
- [openai/symphony](https://github.com/openai/symphony)
- [dagger/container-use](https://github.com/dagger/container-use)
- [xvirobotics/metabot](https://github.com/xvirobotics/metabot)
