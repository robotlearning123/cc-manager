import type Database from "better-sqlite3";
import type { PipelineRun, PipelineStage } from "./pipeline-types.js";

export class PipelineStore {
  constructor(private db: Database.Database) {
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id TEXT PRIMARY KEY,
        goal TEXT NOT NULL,
        stage TEXT NOT NULL,
        mode TEXT NOT NULL,
        iteration INTEGER NOT NULL DEFAULT 0,
        max_iterations INTEGER NOT NULL DEFAULT 3,
        waves TEXT NOT NULL DEFAULT '[]',
        task_ids TEXT NOT NULL DEFAULT '[]',
        verify_results TEXT NOT NULL DEFAULT '[]',
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    try {
      this.db.exec("ALTER TABLE pipeline_runs ADD COLUMN verify_results TEXT NOT NULL DEFAULT '[]'");
    } catch { /* column already exists */ }
  }

  save(run: PipelineRun): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO pipeline_runs (id, goal, stage, mode, iteration, max_iterations, waves, task_ids, verify_results, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id, run.goal, run.stage, run.mode, run.iteration, run.maxIterations,
      JSON.stringify(run.waves), JSON.stringify(run.taskIds),
      JSON.stringify(run.verifyResults ?? []),
      run.error ?? null, run.createdAt, run.updatedAt
    );
  }

  get(id: string): PipelineRun | null {
    const row = this.db.prepare("SELECT * FROM pipeline_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToRun(row) : null;
  }

  list(limit = 50): PipelineRun[] {
    const rows = this.db.prepare("SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.rowToRun(r));
  }

  updateStage(id: string, stage: PipelineStage, fields?: Partial<PipelineRun>): void {
    const run = this.get(id);
    if (!run) return;
    run.stage = stage;
    run.updatedAt = new Date().toISOString();
    if (fields) Object.assign(run, fields);
    this.save(run);
  }

  markStaleRunsFailed(): number {
    const result = this.db.prepare(`
      UPDATE pipeline_runs SET stage = 'failed', error = 'Server restarted during pipeline execution', updated_at = ?
      WHERE stage NOT IN ('done', 'failed')
    `).run(new Date().toISOString());
    return result.changes;
  }

  private rowToRun(row: Record<string, unknown>): PipelineRun {
    const verifyResults = JSON.parse((row.verify_results as string) || "[]");
    return {
      id: row.id as string,
      goal: row.goal as string,
      stage: row.stage as PipelineStage,
      mode: row.mode as "greenfield" | "augment",
      iteration: row.iteration as number,
      maxIterations: row.max_iterations as number,
      waves: JSON.parse((row.waves as string) || "[]"),
      taskIds: JSON.parse((row.task_ids as string) || "[]"),
      verifyResults: verifyResults.length > 0 ? verifyResults : undefined,
      error: (row.error as string) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
