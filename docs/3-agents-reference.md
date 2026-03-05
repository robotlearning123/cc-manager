# cc-manager: 3-Agent Reference (2026-03-05)

cc-manager orchestrates 3 agents: Claude CLI, Claude Agent SDK, Codex CLI.
Source: `src/agent-runner.ts`

## Agent 1: Claude CLI (`agent: "claude"`) — Primary workhorse

### Latest Core Features (Claude Code 2.1.x)
- `--max-budget-usd <n>` — built-in budget cap per task
- `--json-schema <schema>` — guaranteed structured output (no manual JSON parse)
- `--fallback-model <model>` — auto-downgrade on overload (e.g. Opus → Sonnet on 429)
- `--resume <session-id>` — continue previous session (retry without re-running from scratch)
- `--max-turns <n>` — prevent agent loops (more precise than timeout)
- `--append-system-prompt` — inject custom system instructions
- `--output-format stream-json` — JSONL event stream for real-time monitoring
- `--agents` — dynamic subagent definitions
- `--worktree` — built-in worktree support (evaluate vs our worktree-pool)

### What cc-manager uses today
- `-p`, `--dangerously-skip-permissions`, `--output-format stream-json`, `--verbose`
- `--model`, `--max-budget-usd`, `--append-system-prompt`
- Code: `agent-runner.ts:428-502` (runClaude method)

### Gaps (not using yet)
- `--resume` (P0): retry wastes full token cost by re-running from scratch
- `--fallback-model` (P1): Opus overload → direct fail instead of auto-downgrade
- `--json-schema` (P1): review agent JSON parsing fails ~15-20%, falls back to heuristic
- `--max-turns` (P2): only timeout guards against loops, not turn count

## Agent 2: Claude Agent SDK (`agent: "claude-sdk"`) — Heavy tasks + hooks

### Latest Core Features (SDK v0.2.69)
- **V2 API**: `send()`/`stream()` replaces V1 `query()` async generator
- `createSession()` / `resumeSession()` — persistent sessions across calls
- **18 lifecycle hooks**: PreToolUse, PostToolUse, Stop, WorktreeCreate, etc.
- Subagent definitions — SDK-native multi-agent (explore/code/review roles)
- MCP server integration — mount tools (database, filesystem, etc.)
- `maxBudgetUsd`, `maxTurns`, `permissionMode`, `systemPrompt` (append/preset)
- `abortController` for graceful cancellation

### What cc-manager uses today
- V1 `query()` async generator (NOT V2)
- `model`, `permissionMode: "bypassPermissions"`, `maxTurns: 50`
- `maxBudgetUsd`, `systemPrompt` (append), `abortController`
- `persistSession: false` (throwaway sessions)
- Code: `agent-runner.ts:369-425` (runClaudeSDK method)

### Gaps (not using yet)
- V2 `send()`/`stream()` (P0): V1 query() has no session concept, can't resume
- `createSession()`/`resumeSession()` (P0): retry = full re-run, not session continue
- `persistSession: true` (P0): must enable to save session IDs
- Lifecycle hooks (P1): no real-time cost monitoring, no danger tool interception
- Subagent definitions (P2): not using SDK-native multi-agent roles

## Agent 3: Codex CLI (`agent: "codex"`) — Cross-model retry + second opinion

### Latest Core Features (Codex 0.104.0 + GPT-5.4)
- GPT-5.4 model ($2.50/$15 per M tokens, SWE-bench 77.2%)
- GPT-5.4 Thinking / GPT-5.4 Pro variants
- `model_reasoning_effort` — low/medium/high/xhigh per task
- Agent roles: worker/explorer/reviewer/monitor
- `spawn_agents_on_csv` — batch multi-agent
- `report_agent_job_result` — structured job completion
- Config via `~/.codex/config.toml` with **profiles** support
- `exec` mode with `--json` JSONL output

### GPT-5.4 1M Context Window (IMPORTANT)
- **NOT on by default** — must explicitly configure via config.toml profile
- Default context: 272K. Experimental 1M support requires opt-in.
- **Cost penalty beyond 272K**: 2x input rate, 1.5x output rate for FULL session
- So GPT-5.4 pricing becomes $5.00/$22.50 per M tokens in 1M mode

**Config profile for 1M context:**
```toml
# ~/.codex/config.toml
[profiles.wide]
model = "gpt-5.4"
model_reasoning_effort = "medium"
model_verbosity = "medium"
model_context_window = 1050000
model_auto_compact_token_limit = 900000
```

**When to use 1M context (wide profile):**
- Large monorepo refactors
- Cross-file debugging where context continuity matters
- Keeping many long specs/design docs/logs in one session
- Long-running agent sessions

**When NOT to use (keep default 272K):**
- Small bug fixes, quick edit/test loops
- Tasks where rg/file reads/targeted search are enough
- Any task that doesn't need full repo in context

**Best practices:**
- Keep default profile normal (272K), use `wide` profile only when needed
- Even with 1M, don't paste giant blobs — let tools fetch on demand
- Keep stable instructions in AGENTS.md, not repeated in chat
- Start new session when task changes substantially
- For API: pair with server-side compaction + prompt caching

### What cc-manager uses today
- `exec` mode, `--dangerously-bypass-approvals-and-sandbox`, `--json`, `--cd`
- Model hardcoded to `o4-mini` when task model starts with "claude"
- JSONL event parsing (item.completed, turn.completed)
- Cost estimation hardcoded at o4-mini rates ($1.1/$4.4 per M)
- Code: `agent-runner.ts:566-632` (runCodex method)

### Gaps (not using yet)
- GPT-5.4 (P0): hardcoded o4-mini, missing GPT-5.4's 77.2% SWE-bench capability
- Model routing for Codex (P0): all tasks use o4-mini regardless of complexity
- Config profiles (P0): no config.toml management — need default + wide profiles
- `model_reasoning_effort` (P1): no effort tuning per task category
- Cost table wrong (P1): hardcoded o4-mini prices; GPT-5.4 = $2.50/$15 (272K) or $5/$22.50 (1M)
- 1M context routing (P1): deep tasks (monorepo refactor) should use wide profile, others should not
- Agent roles (P2): not using worker/explorer/reviewer differentiation

## Cross-Agent Architecture

### Model Pricing Table (needs update in estimateCost)
| Model | Input $/M | Output $/M | SWE-bench | Best for |
|-------|----------|-----------|-----------|----------|
| claude-haiku-4-5-20251001 | 0.80 | 4.00 | ~40% | Quick single-file fixes |
| claude-sonnet-4-6 | 3.00 | 15.00 | ~65% | Standard 1-2 file tasks |
| claude-opus-4-6 | 15.00 | 75.00 | 80.9% | Deep refactor, pipeline decompose |
| gpt-5.4 (272K default) | 2.50 | 15.00 | 77.2% | Cross-model retry, cost-effective deep |
| gpt-5.4 (1M wide mode) | 5.00 | 22.50 | 77.2% | Monorepo refactor, cross-file debug (2x/1.5x penalty) |
| o4-mini | 1.10 | 4.40 | ~55% | Fast Codex tasks |

### Current routing: task-classifier.ts
- quick (<200 chars, <=1 file) → Haiku, 120s, $1
- standard → Sonnet, 300s, $5
- deep (refactor/redesign/3+ files) → Opus 4.6, 600s, $10
- Classifier does NOT select agent, only Claude model

### Current retry: scheduler.ts:544-559
- Failed → swap agent (claude ↔ codex via pickFallbackAgent)
- Error context injected into prompt
- Bug: task.error cleared before retry (line 555), but error already in prompt (line 553)

### Optimal Agent Selection Strategy (planned)
| Scenario | Agent | Model | Why |
|----------|-------|-------|-----|
| Quick fix | Claude CLI | Haiku | Fastest, cheapest |
| Standard coding | Claude CLI | Sonnet | Good balance |
| Deep refactor | Claude SDK | Opus 4.6 | Hooks + session for control |
| Cross-model retry | Codex CLI | GPT-5.4 | Different training bias |
| Monorepo refactor | Codex CLI | GPT-5.4 (wide 1M) | Full repo context needed |
| Code review | Claude CLI + --json-schema | Sonnet | Structured output |
| Pipeline decompose | Claude SDK | Opus 4.6 | Codebase understanding |

### Implementation Priority
1. Phase 1 (quick wins, ~60 LOC): Fix Codex model routing, complete pricing table, add --fallback-model, add --max-turns, create codex config.toml profiles
2. Phase 2 (session resume, ~120 LOC): Add sessionId to Task, CLI --resume on retry, SDK V2 upgrade, --json-schema for review
3. Phase 3 (smart routing, ~150 LOC): Classifier outputs agent+model+profile combo, error-type-driven retry, SDK lifecycle hooks

## Self-Evolution: Agent Version Monitor

Core idea: cc-manager should **auto-detect upstream agent updates** and **intelligently upgrade its own integration** — not just pin versions, but adapt to new capabilities as they ship. This is a pillar of self-evolution.

### What to Monitor
| Source | Method | What changes |
|--------|--------|-------------|
| Claude CLI | `claude --version` + changelog RSS/GitHub releases | New flags, output format changes, model additions |
| Claude Agent SDK | `npm view @anthropic-ai/claude-agent-sdk version` + CHANGELOG.md | API breaking changes (V1→V2), new hooks, new options |
| Codex CLI | `codex --version` + GitHub releases | New models (GPT-5.4→next), new exec flags, role changes |

### Monitor → Detect → Adapt Pipeline
1. **Version Check** (periodic or on startup): compare installed vs latest
2. **Changelog Parse**: extract new flags/features/breaking changes from release notes
3. **Capability Mapping**: match new features to cc-manager gaps (e.g. new `--resume` flag → enable session retry)
4. **Self-Upgrade Plan**: generate upgrade tasks (which files to change, what to add)
5. **Auto-PR or Alert**: either auto-implement via pipeline or alert human for review

### Concrete Triggers
- New CLI flag detected → update `runClaude()`/`runCodex()` args builder
- New model released → update `estimateCost()` pricing table + `task-classifier.ts` routing
- SDK API change (V1→V2) → flag for manual upgrade (breaking change)
- New agent role/capability → update `pickReviewAgent()`, `pickFallbackAgent()` logic
- Deprecation notice → schedule migration before removal

### Implementation Sketch
- `src/agent-monitor.ts` — version check + changelog fetch + diff
- Store last-known versions in SQLite (`agent_versions` table)
- On version bump: parse changelog, emit `agent_updated` event
- Pipeline can auto-generate upgrade tasks from changelog diff
- Startup log: "Claude CLI 2.1.72 (was 2.1.69) — 3 new flags available"

### Self-Evolution Loop
```
monitor versions → detect new features → map to gaps →
generate upgrade tasks → execute via pipeline → verify TSC+tests →
merge → cc-manager now uses latest capabilities → repeat
```
This closes the loop: cc-manager improves itself by consuming the very agents it orchestrates.
