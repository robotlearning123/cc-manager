export interface Config {
  repo: string;
  workers: number;
  port: number;
  timeout: number;
  budget: number;
  model: string;
  systemPrompt: string;
  totalBudgetLimit: number;
}

export const DEFAULT_CONFIG: Config = {
  repo: "",
  workers: 3,
  port: 3000,
  timeout: 300,
  budget: 5,
  model: "claude-opus-4-5",
  systemPrompt: "You are a helpful assistant.",
  totalBudgetLimit: 50,
};

export function parseConfig(opts: Record<string, string>): Config {
  return {
    repo: opts["repo"] ?? DEFAULT_CONFIG.repo,
    workers: opts["workers"] !== undefined ? parseInt(opts["workers"], 10) : DEFAULT_CONFIG.workers,
    port: opts["port"] !== undefined ? parseInt(opts["port"], 10) : DEFAULT_CONFIG.port,
    timeout: opts["timeout"] !== undefined ? parseInt(opts["timeout"], 10) : DEFAULT_CONFIG.timeout,
    budget: opts["budget"] !== undefined ? parseFloat(opts["budget"]) : DEFAULT_CONFIG.budget,
    model: opts["model"] ?? DEFAULT_CONFIG.model,
    systemPrompt: opts["systemPrompt"] ?? DEFAULT_CONFIG.systemPrompt,
    totalBudgetLimit: opts["totalBudgetLimit"] !== undefined ? parseFloat(opts["totalBudgetLimit"]) : DEFAULT_CONFIG.totalBudgetLimit,
  };
}
