import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AgentRunner } from "../agent-runner.js";
import { createTask } from "../types.js";

describe("AgentRunner", () => {
  it("estimateCost returns correct values for sonnet model", () => {
    // 1 000 000 input tokens @ $3/MTok = $3, 1 000 000 output tokens @ $15/MTok = $15
    const cost = AgentRunner.estimateCost(1_000_000, 1_000_000, "claude-sonnet-4-6");
    assert.strictEqual(cost, 18);
  });

  it("estimateCost returns correct values for unknown model (defaults to sonnet rates)", () => {
    const cost = AgentRunner.estimateCost(1_000_000, 1_000_000, "unknown-model-xyz");
    assert.strictEqual(cost, 18);
  });

  it("reviewDiff returns a ReviewResult with score, issues, and suggestions arrays", () => {
    const runner = new AgentRunner();
    const result = runner.reviewDiff("diff --git a/foo.ts b/foo.ts\n+const x = 1;");
    assert.ok(typeof result.score === "number", "score should be a number");
    assert.ok(Array.isArray(result.issues), "issues should be an array");
    assert.ok(Array.isArray(result.suggestions), "suggestions should be an array");
  });

  it("reviewDiff gives higher score when diff includes test files", () => {
    const runner = new AgentRunner();
    const withTests = runner.reviewDiff(
      "diff --git a/foo.test.ts b/foo.test.ts\n+it('works', () => {});"
    );
    const withoutTests = runner.reviewDiff(
      "diff --git a/foo.ts b/foo.ts\n+const x = 1;"
    );
    assert.ok(withTests.score > withoutTests.score, "test-including diff should score higher");
  });

  it("buildSystemPrompt includes tsc instruction", () => {
    const runner = new AgentRunner();
    const task = createTask("fix the bug");
    // Pass a non-existent cwd so CLAUDE.md lookup fails silently
    const prompt = runner.buildSystemPrompt(task, "/nonexistent-path-xyz");
    assert.ok(prompt.includes("npx tsc"), "prompt should include npx tsc instruction");
  });
});
