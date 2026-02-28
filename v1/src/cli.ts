#!/usr/bin/env node
import { Command } from "commander";

const program = new Command()
  .name("cc-submit")
  .description("Submit tasks to a running cc-manager")
  .option("--url <url>", "cc-manager base URL", "http://localhost:8080")
  .requiredOption("--prompt <text>", "Task prompt")
  .option("--priority <level>", "Priority: low | normal | high", "normal")
  .option("--timeout <seconds>", "Task timeout in seconds", "300")
  .option("--watch", "Poll until completion and print result")
  .parse();

const opts = program.opts<{
  url: string;
  prompt: string;
  priority: string;
  timeout: string;
  watch?: boolean;
}>();

type TaskStatus = "pending" | "running" | "success" | "failed" | "timeout" | "cancelled";
interface TaskResponse { id: string; status: TaskStatus; output: string; error: string }

async function main(): Promise<void> {
  const res = await fetch(`${opts.url}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      priority: opts.priority,
      timeout: parseInt(opts.timeout, 10),
    }),
  });

  if (!res.ok) {
    console.error(`Submit failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const task = (await res.json()) as TaskResponse;
  console.log(`Task ID: ${task.id}`);

  if (!opts.watch) return;

  const done = new Set<TaskStatus>(["success", "failed", "timeout", "cancelled"]);

  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));

    const poll = await fetch(`${opts.url}/api/tasks/${task.id}`);
    if (!poll.ok) {
      console.error(`Poll failed: ${poll.status} ${await poll.text()}`);
      process.exit(1);
    }

    const t = (await poll.json()) as TaskResponse;
    console.log(`Status: ${t.status}`);

    if (done.has(t.status)) {
      if (t.output) console.log(`\nOutput:\n${t.output}`);
      if (t.error)  console.error(`\nError:\n${t.error}`);
      process.exit(t.status === "success" ? 0 : 1);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
