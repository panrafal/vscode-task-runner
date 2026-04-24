import * as vscode from "vscode";
import { TaskRunnerTreeDataProvider } from "./tree/treeDataProvider";
import { TaskTracker } from "./execution/taskTracker";
import { TaskRunner } from "./execution/taskRunner";
import { TaskUsageTracker } from "./execution/taskUsageTracker";
import { registerCommands } from "./commands/commands";
import { createFileWatchers } from "./watchers/fileWatcher";
import { GroupDecorationProvider } from "./tree/groupDecorationProvider";
import { TaskRunnerTaskProvider, TASK_TYPE } from "./execution/taskProvider";

export function activate(context: vscode.ExtensionContext) {
  const tracker = new TaskTracker();
  const usage = new TaskUsageTracker(context);
  const provider = new TaskRunnerTreeDataProvider(tracker);
  const runner = new TaskRunner(tracker, usage);

  // Register the tree view
  const treeView = vscode.window.createTreeView("taskRunner.view", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Register task provider so VS Code can resolve/rerun our tasks
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(TASK_TYPE, new TaskRunnerTaskProvider())
  );

  // Register group label color decoration
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(new GroupDecorationProvider())
  );

  // Register commands
  registerCommands(context, provider, runner, tracker, usage);

  // Set up file watchers
  const watchers = createFileWatchers(provider);
  context.subscriptions.push(...watchers);

  // Track task execution via VS Code task events
  context.subscriptions.push(
    vscode.tasks.onDidStartTask((e) => {
      tracker.matchAndTrackStart(
        e.execution.task,
        e.execution,
        provider.allEntries
      );
      provider.refreshState();
    }),

    vscode.tasks.onDidEndTaskProcess((e) => {
      tracker.matchAndTrackEnd(e.execution.task, e.exitCode);
      provider.refreshState();
    })
  );

  // Subscribe to tracker state changes for tree refresh + usage tracking
  context.subscriptions.push(
    tracker.onDidChangeState((entry) => {
      if (entry) {
        usage.recordStateChange(entry);
      }
      provider.refreshState();
    })
  );

  // Initial refresh
  provider.refresh();
}

export function deactivate() {}
