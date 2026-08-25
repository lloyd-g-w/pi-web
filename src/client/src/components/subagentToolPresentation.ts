/**
 * Pure presentation helpers for `pi-subagents` tool calls (`subagent`,
 * `subagent_wait`, `subagent_supervisor`, `contact_supervisor`). The tool's
 * `args`/`details` payloads are plain JSON from the agent runtime, not typed
 * on the client, so every accessor here defensively narrows `unknown` rather
 * than trusting a shape.
 */

const SUBAGENT_TOOL_NAMES = new Set(["subagent", "subagent_wait", "subagent_supervisor", "contact_supervisor"]);

export function isSubagentToolName(toolName: string): boolean {
  return SUBAGENT_TOOL_NAMES.has(toolName);
}

export interface SubagentTarget {
  label: "Agent" | "Workflow" | "Action";
  text: string;
}

/** Header target for a subagent tool call: what it launched or asked for. */
export function subagentToolTarget(toolName: string, args: unknown): SubagentTarget | undefined {
  if (!isSubagentToolName(toolName)) return undefined;
  const action = getString(args, "action");
  if (action !== undefined && action !== "") {
    const id = getString(args, "id") ?? getString(args, "agent");
    return { label: "Action", text: id === undefined ? action : `${action} ${id}` };
  }
  const workflowScript = getString(args, "workflowScript");
  if (workflowScript !== undefined && workflowScript !== "") {
    return { label: "Workflow", text: firstLine(workflowScript, 120) };
  }
  const agent = getString(args, "agent");
  if (agent !== undefined && agent !== "") return { label: "Agent", text: agent };
  const message = getString(args, "message");
  if (message !== undefined && message !== "") return { label: "Action", text: firstLine(message, 120) };
  return undefined;
}

/** Short badges describing run shape: async, and non-default fan-out mode. */
export function subagentMetaBadges(args: unknown, details: unknown): string[] {
  const badges: string[] = [];
  if (getBoolean(args, "async") === true) badges.push("async");
  const mode = getString(details, "mode");
  if (mode !== undefined && mode !== "single" && mode !== "management") badges.push(mode);
  return badges;
}

export interface SubagentChildRow {
  index: number;
  agent: string;
  status: "success" | "error" | "interrupted" | "timedOut" | "stopped";
  taskPreview?: string;
  tokens?: number;
  cost?: number;
}

/** Per-child rows extracted from `Details.results` (pi-subagents SingleResult[]). */
export function subagentChildRows(details: unknown): SubagentChildRow[] {
  const results = getProperty(details, "results");
  if (!Array.isArray(results)) return [];
  return results.map((entry, position) => childRowFrom(entry, position)).filter((row): row is SubagentChildRow => row !== undefined);
}

function childRowFrom(entry: unknown, position: number): SubagentChildRow | undefined {
  if (!isRecord(entry)) return undefined;
  const agent = getString(entry, "agent");
  if (agent === undefined) return undefined;
  const index = typeof entry["index"] === "number" ? entry["index"] : position;
  const task = getString(entry, "task");
  const usage = getProperty(entry, "usage");
  const totalTokens = isRecord(usage)
    ? ["input", "output", "cacheRead", "cacheWrite"].reduce((sum, key) => sum + (typeof usage[key] === "number" ? usage[key] : 0), 0)
    : undefined;
  const cost = isRecord(usage) && typeof usage["cost"] === "number" ? usage["cost"] : undefined;
  return {
    index,
    agent,
    status: childStatus(entry),
    ...(task === undefined || task === "" ? {} : { taskPreview: firstLine(task, 90) }),
    ...(totalTokens === undefined || totalTokens === 0 ? {} : { tokens: totalTokens }),
    ...(cost === undefined || cost === 0 ? {} : { cost }),
  };
}

function childStatus(entry: Record<string, unknown>): SubagentChildRow["status"] {
  if (entry["stopped"] === true) return "stopped";
  if (entry["timedOut"] === true) return "timedOut";
  if (entry["interrupted"] === true) return "interrupted";
  if (typeof entry["error"] === "string" && entry["error"] !== "") return "error";
  if (typeof entry["exitCode"] === "number" && entry["exitCode"] !== 0) return "error";
  return "success";
}

function firstLine(text: string, maxLength: number): string {
  const line = text.split("\n", 1)[0]?.trim() ?? "";
  return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function getString(value: unknown, key: string): string | undefined {
  const property = getProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function getBoolean(value: unknown, key: string): boolean | undefined {
  const property = getProperty(value, key);
  return typeof property === "boolean" ? property : undefined;
}
