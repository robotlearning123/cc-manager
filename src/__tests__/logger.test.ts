import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { log, setLogLevel } from "../logger.js";

// =============================================================================
// Logger tests — verify structured JSON output, level filtering, stream routing
// =============================================================================

let stdoutWrites: string[] = [];
let stderrWrites: string[] = [];
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

function captureStreams() {
  stdoutWrites = [];
  stderrWrites = [];
  process.stdout.write = ((chunk: string) => {
    stdoutWrites.push(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => {
    stderrWrites.push(chunk);
    return true;
  }) as typeof process.stderr.write;
}

function restoreStreams() {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
}

describe("logger", () => {
  beforeEach(() => {
    setLogLevel("info"); // reset to default
    captureStreams();
  });

  afterEach(() => {
    restoreStreams();
  });

  // ─── JSON format ────────────────────────────────────────────────────────────

  describe("JSON format", () => {
    it("outputs valid JSON with ts, level, and msg fields", () => {
      log("info", "hello world");

      assert.strictEqual(stdoutWrites.length, 1);
      const entry = JSON.parse(stdoutWrites[0]);
      assert.strictEqual(entry.level, "info");
      assert.strictEqual(entry.msg, "hello world");
      assert.ok(entry.ts, "should have timestamp");
    });

    it("includes extra data fields", () => {
      log("info", "task start", { taskId: "abc", agent: "claude" });

      const entry = JSON.parse(stdoutWrites[0]);
      assert.strictEqual(entry.taskId, "abc");
      assert.strictEqual(entry.agent, "claude");
    });

    it("produces ISO 8601 timestamp", () => {
      log("info", "check ts");

      const entry = JSON.parse(stdoutWrites[0]);
      assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(entry.ts), "should be ISO format");
    });

    it("appends newline after JSON", () => {
      log("info", "newline check");

      assert.ok(stdoutWrites[0].endsWith("\n"));
    });
  });

  // ─── stream routing ─────────────────────────────────────────────────────────

  describe("stream routing", () => {
    it("writes info to stdout", () => {
      log("info", "info msg");
      assert.strictEqual(stdoutWrites.length, 1);
      assert.strictEqual(stderrWrites.length, 0);
    });

    it("writes warn to stdout", () => {
      log("warn", "warn msg");
      assert.strictEqual(stdoutWrites.length, 1);
      assert.strictEqual(stderrWrites.length, 0);
    });

    it("writes error to stderr", () => {
      log("error", "error msg");
      assert.strictEqual(stderrWrites.length, 1);
      assert.strictEqual(stdoutWrites.length, 0);
    });

    it("writes debug to stdout when level is debug", () => {
      setLogLevel("debug");
      log("debug", "debug msg");
      assert.strictEqual(stdoutWrites.length, 1);
      assert.strictEqual(stderrWrites.length, 0);
    });
  });

  // ─── level filtering ────────────────────────────────────────────────────────

  describe("level filtering", () => {
    it("suppresses debug at default info level", () => {
      log("debug", "should not appear");
      assert.strictEqual(stdoutWrites.length, 0);
      assert.strictEqual(stderrWrites.length, 0);
    });

    it("emits debug when level set to debug", () => {
      setLogLevel("debug");
      log("debug", "visible");
      assert.strictEqual(stdoutWrites.length, 1);
    });

    it("suppresses info when level set to warn", () => {
      setLogLevel("warn");
      log("info", "hidden");
      assert.strictEqual(stdoutWrites.length, 0);
    });

    it("emits warn when level set to warn", () => {
      setLogLevel("warn");
      log("warn", "visible");
      assert.strictEqual(stdoutWrites.length, 1);
    });

    it("suppresses warn when level set to error", () => {
      setLogLevel("error");
      log("warn", "hidden");
      assert.strictEqual(stdoutWrites.length, 0);
    });

    it("emits error at any level", () => {
      setLogLevel("error");
      log("error", "always visible");
      assert.strictEqual(stderrWrites.length, 1);
    });
  });
});
