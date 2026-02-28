import { Task, TaskStatus } from "./types.js";

const ICONS: Record<TaskStatus, string> = {
  running:   "[>>>]",
  pending:   "[...]",
  success:   "[OK] ",
  failed:    "[XX] ",
  timeout:   "[TO] ",
  cancelled: "[--] ",
};

const ORDER: TaskStatus[] = ["running", "pending", "failed", "timeout", "cancelled", "success"];

function elapsed(task: Task): string {
  const start = task.startedAt
    ? new Date(task.startedAt).getTime()
    : new Date(task.createdAt).getTime();
  const end = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
  return `${Math.round((end - start) / 1000)}s`;
}

export function renderQueue(tasks: Task[]): string {
  if (tasks.length === 0) return "Queue is empty.\n";
  const grouped = new Map<TaskStatus, Task[]>();
  for (const t of tasks) {
    if (!grouped.has(t.status)) grouped.set(t.status, []);
    grouped.get(t.status)!.push(t);
  }
  const lines: string[] = [];
  for (const status of ORDER) {
    const group = grouped.get(status);
    if (!group?.length) continue;
    lines.push(status.toUpperCase());
    for (const t of group) {
      const worker = t.worktree ? ` (${t.worktree})` : "";
      lines.push(`  ${ICONS[status]} ${t.id}${worker} ${elapsed(t)}`);
    }
  }
  return lines.join("\n") + "\n";
}
