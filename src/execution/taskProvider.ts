import * as vscode from "vscode";

export const TASK_TYPE = "taskRunner";

/**
 * Minimal task provider that resolves tasks created by the Task Runner extension.
 * Without this, VS Code cannot rerun our tasks from the terminal UI.
 */
export class TaskRunnerTaskProvider implements vscode.TaskProvider {
  provideTasks(): vscode.Task[] {
    // We don't provide tasks for discovery — our tree view handles that
    return [];
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const definition = task.definition;
    if (definition.type !== TASK_TYPE) {
      return undefined;
    }

    // Reconstruct the ShellExecution from the stored command and cwd
    const command = definition.command as string | undefined;
    const cwd = definition.cwd as string | undefined;

    if (!command) {
      return undefined;
    }

    const execution = new vscode.ShellExecution(command, { cwd });

    const resolved = new vscode.Task(
      definition,
      task.scope ?? vscode.TaskScope.Workspace,
      task.name,
      task.source,
      execution
    );

    resolved.presentationOptions = task.presentationOptions;
    return resolved;
  }
}
