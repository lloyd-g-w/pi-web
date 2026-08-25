import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../appState";
import type { TerminalUiEvent, Workspace } from "../api";
import { PI_TUI_TERMINAL_NAME } from "../piTuiTerminal";
import { PiWebApp } from "./PiWebApp";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const workspace: Workspace = {
  id: "workspace-1",
  projectId: "project-1",
  path: "/repo",
  label: "main",
  isMain: true,
  effectiveConfig: {},
};

describe("PiWebApp active terminal count", () => {
  // Regression test: the dedicated Pi TUI terminal (see PiTuiPanel) is excluded
  // from the ordinary Terminal tab's own terminal list. It must also stay out of
  // the count that feeds that tab's badge, or the badge permanently overcounts
  // by one relative to what the tab actually shows once a workspace's Pi tab
  // has ever been opened.
  it("does not count a created Pi TUI terminal toward the active terminal badge", () => {
    const app = createApp();

    applyTerminalEvent(app, { type: "terminal.created", terminal: { id: "pi-1", cwd: "/repo", name: PI_TUI_TERMINAL_NAME, createdAt: "now", exited: false } });

    expect(appState(app).activeTerminalCount).toBe(0);
  });

  it("counts an ordinary shell terminal toward the active terminal badge", () => {
    const app = createApp();

    applyTerminalEvent(app, { type: "terminal.created", terminal: { id: "shell-1", cwd: "/repo", name: "Shell", createdAt: "now", exited: false } });

    expect(appState(app).activeTerminalCount).toBe(1);
  });
});

function createApp(): PiWebApp {
  const storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  // selecting a workspace also runs PiWebApp's URL-sync side effect, which
  // needs a real-enough `location.href` for `new URL(...)` to succeed.
  const history = { replaceState: () => undefined, pushState: () => undefined };
  vi.stubGlobal("window", { location: { search: "", href: "http://localhost/" }, localStorage: storage, history });
  const app = new PiWebApp();
  setAppState(app, { selectedWorkspace: workspace });
  return app;
}

function applyTerminalEvent(app: PiWebApp, event: TerminalUiEvent): void {
  const apply: unknown = Reflect.get(app, "applyTerminalEvent");
  if (typeof apply !== "function") throw new Error("PiWebApp.applyTerminalEvent is not callable");
  Reflect.apply(apply, app, [event]);
}

function appState(app: PiWebApp): AppState {
  const state: unknown = Reflect.get(app, "state");
  if (!isAppState(state)) throw new Error("PiWebApp state was unavailable");
  return state;
}

function isAppState(value: unknown): value is AppState {
  return typeof value === "object" && value !== null && "activeTerminalCount" in value && "selectedWorkspace" in value;
}

function setAppState(app: PiWebApp, patch: Partial<AppState>): void {
  const setState: unknown = Reflect.get(app, "setState");
  if (typeof setState !== "function") throw new Error("PiWebApp.setState is not callable");
  Reflect.apply(setState, app, [patch]);
}
