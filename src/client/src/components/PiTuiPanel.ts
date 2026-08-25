import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { terminalsApi, type TerminalInfo, type Workspace } from "../api";
import { findPiTuiTerminal, PI_TUI_LAUNCH_INPUT, PI_TUI_TERMINAL_NAME } from "../piTuiTerminal";
import "./TerminalPanel";

/**
 * Hosts the real interactive Pi CLI in a dedicated per-workspace terminal, so
 * the actual Pi TUI (including panels the CLI itself draws, such as the
 * pi-subagents fleet view) renders in the browser exactly as it does in a
 * native terminal. This delegates all xterm/socket/replay/resize handling to
 * `<terminal-panel>` and owns only Pi-specific orchestration: finding or
 * creating that workspace's dedicated terminal and launching `pi` into it.
 */
@customElement("pi-tui-panel")
export class PiTuiPanel extends LitElement {
  @property({ attribute: false }) workspace: Workspace | undefined;
  @property() machineId = "local";
  @state() private terminals: TerminalInfo[] = [];
  @state() private loading = false;
  @state() private starting = false;
  @state() private error: string | undefined;

  private loadedWorkspaceScope: string | undefined;
  private launchedTerminalIds = new Set<string>();
  /**
   * `<terminal-panel>` only sends this once, after that exact terminal id's
   * socket first connects, and only when it is passed a non-undefined value.
   * Deriving it lazily inside `render()` from `launchedTerminalIds` is unsafe:
   * an unrelated re-render (for example `loading` flipping back to false in
   * `loadTerminals()`'s own trailing microtask) runs `render()` again for the
   * same terminal id, and a second lazy lookup would already report it as
   * launched and clear `initialInput` back to `undefined` before the socket
   * has had a chance to open and consume it. Set this exactly once, at the
   * moment a terminal is created/selected as the Pi terminal, so its value is
   * stable across any number of intervening renders.
   */
  @state() private pendingLaunchInput: { terminalId: string; data: string } | undefined;

  override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has("workspace") && !changed.has("machineId")) return;
    const scope = this.workspace === undefined ? undefined : JSON.stringify([this.machineId, this.workspace.path]);
    if (scope === this.loadedWorkspaceScope) return;
    this.loadedWorkspaceScope = scope;
    this.terminals = [];
    this.error = undefined;
    this.pendingLaunchInput = undefined;
    if (this.workspace !== undefined) void this.loadTerminals(this.workspace);
  }

  private async loadTerminals(workspace: Workspace): Promise<void> {
    this.loading = true;
    this.error = undefined;
    try {
      const terminals = await terminalsApi.terminals(workspace.projectId, workspace.id, this.machineId);
      if (this.workspace?.id !== workspace.id || this.workspace.projectId !== workspace.projectId) return;
      this.terminals = terminals;
      const existingPiTerminal = findPiTuiTerminal(terminals);
      if (existingPiTerminal === undefined) await this.launchPiTerminal(workspace);
      else this.armLaunchInput(existingPiTerminal.id);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
  }

  private async launchPiTerminal(workspace: Workspace): Promise<void> {
    this.starting = true;
    this.error = undefined;
    try {
      const terminal = await terminalsApi.startTerminal(workspace.projectId, workspace.id, { name: PI_TUI_TERMINAL_NAME }, this.machineId);
      this.terminals = [...this.terminals.filter((existing) => existing.id !== terminal.id), terminal];
      this.armLaunchInput(terminal.id);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.starting = false;
    }
  }

  private relaunch(): void {
    const workspace = this.workspace;
    if (workspace === undefined || this.starting) return;
    void this.launchPiTerminal(workspace);
  }

  private armLaunchInput(terminalId: string): void {
    if (this.launchedTerminalIds.has(terminalId)) return;
    this.launchedTerminalIds.add(terminalId);
    this.pendingLaunchInput = { terminalId, data: PI_TUI_LAUNCH_INPUT };
  }

  override render() {
    const workspace = this.workspace;
    if (workspace === undefined) {
      return html`<section class="empty-state" role="status"><h2>Select a workspace</h2><p>Choose a workspace to open its Pi CLI.</p></section>`;
    }
    const piTerminal = findPiTuiTerminal(this.terminals);
    return html`
      <section class="pi-tui-shell">
        ${this.error === undefined ? null : html`<p class="error">${this.error}</p>`}
        ${piTerminal === undefined
          ? html`<p class="muted">${this.starting || this.loading ? "Starting the Pi CLI\u2026" : "No Pi CLI terminal yet."}</p>`
          : piTerminal.exited
            ? html`
              <section class="exited-state" role="status">
                <p>The Pi CLI process exited${piTerminal.exitCode === undefined ? "" : ` with code ${String(piTerminal.exitCode)}`}.</p>
                <button ?disabled=${this.starting} @click=${() => { this.relaunch(); }}>${this.starting ? "Starting\u2026" : "Relaunch Pi"}</button>
              </section>
            `
            : html`<terminal-panel .workspace=${workspace} .machineId=${this.machineId} .selectedTerminalId=${piTerminal.id} .hideTabs=${true} .initialInput=${this.pendingLaunchInput}></terminal-panel>`}
      </section>
    `;
  }

  static override styles = css`
    :host { flex: 1 1 auto; min-height: 0; display: flex; }
    .pi-tui-shell { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    .empty-state, .exited-state { display: grid; gap: 8px; padding: 16px; color: var(--pi-muted); }
    .exited-state button { justify-self: start; border: 1px solid var(--pi-border); border-radius: 7px; background: var(--pi-surface); color: var(--pi-text); padding: 6px 10px; cursor: pointer; }
    .exited-state button:hover { border-color: var(--pi-accent); }
    .exited-state button:disabled { opacity: .5; cursor: not-allowed; }
    .error { flex: 0 0 auto; margin: 0; padding: 8px; color: var(--pi-danger); border-bottom: 1px solid var(--pi-border); background: var(--pi-surface); }
    .muted { margin: 10px; color: var(--pi-muted); }
  `;
}
