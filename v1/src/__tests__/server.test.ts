import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Validation helpers that mirror the logic in server.ts

function validatePrompt(prompt: unknown): string | null {
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return "prompt must be a non-empty string";
  }
  return null;
}

function validateTimeout(timeout: unknown): string | null {
  if (
    timeout !== undefined &&
    (typeof timeout !== "number" || timeout <= 0 || timeout > 3600)
  ) {
    return "timeout must be a positive number no greater than 3600";
  }
  return null;
}

function validatePriority(priority: unknown): string | null {
  if (
    priority !== undefined &&
    !["low", "normal", "high"].includes(priority as string)
  ) {
    return 'priority must be "low", "normal", or "high"';
  }
  return null;
}

function validateTags(tags: unknown): string | null {
  if (tags === undefined) return null;
  if (!Array.isArray(tags)) {
    return "tags must be an array of strings";
  }
  if (tags.length > 10) {
    return "tags cannot exceed 10 items";
  }
  for (let i = 0; i < tags.length; i++) {
    if (typeof tags[i] !== "string") {
      return `tags[${i}] must be a string`;
    }
    if ((tags[i] as string).length > 50) {
      return `tags[${i}] must be 50 characters or fewer`;
    }
  }
  return null;
}

function validateWebhookUrl(webhookUrl: unknown): string | null {
  if (
    webhookUrl !== undefined &&
    (typeof webhookUrl !== "string" || !webhookUrl.startsWith("http"))
  ) {
    return "webhookUrl must be a URL starting with http";
  }
  return null;
}

describe("WebServer API validation", () => {
  describe("prompt validation", () => {
    it("rejects empty string", () => {
      assert.notStrictEqual(validatePrompt(""), null);
    });

    it("rejects whitespace-only string", () => {
      assert.notStrictEqual(validatePrompt("   "), null);
    });

    it("rejects non-string values", () => {
      assert.notStrictEqual(validatePrompt(null), null);
      assert.notStrictEqual(validatePrompt(undefined), null);
      assert.notStrictEqual(validatePrompt(42), null);
    });

    it("accepts a non-empty string", () => {
      assert.strictEqual(validatePrompt("hello"), null);
    });
  });

  describe("timeout validation", () => {
    it("rejects negative numbers", () => {
      assert.notStrictEqual(validateTimeout(-1), null);
    });

    it("rejects zero", () => {
      assert.notStrictEqual(validateTimeout(0), null);
    });

    it("rejects numbers greater than 3600", () => {
      assert.notStrictEqual(validateTimeout(3601), null);
    });

    it("accepts positive numbers within range", () => {
      assert.strictEqual(validateTimeout(300), null);
      assert.strictEqual(validateTimeout(1), null);
      assert.strictEqual(validateTimeout(3600), null);
    });

    it("accepts undefined (field is optional)", () => {
      assert.strictEqual(validateTimeout(undefined), null);
    });
  });

  describe("priority validation", () => {
    it("accepts 'low'", () => {
      assert.strictEqual(validatePriority("low"), null);
    });

    it("accepts 'normal'", () => {
      assert.strictEqual(validatePriority("normal"), null);
    });

    it("accepts 'high'", () => {
      assert.strictEqual(validatePriority("high"), null);
    });

    it("rejects unknown priority values", () => {
      assert.notStrictEqual(validatePriority("urgent"), null);
      assert.notStrictEqual(validatePriority("critical"), null);
      assert.notStrictEqual(validatePriority(""), null);
    });

    it("accepts undefined (field is optional)", () => {
      assert.strictEqual(validatePriority(undefined), null);
    });
  });

  describe("tags validation", () => {
    it("rejects arrays over 10 items", () => {
      const tooMany = Array.from({ length: 11 }, (_, i) => `tag${i}`);
      assert.notStrictEqual(validateTags(tooMany), null);
    });

    it("accepts arrays of exactly 10 items", () => {
      const exactly10 = Array.from({ length: 10 }, (_, i) => `tag${i}`);
      assert.strictEqual(validateTags(exactly10), null);
    });

    it("accepts arrays under 10 items", () => {
      assert.strictEqual(validateTags(["a", "b", "c"]), null);
    });

    it("rejects non-array values", () => {
      assert.notStrictEqual(validateTags("not-an-array"), null);
      assert.notStrictEqual(validateTags(123), null);
    });

    it("rejects arrays containing non-string items", () => {
      assert.notStrictEqual(validateTags(["ok", 42]), null);
    });

    it("accepts undefined (field is optional)", () => {
      assert.strictEqual(validateTags(undefined), null);
    });
  });

  describe("webhookUrl validation", () => {
    it("rejects non-http strings", () => {
      assert.notStrictEqual(validateWebhookUrl("ftp://example.com"), null);
      assert.notStrictEqual(validateWebhookUrl("example.com"), null);
      assert.notStrictEqual(validateWebhookUrl("ws://example.com"), null);
    });

    it("rejects non-string values", () => {
      assert.notStrictEqual(validateWebhookUrl(42), null);
      assert.notStrictEqual(validateWebhookUrl(true), null);
    });

    it("accepts http:// URLs", () => {
      assert.strictEqual(validateWebhookUrl("http://example.com"), null);
    });

    it("accepts https:// URLs", () => {
      assert.strictEqual(validateWebhookUrl("https://example.com/hook"), null);
    });

    it("accepts undefined (field is optional)", () => {
      assert.strictEqual(validateWebhookUrl(undefined), null);
    });
  });
});
