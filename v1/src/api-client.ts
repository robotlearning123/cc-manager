import type { Task, TaskPriority } from "./types.js";

export type { Task };

export interface Stats {
  pending: number; running: number; success: number; failed: number;
  timeout: number; cancelled: number; total: number;
  queueSize: number; activeWorkers: number; availableWorkers: number;
  avgDurationMs: number; estimatedWaitMs: number;
  totalCost: number; totalBudgetLimit: number;
}

export interface SubmitOpts {
  timeout?: number; maxBudget?: number;
  priority?: TaskPriority; tags?: string[]; webhookUrl?: string;
}

export class CCManagerClient {
  constructor(private readonly baseUrl: string) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  submitTask(prompt: string, opts?: SubmitOpts): Promise<{ id: string; status: string }> {
    return this.req("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ prompt, ...opts }),
    });
  }

  getTask(id: string): Promise<Task> {
    return this.req(`/api/tasks/${id}`);
  }

  listTasks(): Promise<Task[]> {
    return this.req("/api/tasks");
  }

  async cancelTask(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${id}`, { method: "DELETE" });
    return res.ok;
  }

  getStats(): Promise<Stats> {
    return this.req("/api/stats");
  }

  getHealth(): Promise<unknown> {
    return this.req("/api/health");
  }

  async submitBatch(prompts: string[], opts?: Omit<SubmitOpts, "priority" | "tags" | "webhookUrl">): Promise<{ id: string; status: string }[]> {
    return this.req("/api/tasks/batch", {
      method: "POST",
      body: JSON.stringify({ prompts, ...opts }),
    });
  }
}
