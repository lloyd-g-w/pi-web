// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalCommandRun, TerminalInfo, Workspace } from "../api";
import { PI_TUI_TERMINAL_NAME } from "../piTuiTerminal";

const terminalsMock = vi.fn<() => Promise<TerminalInfo[]>>();
const listCommandRunsMock = vi.fn<() => Promise<TerminalCommandRun[]>>();
const startTerminalMock = vi.fn<() => Promise<TerminalInfo>>();
/**
 * `ensureTerminalView` opens a real socket once a terminal is selected and
 * visible. These auto-start/tab-list tests only care about the terminal list
 * this panel loads, not the live PTY connection, so this points at a port
 * nothing listens on rather than a real terminal endpoint. It stays a real
 * `WebSocket` instance (no test double shaped only like one), so the
 * component's actual `addEventListener`/`send`/`close` calls are valid calls
 * against a real implementation instead of an asserted-type stub.
 */
const terminalSocketMock = vi.fn((): WebSocket => new WebSocket("ws://127.0.0.1:1/unused-in-test"));

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    terminalsApi: { ...actual.terminalsApi, terminals: terminalsMock, listCommandRuns: listCommandRunsMock, startTerminal: startTerminalMock },
    terminalSocket: terminalSocketMock,
  };
});

/**
 * happy-dom's IntersectionObserver stub never invokes its callback, but
 * TerminalPanel gates all loading on the `visible` state it drives. Report
 * every observed element as intersecting immediately, matching a real browser
 * reporting a panel that is actually on screen.
 *
 * `IntersectionObserver`/`IntersectionObserverEntry` are plain structural
 * interfaces in the DOM lib types (not classes with a public constructor), so
 * this satisfies each one with a real, fully-typed implementation instead of
 * a type assertion.
 */
class ImmediatelyIntersectingObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly scrollMargin = "";
  readonly thresholds: number[] = [];
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    const zeroRect = new DOMRect(0, 0, 0, 0);
    const entry: IntersectionObserverEntry = {
      boundingClientRect: zeroRect,
      intersectionRatio: 1,
      intersectionRect: zeroRect,
      isIntersecting: true,
      rootBounds: null,
      target,
      time: 0,
    };
    this.callback([entry], this);
  }
  unobserve(): void { /* no-op: this stub tracks no observation state to remove */ }
  disconnect(): void { /* no-op: this stub tracks no observation state to tear down */ }
  takeRecords(): IntersectionObserverEntry[] { return []; }
}
vi.stubGlobal("IntersectionObserver", ImmediatelyIntersectingObserver);

// Imported after the mock so the component module resolves the mocked api binding.
const { TerminalPanel } = await import("./TerminalPanel");

const workspace: Workspace = {
  id: "workspace-1",
  projectId: "project-1",
  path: "/repo",
  label: "main",
  isMain: true,
  effectiveConfig: {},
};

function shellTerminal(overrides: Partial<TerminalInfo> = {}): TerminalInfo {
  return { id: "shell-1", cwd: "/repo", name: "Shell", createdAt: "now", exited: false, ...overrides };
}

function piTuiTerminal(overrides: Partial<TerminalInfo> = {}): TerminalInfo {
  return { id: "pi-1", cwd: "/repo", name: PI_TUI_TERMINAL_NAME, createdAt: "now", exited: false, ...overrides };
}

async function mountPanel(props: { autoStart?: boolean } = {}): Promise<InstanceType<typeof TerminalPanel>> {
  const panel = new TerminalPanel();
  panel.workspace = workspace;
  panel.autoStart = props.autoStart ?? false;
  document.body.append(panel);
  // firstUpdated wires an IntersectionObserver to drive `visible`; happy-dom's
  // stub reports elements as intersecting immediately, but loading is kicked
  // off from `updated()`, so settle a few render passes for the async load to run.
  await panel.updateComplete;
  await panel.updateComplete;
  await panel.updateComplete;
  return panel;
}

beforeEach(() => {
  terminalsMock.mockReset();
  listCommandRunsMock.mockReset();
  listCommandRunsMock.mockResolvedValue([]);
  startTerminalMock.mockReset();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("terminal-panel auto-start", () => {
  // Regression test for a bug where auto-start read the unfiltered terminal
  // list (which includes the dedicated Pi TUI terminal from PiTuiPanel)
  // instead of the ordinary-shell-only list this panel actually shows. Once a
  // workspace had ever had a Pi TUI terminal, auto-start silently stopped
  // starting a shell on every future empty visit to this tab.
  it("still auto-starts a shell when the workspace's only terminal is the dedicated Pi TUI terminal", async () => {
    terminalsMock.mockResolvedValue([piTuiTerminal()]);
    startTerminalMock.mockResolvedValue(shellTerminal());

    await mountPanel({ autoStart: true });

    expect(startTerminalMock).toHaveBeenCalledOnce();
  });

  it("does not auto-start when an ordinary shell terminal already exists", async () => {
    terminalsMock.mockResolvedValue([shellTerminal()]);

    await mountPanel({ autoStart: true });

    expect(startTerminalMock).not.toHaveBeenCalled();
  });

  it("excludes the dedicated Pi TUI terminal from its own tab list", async () => {
    terminalsMock.mockResolvedValue([piTuiTerminal(), shellTerminal()]);

    const panel = await mountPanel();

    // Terminal tab buttons carry a `<small>` close control; the copy-mode and
    // soft-keys toggle buttons in the same toolbar do not, so this anchors on
    // actual terminal tabs rather than every button with a span.
    const tabs = [...panel.shadowRoot?.querySelectorAll(".terminal-tabs button:has(small) span") ?? []].map((span) => span.textContent);
    expect(tabs).toEqual(["Shell"]);
  });

  it("does not auto-start a second shell when a shell already exists alongside the Pi TUI terminal", async () => {
    terminalsMock.mockResolvedValue([piTuiTerminal(), shellTerminal()]);

    await mountPanel({ autoStart: true });

    expect(startTerminalMock).not.toHaveBeenCalled();
  });
});

describe("terminal-panel empty state", () => {
  it("shows no terminals and does not auto-start when the workspace has none and autoStart is off", async () => {
    terminalsMock.mockResolvedValue([]);

    const panel = await mountPanel();

    expect(startTerminalMock).not.toHaveBeenCalled();
    const tabs = panel.shadowRoot?.querySelectorAll(".terminal-tabs button span") ?? [];
    expect(tabs).toHaveLength(0);
  });
});
