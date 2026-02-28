export interface WorkerStats {
  totalTasks: number;
  successRate: number;
  avgDuration: number;
  lastActive: string;
}

interface WorkerData {
  totalTasks: number;
  successCount: number;
  totalDuration: number;
  lastActive: Date;
}

export class WorkerMonitor {
  private workers = new Map<string, WorkerData>();

  private ensure(workerName: string): WorkerData {
    if (!this.workers.has(workerName)) {
      this.workers.set(workerName, {
        totalTasks: 0,
        successCount: 0,
        totalDuration: 0,
        lastActive: new Date(),
      });
    }
    return this.workers.get(workerName)!;
  }

  recordTaskStart(workerName: string): void {
    const w = this.ensure(workerName);
    w.lastActive = new Date();
  }

  recordTaskEnd(workerName: string, durationMs: number, success: boolean): void {
    const w = this.ensure(workerName);
    w.totalTasks++;
    w.totalDuration += durationMs;
    if (success) w.successCount++;
    w.lastActive = new Date();
  }

  getWorkerStats(workerName: string): WorkerStats {
    const w = this.ensure(workerName);
    return {
      totalTasks: w.totalTasks,
      successRate: w.totalTasks ? w.successCount / w.totalTasks : 0,
      avgDuration: w.totalTasks ? w.totalDuration / w.totalTasks : 0,
      lastActive: w.lastActive.toISOString(),
    };
  }

  getAllWorkerStats(): Record<string, WorkerStats> {
    const result: Record<string, WorkerStats> = {};
    for (const name of this.workers.keys()) result[name] = this.getWorkerStats(name);
    return result;
  }
}
