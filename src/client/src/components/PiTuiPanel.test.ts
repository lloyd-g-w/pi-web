// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalInfo, Workspace } from "../api";
import { PI_TUI_LAUNCH_INPUT, PI_TUI_TERMINAL_NAME } from "../piTuiTerminal";
import { requiredElement } from "./modalSurfaceTestSupport";
import type { TerminalPanel } from "./TerminalPanel";

const terminalsMock = vi.fn<() => Promise<TerminalInfo[]>>();
const startTerminalMock = vi.fn<() => Promise<TerminalInfo>>();

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, terminalsApi: { ...actual.terminalsApi, terminals: terminalsMock, startTerminal: startTerminalMock } };
});

// Imported after the mock so the component module resolves the mocked api binding.
const { PiTuiPanel } = await import("./PiTuiPanel");

const workspace: Workspace = {
  id: "workspace-1",
  projectId: "project-1",
  path: "/repo",
  label: "main",
  isMain: true,
  effectiveConfig: {},
};

function piTerminal(overrides: Partial<TerminalInfo> = {}): TerminalInfo {
  return { id: "pi-1", cwd: "/repo", name: PI_TUI_TERMINAL_NAME, createdAt: "now", exited: false, ...overrides };
}

async function mountPanel(): Promise<InstanceType<typeof PiTuiPanel>> {
  const panel = new PiTuiPanel();
  panel.workspace = workspace;
  document.body.append(panel);
  await panel.updateComplete;
  await panel.updateComplete;
  return panel;
}

beforeEach(() => {
  terminalsMock.mockReset();
  startTerminalMock.mockReset();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("pi-tui-panel", () => {
  it("creates a dedicated Pi TUI terminal when the workspace has none yet", async () => {
    terminalsMock.mockResolvedValue([]);
    startTerminalMock.mockResolvedValue(piTerminal());

    await mountPanel();

    expect(startTerminalMock).toHaveBeenCalledExactlyOnceWith("project-1", "workspace-1", { name: PI_TUI_TERMINAL_NAME }, "local");
  });

  it("reuses an existing running Pi TUI terminal instead of creating another one", async () => {
    terminalsMock.mockResolvedValue([piTerminal()]);

    const panel = await mountPanel();

    expect(startTerminalMock).not.toHaveBeenCalled();
    const terminalPanel = requiredElement(panel.shadowRoot?.querySelector<TerminalPanel>("terminal-panel"), "Pi TUI terminal panel");
    expect(terminalPanel.selectedTerminalId).toBe("pi-1");
  });

  it("launches pi into a freshly created terminal by passing the exec input to the terminal panel", async () => {
    terminalsMock.mockResolvedValue([]);
    startTerminalMock.mockResolvedValue(piTerminal());

    const panel = await mountPanel();

    const terminalPanel = requiredElement(panel.shadowRoot?.querySelector<TerminalPanel>("terminal-panel"), "Pi TUI terminal panel");
    expect(terminalPanel.initialInput).toEqual({ terminalId: "pi-1", data: PI_TUI_LAUNCH_INPUT });
  });

  // Regression test: `initialInput` used to be derived lazily inside render()
  // from `launchedTerminalIds` membership, so any unrelated re-render for the
  // same terminal (for example `loading` flipping back to false in
  // `loadTerminals()`'s own trailing microtask, which this test simulates with
  // an explicit `requestUpdate()`) cleared it back to undefined before
  // `<terminal-panel>`'s socket had a chance to open and consume it — so `pi`
  // was silently never exec'd into a freshly created terminal.
  it("keeps the exec input stable across an unrelated re-render after the terminal panel has already picked it up", async () => {
    terminalsMock.mockResolvedValue([]);
    startTerminalMock.mockResolvedValue(piTerminal());

    const panel = await mountPanel();
    panel.requestUpdate();
    await panel.updateComplete;

    const terminalPanel = requiredElement(panel.shadowRoot?.querySelector<TerminalPanel>("terminal-panel"), "Pi TUI terminal panel");
    expect(terminalPanel.initialInput).toEqual({ terminalId: "pi-1", data: PI_TUI_LAUNCH_INPUT });
  });

  it("offers a relaunch action when the Pi CLI process has exited, and relaunching starts a fresh terminal", async () => {
    terminalsMock.mockResolvedValue([piTerminal({ exited: true, exitCode: 1 })]);
    startTerminalMock.mockResolvedValue(piTerminal({ id: "pi-2" }));

    const panel = await mountPanel();

    const relaunchButton = requiredElement(panel.shadowRoot?.querySelector<HTMLButtonElement>(".exited-state button"), "relaunch Pi button");
    expect(relaunchButton.textContent.trim()).toBe("Relaunch Pi");

    relaunchButton.click();
    await panel.updateComplete;
    await panel.updateComplete;

    expect(startTerminalMock).toHaveBeenCalledExactlyOnceWith("project-1", "workspace-1", { name: PI_TUI_TERMINAL_NAME }, "local");
    const terminalPanel = requiredElement(panel.shadowRoot?.querySelector<TerminalPanel>("terminal-panel"), "Pi TUI terminal panel");
    expect(terminalPanel.selectedTerminalId).toBe("pi-2");
  });

  it("shows a selection prompt when no workspace is selected", async () => {
    const panel = new PiTuiPanel();
    document.body.append(panel);
    await panel.updateComplete;

    expect(terminalsMock).not.toHaveBeenCalled();
    expect(panel.shadowRoot?.querySelector(".empty-state h2")?.textContent).toBe("Select a workspace");
  });
});
