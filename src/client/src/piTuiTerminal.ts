import type { TerminalInfo } from "./api";

/**
 * PI WEB creates one dedicated terminal per workspace to host the real
 * interactive Pi CLI (its TUI, including panels like the pi-subagents
 * fleet view, that only render inside an actual PTY). It is an ordinary
 * terminal distinguished only by this reserved name — no server/API change
 * is required to add a "kind" field, and every other terminal API
 * (list/create/socket/replay) is reused unmodified.
 */
export const PI_TUI_TERMINAL_NAME = "Pi TUI";

/** Shell input that replaces the login shell with an interactive `pi` process. */
export const PI_TUI_LAUNCH_INPUT = "exec pi\r";

export function isPiTuiTerminal(terminal: Pick<TerminalInfo, "name">): boolean {
  return terminal.name === PI_TUI_TERMINAL_NAME;
}

/** Find this workspace's Pi TUI terminal, preferring one still running. */
export function findPiTuiTerminal(terminals: readonly TerminalInfo[]): TerminalInfo | undefined {
  const candidates = terminals.filter(isPiTuiTerminal);
  return candidates.find((terminal) => !terminal.exited) ?? candidates[0];
}

/** Terminals an ordinary shell-terminal list should show, excluding the dedicated Pi TUI terminal. */
export function excludePiTuiTerminal(terminals: readonly TerminalInfo[]): TerminalInfo[] {
  return terminals.filter((terminal) => !isPiTuiTerminal(terminal));
}
