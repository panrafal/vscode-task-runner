import * as vscode from "vscode";
import {
  TaskEntry,
  TaskState,
  TrackedTask,
  ScriptEntry,
  VscodeTaskEntry,
  taskKey,
} from "../types";


export class TaskTracker {
  private _tracked = new Map<string, TrackedTask>();

  /** Bidirectional map: vscode task key <-> script key when they represent the same npm script */
  private _crossRef = new Map<string, string>();

  /** Keys that were manually stopped — should reset to Idle, not Failed */
  private _pendingStop = new Set<string>();

  private _onDidChangeState = new vscode.EventEmitter<TaskEntry | undefined>();
  readonly onDidChangeState = this._onDidChangeState.event;

  /**
   * Build cross-references between VS Code tasks (type: "npm") and npm script entries.
   * Called after discovery so we can link them.
   */
  buildCrossReferences(entries: TaskEntry[]): void {
    this._crossRef.clear();

    const scriptEntries = entries.filter(
      (e): e is ScriptEntry => e.kind === "script"
    );
    const vscodeEntries = entries.filter(
      (e): e is VscodeTaskEntry => e.kind === "vscodeTask"
    );

    for (const vscEntry of vscodeEntries) {
      if (vscEntry.type === "npm" && vscEntry.definition.script) {
        const scriptName = vscEntry.definition.script as string;
        const matchingScript =
          scriptEntries.find((s) => s.name === scriptName && s.isRoot) ||
          scriptEntries.find((s) => s.name === scriptName);

        if (matchingScript) {
          const vscKey = taskKey(vscEntry);
          const scrKey = taskKey(matchingScript);
          this._crossRef.set(vscKey, scrKey);
          this._crossRef.set(scrKey, vscKey);
        }
      }
    }
  }

  getState(entry: TaskEntry): TaskState {
    const key = taskKey(entry);
    const tracked = this._tracked.get(key);
    if (tracked) {
      return tracked.state;
    }
    return TaskState.Idle;
  }

  getExecution(entry: TaskEntry): vscode.TaskExecution | undefined {
    const key = taskKey(entry);
    const tracked = this._tracked.get(key);
    if (tracked?.execution) {
      return tracked.execution;
    }

    // Check cross-referenced entry for execution handle
    const crossKey = this._crossRef.get(key);
    if (crossKey) {
      return this._tracked.get(crossKey)?.execution;
    }

    return undefined;
  }

  /**
   * Get all possible terminal names for an entry, including its cross-referenced counterpart.
   */
  getTerminalNames(entry: TaskEntry): string[] {
    const names: string[] = [];
    names.push(this._terminalName(entry));

    const crossKey = this._crossRef.get(taskKey(entry));
    if (crossKey) {
      const crossEntry = this._entryCache.get(crossKey);
      if (crossEntry) {
        names.push(this._terminalName(crossEntry));
      }
    }

    return names;
  }

  private _terminalName(entry: TaskEntry): string {
    if (entry.kind === "script") {
      return `${entry.name} - ${entry.packageName}`;
    }
    return entry.label;
  }

  hasTerminal(entry: TaskEntry): boolean {
    const state = this.getState(entry);
    return (
      state === TaskState.Running ||
      state === TaskState.Failed ||
      state === TaskState.Succeeded
    );
  }

  trackStart(entry: TaskEntry, execution: vscode.TaskExecution): void {
    const key = taskKey(entry);
    this._tracked.set(key, { entry, state: TaskState.Running, execution });

    // Also track the cross-referenced entry so both show Running
    const crossKey = this._crossRef.get(key);
    if (crossKey) {
      const crossTracked = this._tracked.get(crossKey);
      if (crossTracked) {
        crossTracked.state = TaskState.Running;
        crossTracked.execution = execution;
      } else {
        // Create a tracked entry for the cross-ref too
        this._tracked.set(crossKey, {
          entry: this._findEntryForKey(crossKey) || entry,
          state: TaskState.Running,
          execution,
        });
      }
    }

    this._onDidChangeState.fire(entry);
  }

  markStopped(entry: TaskEntry): void {
    const key = taskKey(entry);
    this._pendingStop.add(key);
    const crossKey = this._crossRef.get(key);
    if (crossKey) {
      this._pendingStop.add(crossKey);
    }
  }

  trackEnd(key: string, exitCode: number | undefined): void {
    const tracked = this._tracked.get(key);
    if (!tracked || tracked.state !== TaskState.Running) {
      return;
    }

    const changedEntry = tracked.entry;

    // If manually stopped, reset to Idle instead of marking Failed
    const wasStopped = this._pendingStop.has(key);
    if (wasStopped) {
      this._pendingStop.delete(key);
      this._tracked.delete(key);
    } else {
      const newState = exitCode === 0 ? TaskState.Succeeded : TaskState.Failed;
      tracked.state = newState;
      tracked.execution = undefined;
    }

    // Also update the cross-referenced entry
    const crossKey = this._crossRef.get(key);
    if (crossKey) {
      const crossStopped = this._pendingStop.has(crossKey);
      if (crossStopped) {
        this._pendingStop.delete(crossKey);
        this._tracked.delete(crossKey);
      } else {
        const crossTracked = this._tracked.get(crossKey);
        if (crossTracked) {
          if (wasStopped) {
            this._tracked.delete(crossKey);
          } else {
            const newState = exitCode === 0 ? TaskState.Succeeded : TaskState.Failed;
            crossTracked.state = newState;
            crossTracked.execution = undefined;
          }
        }
      }
    }

    this._onDidChangeState.fire(changedEntry);
  }

  /**
   * Match a starting VS Code Task to our entries and track it.
   */
  matchAndTrackStart(
    task: vscode.Task,
    execution: vscode.TaskExecution,
    allEntries: TaskEntry[]
  ): void {
    for (const entry of allEntries) {
      if (entry.kind === "vscodeTask" && entry.label === task.name) {
        this.trackStart(entry, execution);
        return;
      }
      if (entry.kind === "script") {
        const expectedName = `${entry.name} - ${entry.packageName}`;
        if (task.name === expectedName) {
          this.trackStart(entry, execution);
          return;
        }
        if (
          task.definition.type === "npm" &&
          task.definition.script === entry.name
        ) {
          this.trackStart(entry, execution);
          return;
        }
      }
    }
  }

  /**
   * Match an ending VS Code Task and update state.
   */
  matchAndTrackEnd(task: vscode.Task, exitCode: number | undefined): void {
    // Find the key for this task
    for (const [key, tracked] of this._tracked) {
      if (tracked.state !== TaskState.Running) {
        continue;
      }
      if (
        tracked.entry.kind === "vscodeTask" &&
        tracked.entry.label === task.name
      ) {
        this.trackEnd(key, exitCode);
        return;
      }
      if (tracked.entry.kind === "script") {
        const expectedName = `${tracked.entry.name} - ${tracked.entry.packageName}`;
        if (task.name === expectedName) {
          this.trackEnd(key, exitCode);
          return;
        }
        if (
          task.definition.type === "npm" &&
          task.definition.script === tracked.entry.name
        ) {
          this.trackEnd(key, exitCode);
          return;
        }
      }
    }
  }

  clearCompleted(): void {
    for (const [key, tracked] of this._tracked) {
      if (tracked.state !== TaskState.Running) {
        this._tracked.delete(key);
      }
    }
    this._onDidChangeState.fire(undefined);
  }

  private _entryCache = new Map<string, TaskEntry>();

  /** Cache entries for cross-ref lookup */
  cacheEntries(entries: TaskEntry[]): void {
    this._entryCache.clear();
    for (const entry of entries) {
      this._entryCache.set(taskKey(entry), entry);
    }
  }

  private _findEntryForKey(key: string): TaskEntry | undefined {
    return this._entryCache.get(key);
  }
}
