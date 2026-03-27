import * as vscode from "vscode";
import { TaskRunnerTreeDataProvider } from "../tree/treeDataProvider";

export function createFileWatchers(
  provider: TaskRunnerTreeDataProvider
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function debouncedRefresh() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      provider.refresh();
    }, 300);
  }

  // Watch package.json files
  const packageJsonWatcher = vscode.workspace.createFileSystemWatcher(
    "**/package.json"
  );
  packageJsonWatcher.onDidChange(debouncedRefresh);
  packageJsonWatcher.onDidCreate(debouncedRefresh);
  packageJsonWatcher.onDidDelete(debouncedRefresh);
  disposables.push(packageJsonWatcher);

  // Watch tasks.json
  const tasksJsonWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.vscode/tasks.json"
  );
  tasksJsonWatcher.onDidChange(debouncedRefresh);
  tasksJsonWatcher.onDidCreate(debouncedRefresh);
  tasksJsonWatcher.onDidDelete(debouncedRefresh);
  disposables.push(tasksJsonWatcher);

  // Watch pnpm-workspace.yaml
  const pnpmWatcher = vscode.workspace.createFileSystemWatcher(
    "**/pnpm-workspace.yaml"
  );
  pnpmWatcher.onDidChange(debouncedRefresh);
  pnpmWatcher.onDidCreate(debouncedRefresh);
  pnpmWatcher.onDidDelete(debouncedRefresh);
  disposables.push(pnpmWatcher);

  // Cleanup timer on dispose
  disposables.push(
    new vscode.Disposable(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    })
  );

  return disposables;
}
