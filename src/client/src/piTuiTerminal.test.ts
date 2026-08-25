import { describe, expect, it } from "vitest";
import type { TerminalInfo } from "./api";
import { excludePiTuiTerminal, findPiTuiTerminal, isPiTuiTerminal, PI_TUI_LAUNCH_INPUT, PI_TUI_TERMINAL_NAME } from "./piTuiTerminal";

function terminal(overrides: Partial<TerminalInfo> & { id: string }): TerminalInfo {
  return { cwd: "/repo", name: "bash", createdAt: "now", exited: false, ...overrides };
}

describe("isPiTuiTerminal", () => {
  it("matches only the reserved Pi TUI terminal name", () => {
    expect(isPiTuiTerminal(terminal({ id: "a", name: PI_TUI_TERMINAL_NAME }))).toBe(true);
    expect(isPiTuiTerminal(terminal({ id: "b", name: "bash" }))).toBe(false);
    expect(isPiTuiTerminal(terminal({ id: "c", name: "pi tui" }))).toBe(false);
  });
});

describe("findPiTuiTerminal", () => {
  it("returns undefined when no Pi TUI terminal exists yet", () => {
    expect(findPiTuiTerminal([terminal({ id: "a" })])).toBeUndefined();
    expect(findPiTuiTerminal([])).toBeUndefined();
  });

  it("finds the dedicated Pi TUI terminal among ordinary shells", () => {
    const piTerminal = terminal({ id: "pi-1", name: PI_TUI_TERMINAL_NAME });
    expect(findPiTuiTerminal([terminal({ id: "shell-1" }), piTerminal])?.id).toBe("pi-1");
  });

  it("prefers a running Pi TUI terminal over an exited one", () => {
    const exited = terminal({ id: "pi-old", name: PI_TUI_TERMINAL_NAME, exited: true });
    const running = terminal({ id: "pi-new", name: PI_TUI_TERMINAL_NAME, exited: false });
    expect(findPiTuiTerminal([exited, running])?.id).toBe("pi-new");
  });

  it("falls back to an exited Pi TUI terminal when it is the only one, so callers can offer relaunch", () => {
    const exited = terminal({ id: "pi-old", name: PI_TUI_TERMINAL_NAME, exited: true });
    expect(findPiTuiTerminal([exited])?.id).toBe("pi-old");
  });
});

describe("excludePiTuiTerminal", () => {
  it("filters the dedicated Pi TUI terminal out of an ordinary terminal list", () => {
    const shell = terminal({ id: "shell-1" });
    const piTerminal = terminal({ id: "pi-1", name: PI_TUI_TERMINAL_NAME });
    expect(excludePiTuiTerminal([shell, piTerminal])).toEqual([shell]);
  });

  it("returns every terminal unchanged when none are the Pi TUI terminal", () => {
    const terminals = [terminal({ id: "a" }), terminal({ id: "b" })];
    expect(excludePiTuiTerminal(terminals)).toEqual(terminals);
  });
});

describe("PI_TUI_LAUNCH_INPUT", () => {
  it("execs the pi CLI so it replaces the login shell process", () => {
    expect(PI_TUI_LAUNCH_INPUT).toBe("exec pi\r");
  });
});
