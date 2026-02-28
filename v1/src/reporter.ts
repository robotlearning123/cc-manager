import { Task } from "./types.js";

export function generateReport(tasks: Task[]): string {
  const header = "| ID | Status | Cost ($) | Duration (s) | Prompt |\n|---|---|---|---|---|";

  const rows = tasks.map((t) => {
    const prompt = t.prompt.length > 60 ? t.prompt.slice(0, 60) + "…" : t.prompt;
    const cost = t.costUsd.toFixed(4);
    const duration = (t.durationMs / 1000).toFixed(1);
    return `| ${t.id} | ${t.status} | ${cost} | ${duration} | ${prompt} |`;
  });

  const total = tasks.length;
  const succeeded = tasks.filter((t) => t.status === "success").length;
  const successRate = total > 0 ? ((succeeded / total) * 100).toFixed(1) + "%" : "N/A";
  const totalCost = tasks.reduce((sum, t) => sum + t.costUsd, 0).toFixed(4);
  const avgDuration =
    total > 0
      ? (tasks.reduce((sum, t) => sum + t.durationMs, 0) / total / 1000).toFixed(1) + "s"
      : "N/A";

  const summary = [
    "## Summary",
    "",
    `- **Total tasks:** ${total}`,
    `- **Success rate:** ${successRate}`,
    `- **Total cost:** $${totalCost}`,
    `- **Avg duration:** ${avgDuration}`,
  ].join("\n");

  return ["## Task Report", "", header, ...rows, "", summary].join("\n");
}
