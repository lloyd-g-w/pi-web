import { describe, expect, it } from "vitest";
import { isSubagentToolName, subagentChildRows, subagentMetaBadges, subagentToolTarget } from "./subagentToolPresentation";

describe("isSubagentToolName", () => {
  it("recognizes pi-subagents tool names and rejects unrelated ones", () => {
    expect(isSubagentToolName("subagent")).toBe(true);
    expect(isSubagentToolName("subagent_wait")).toBe(true);
    expect(isSubagentToolName("subagent_supervisor")).toBe(true);
    expect(isSubagentToolName("contact_supervisor")).toBe(true);
    expect(isSubagentToolName("bash")).toBe(false);
  });
});

describe("subagentToolTarget", () => {
  it("returns undefined for non-subagent tools", () => {
    expect(subagentToolTarget("bash", { agent: "reviewer" })).toBeUndefined();
  });

  it("labels a management action call, including its id when present", () => {
    expect(subagentToolTarget("subagent", { action: "list" })).toEqual({ label: "Action", text: "list" });
    expect(subagentToolTarget("subagent", { action: "steer", id: "run-1" })).toEqual({ label: "Action", text: "steer run-1" });
  });

  it("labels a workflow script call with its first line", () => {
    expect(subagentToolTarget("subagent", { workflowScript: "return runs.run('a', { agent: 'reviewer' })\n// rest" }))
      .toEqual({ label: "Workflow", text: "return runs.run('a', { agent: 'reviewer' })" });
  });

  it("truncates a long workflow first line", () => {
    const longLine = "x".repeat(200);
    const target = subagentToolTarget("subagent", { workflowScript: longLine });
    expect(target?.label).toBe("Workflow");
    expect(target?.text.length).toBe(120);
    expect(target?.text.endsWith("…")).toBe(true);
  });

  it("labels a single-agent launch with the agent name", () => {
    expect(subagentToolTarget("subagent", { agent: "reviewer", task: "Review the diff" })).toEqual({ label: "Agent", text: "reviewer" });
  });

  it("labels a supervisor message with its first line", () => {
    expect(subagentToolTarget("contact_supervisor", { message: "Need a decision on X" })).toEqual({ label: "Action", text: "Need a decision on X" });
  });

  it("returns undefined when no recognizable field is present", () => {
    expect(subagentToolTarget("subagent", {})).toBeUndefined();
  });
});

describe("subagentMetaBadges", () => {
  it("flags async launches", () => {
    expect(subagentMetaBadges({ async: true }, undefined)).toEqual(["async"]);
  });

  it("surfaces a non-default fan-out mode from details", () => {
    expect(subagentMetaBadges({}, { mode: "parallel" })).toEqual(["parallel"]);
  });

  it("omits the default single and management modes", () => {
    expect(subagentMetaBadges({}, { mode: "single" })).toEqual([]);
    expect(subagentMetaBadges({}, { mode: "management" })).toEqual([]);
  });

  it("combines async with a fan-out mode", () => {
    expect(subagentMetaBadges({ async: true }, { mode: "workflow" })).toEqual(["async", "workflow"]);
  });
});

describe("subagentChildRows", () => {
  it("returns no rows when details has no results", () => {
    expect(subagentChildRows(undefined)).toEqual([]);
    expect(subagentChildRows({ mode: "management", results: [] })).toEqual([]);
  });

  it("maps a successful child result, including summed usage tokens and cost", () => {
    const rows = subagentChildRows({
      results: [{
        index: 0,
        agent: "reviewer",
        task: "Review the diff for regressions",
        exitCode: 0,
        usage: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, cost: 0.02, turns: 2 },
      }],
    });
    expect(rows).toEqual([{ index: 0, agent: "reviewer", status: "success", taskPreview: "Review the diff for regressions", tokens: 165, cost: 0.02 }]);
  });

  it("classifies error, timeout, stop, and interruption states", () => {
    const rows = subagentChildRows({
      results: [
        { index: 0, agent: "a", exitCode: 1, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 } },
        { index: 1, agent: "b", exitCode: 0, error: "boom", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 } },
        { index: 2, agent: "c", exitCode: 0, timedOut: true, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 } },
        { index: 3, agent: "d", exitCode: 0, stopped: true, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 } },
        { index: 4, agent: "e", exitCode: 0, interrupted: true, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 } },
      ],
    });
    expect(rows.map((row) => row.status)).toEqual(["error", "error", "timedOut", "stopped", "interrupted"]);
  });

  it("falls back to array position when a result omits its stable index", () => {
    const rows = subagentChildRows({ results: [{ agent: "a", exitCode: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 } }] });
    expect(rows[0]?.index).toBe(0);
  });

  it("omits malformed entries without an agent name", () => {
    expect(subagentChildRows({ results: [{ exitCode: 0 }, "not-an-object"] })).toEqual([]);
  });

  it("omits zero token/cost fields rather than showing noisy zeros", () => {
    const rows = subagentChildRows({ results: [{ agent: "a", exitCode: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 } }] });
    expect(rows[0]).toEqual({ index: 0, agent: "a", status: "success" });
  });
});
