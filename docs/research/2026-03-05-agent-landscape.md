# Agent Landscape Research (2026-03-05)

## Perplexity Computer
- 19-model orchestrator, meta-router picks best model per subtask
- $200/month Max plan, Claude Opus 4.6 as core reasoning engine
- Cloud sandbox isolation, persistent memory across sessions
- "Wide but shallow" — good at general tasks, less reliable for complex UI/multi-file/production code
- cc-manager positioning: "narrow but deep" — specialized for code with git-native verification

## GPT-5.4 (Released 2026-03-05)
- Pricing: $2.50/$15.00 per M tokens (standard 272K context)
- 1M context: experimental, opt-in via Codex config.toml, 2x/1.5x cost penalty
- SWE-bench: 77.2% (vs Opus 4.6 80.9%, Sonnet 4.6 ~65%)
- OSWorld: 75.0%, native computer use
- Variants: GPT-5.4 Thinking, GPT-5.4 Pro
- Key for cc-manager: cost-effective alternative to Opus for cross-model retry

## Claude Code CLI (2.1.x)
- New flags since cc-manager was built:
  - `--max-budget-usd` — built-in budget (we already use this)
  - `--json-schema` — guaranteed structured output
  - `--fallback-model` — auto-downgrade on overload
  - `--resume` — session recovery for retries
  - `--max-turns` — loop prevention
  - `--agents` — dynamic subagent definitions
  - `--worktree` — built-in worktree support

## Claude Agent SDK (v0.2.69)
- V2 preview: `send()`/`stream()` replaces V1 `query()` async generator
- `createSession()`/`resumeSession()` — persistent sessions
- 18 lifecycle hooks: PreToolUse, PostToolUse, Stop, WorktreeCreate, etc.
- Subagent definitions, MCP server integration, structured outputs
- cc-manager still on V1 `query()` — major upgrade needed

## Codex CLI (0.104.0)
- GPT-5.4 support with profile-based configuration
- `model_reasoning_effort`: low/medium/high/xhigh
- Agent roles: worker/explorer/reviewer/monitor
- Config via `~/.codex/config.toml` with profiles
- cc-manager hardcodes o4-mini — needs routing update

## Model Comparison Table
| Model | Input $/M | Output $/M | SWE-bench | Context |
|-------|----------|-----------|-----------|---------|
| claude-haiku-4-5 | 0.80 | 4.00 | ~40% | 200K |
| claude-sonnet-4-6 | 3.00 | 15.00 | ~65% | 200K |
| claude-opus-4-6 | 15.00 | 75.00 | 80.9% | 200K |
| gpt-5.4 | 2.50 | 15.00 | 77.2% | 272K (1.05M opt-in) |
| gpt-5.4 (1M mode) | 5.00 | 22.50 | 77.2% | 1.05M |
| o4-mini | 1.10 | 4.40 | ~55% | 200K |

## Key Insight: Cross-Model Retry
Different models have different training biases. When Claude fails on a task,
GPT-5.4 may succeed (and vice versa) — not because one is "better" but because
they approach problems differently. This is why cc-manager's `pickFallbackAgent()`
(claude ↔ codex swap on retry) is architecturally correct, just needs better
model selection within each agent.

## NeurIPS 2025 Finding
79% of multi-agent failures are specification/coordination issues, not technical.
This validates cc-manager's focus on wave planning and staged merging over
raw model capability.

## Sources
- Perplexity Computer: perplexity.ai/computer
- GPT-5.4: openai.com/index/introducing-gpt-5-4/
- Claude SDK: npmjs.com/package/@anthropic-ai/claude-agent-sdk
- Codex config: developers.openai.com/codex/config-reference
- RouteLLM (ICLR 2025): 85% cost reduction, 95% quality retention
- Aider repo-map: tree-sitter + PageRank → 40%→85% multi-file success
- Spotify Honk: 650+ PR/month, dual verification
