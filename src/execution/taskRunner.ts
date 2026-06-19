import * as vscode from "vscode";
import * as path from "path";
import {
  TaskEntry,
  ScriptEntry,
  VscodeTaskEntry,
  PackageManager,
  TaskState,
  taskKey,
} from "../types";
import { getExecuteCommand } from "../discovery/packageManager";
import { TaskTracker } from "./taskTracker";
import { TaskUsageTracker } from "./taskUsageTracker";
import { TASK_TYPE } from "./taskProvider";

export class TaskRunner {
  constructor(
    private tracker: TaskTracker,
    private usage: TaskUsageTracker
  ) {}

  async run(
    entry: TaskEntry,
    packageManager: PackageManager,
    debug: boolean = false
  ): Promise<void> {
    // If already running, focus the terminal
    const state = this.tracker.getState(entry);
    if (state === TaskState.Running) {
      this.focusTerminal(entry);
      return;
    }

    this.usage.recordRun(entry);

    if (entry.kind === "script") {
      await this.runScript(entry, packageManager, debug);
    } else {
      await this.runVscodeTask(entry, packageManager, debug);
    }
  }

  async stop(entry: TaskEntry): Promise<void> {
    const session = this.tracker.getDebugSession(entry);
    if (session) {
      this.tracker.markStopped(entry);
      await vscode.debug.stopDebugging(session);
      return;
    }

    const execution = this.tracker.getExecution(entry);
    if (execution) {
      this.tracker.markStopped(entry);
      execution.terminate();
    }
  }

  focusTerminal(entry: TaskEntry): void {
    // Collect all possible terminal names: this entry + cross-referenced entry
    const names = this.tracker.getTerminalNames(entry);

    for (const name of names) {
      const terminal = vscode.window.terminals.find(
        (t) => t.name === name || t.name.includes(name)
      );
      if (terminal) {
        terminal.show();
        return;
      }
    }

    // Fallback: search by partial match on script/task name
    const searchTerms = [
      entry.kind === "script" ? entry.name : entry.label,
    ];
    for (const term of searchTerms) {
      const terminal = vscode.window.terminals.find((t) =>
        t.name.includes(term)
      );
      if (terminal) {
        terminal.show();
        return;
      }
    }
  }

  private async runScript(
    entry: ScriptEntry,
    packageManager: PackageManager,
    debug: boolean
  ): Promise<void> {
    const [cmd, ...args] = getExecuteCommand(packageManager);
    const taskName = `${entry.name} - ${entry.packageName}`;
    const fullCommand = `${cmd} ${args.join(" ")} ${entry.name}`;

    if (debug) {
      await this.runWithDebugger(entry, fullCommand, entry.packageDir, taskName);
      return;
    }

    const taskDefinition: vscode.TaskDefinition = {
      type: TASK_TYPE,
      command: fullCommand,
      cwd: entry.packageDir,
      script: entry.name,
      packageJsonPath: entry.packageJsonPath,
    };

    const shellOpts: vscode.ShellExecutionOptions = {
      cwd: entry.packageDir,
    };

    const execution = new vscode.ShellExecution(fullCommand, shellOpts);

    const task = new vscode.Task(
      taskDefinition,
      vscode.TaskScope.Workspace,
      taskName,
      "npm",
      execution
    );

    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      focus: true,
    };

    const taskExecution = await vscode.tasks.executeTask(task);
    this.tracker.trackStart(entry, taskExecution);
  }

  /**
   * Run a command inside a JavaScript Debug Terminal (js-debug `node-terminal`),
   * so every node process it spawns — recursively — auto-attaches to the
   * debugger with no port collisions. State is tracked via debug-session events
   * (see extension.ts), correlated by the `__taskRunnerKey` config property.
   */
  private async runWithDebugger(
    entry: TaskEntry,
    command: string,
    cwd: string,
    name: string
  ): Promise<void> {
    const key = taskKey(entry);
    const folder =
      vscode.workspace.getWorkspaceFolder(vscode.Uri.file(cwd)) ??
      vscode.workspace.workspaceFolders?.[0];

    // Mark Running up-front so the Stop button appears immediately; the session
    // handle is attached later when onDidStartDebugSession fires.
    this.tracker.trackDebugStart(entry);

    const config: vscode.DebugConfiguration = {
      type: "node-terminal",
      name,
      request: "launch",
      command,
      cwd,
      __taskRunnerKey: key,
    };

    const ok = await vscode.debug.startDebugging(folder, config);
    if (!ok) {
      this.tracker.trackDebugEnd(key);
      vscode.window.showErrorMessage(
        `Could not start a debug session for "${name}".`
      );
    }
  }

  private async runVscodeTask(
    entry: VscodeTaskEntry,
    packageManager: PackageManager,
    debug: boolean
  ): Promise<void> {
    if (debug) {
      // Prefer the task's own command; otherwise resolve npm tasks to their
      // underlying script command via the cross-reference.
      if (entry.command) {
        const cwd =
          (entry.definition.cwd as string | undefined) ??
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (cwd) {
          await this.runWithDebugger(entry, entry.command, cwd, entry.label);
          return;
        }
      } else {
        const crossRef = this.tracker.getCrossRefEntry(entry);
        if (crossRef?.kind === "script") {
          const [cmd, ...args] = getExecuteCommand(packageManager);
          const command = `${cmd} ${args.join(" ")} ${crossRef.name}`;
          await this.runWithDebugger(
            entry,
            command,
            crossRef.packageDir,
            entry.label
          );
          return;
        }
      }

      vscode.window.showWarningMessage(
        `Debug is not available for task "${entry.label}" (no runnable command found); running normally.`
      );
      // Fall through to normal execution.
    }

    // Try to find and execute the task using VS Code's task system
    const allTasks = await vscode.tasks.fetchTasks();
    const matchingTask = allTasks.find((t) => t.name === entry.label);

    if (matchingTask) {
      matchingTask.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        focus: true,
      };
      const taskExecution = await vscode.tasks.executeTask(matchingTask);
      this.tracker.trackStart(entry, taskExecution);
      return;
    }

    // Fallback: reconstruct the task from definition
    const commandStr = entry.command || entry.label;
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const taskDefinition: vscode.TaskDefinition = {
      type: TASK_TYPE,
      command: commandStr,
      cwd,
      label: entry.label,
    };

    const execution = new vscode.ShellExecution(commandStr, { cwd });

    const task = new vscode.Task(
      taskDefinition,
      vscode.TaskScope.Workspace,
      entry.label,
      entry.type,
      execution
    );

    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      focus: true,
    };

    const taskExecution = await vscode.tasks.executeTask(task);
    this.tracker.trackStart(entry, taskExecution);
  }
}
