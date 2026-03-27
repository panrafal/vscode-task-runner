import * as vscode from "vscode";
import * as path from "path";
import { modify, applyEdits, parse } from "jsonc-parser";
import { TaskEntry, ScriptEntry, VscodeTaskEntry, TaskState } from "../types";
import { TaskRunnerTreeDataProvider } from "../tree/treeDataProvider";
import { GroupTreeItem, TaskTreeItem } from "../tree/treeItems";
import { TaskRunner } from "../execution/taskRunner";
import { TaskTracker } from "../execution/taskTracker";
import { getIconId } from "../tree/iconResolver";

export function registerCommands(
  context: vscode.ExtensionContext,
  provider: TaskRunnerTreeDataProvider,
  runner: TaskRunner,
  tracker: TaskTracker
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("taskRunner.run", (item: TaskTreeItem) => {
      if (item?.entry) {
        runner.run(item.entry, provider.packageManager, false);
      }
    }),

    vscode.commands.registerCommand("taskRunner.debug", (item: TaskTreeItem) => {
      if (item?.entry) {
        runner.run(item.entry, provider.packageManager, true);
      }
    }),

    vscode.commands.registerCommand("taskRunner.stop", (item: TaskTreeItem) => {
      if (item?.entry) {
        runner.stop(item.entry);
      }
    }),

    vscode.commands.registerCommand("taskRunner.refresh", () => {
      tracker.clearCompleted();
      provider.refresh();
    }),

    vscode.commands.registerCommand("taskRunner.open", (item: TaskTreeItem) => {
      if (item?.entry) {
        openDeclaration(item.entry);
      }
    }),

    vscode.commands.registerCommand("taskRunner.configureTask", async (item: TaskTreeItem) => {
      if (!item?.entry) {
        return;
      }

      if (item.entry.kind === "vscodeTask") {
        // For VS Code tasks, just navigate to the declaration
        openDeclaration(item.entry);
      } else {
        // For npm scripts, create a VS Code task definition in tasks.json
        await createVscodeTaskForScript(item.entry);
      }
    }),

    vscode.commands.registerCommand("taskRunner.itemClicked", (item: TaskTreeItem) => {
      if (!item?.entry) {
        return;
      }

      const state = tracker.getState(item.entry);
      if (state === TaskState.Running || tracker.hasTerminal(item.entry)) {
        runner.focusTerminal(item.entry);
      } else {
        openDeclaration(item.entry);
      }
    }),

    vscode.commands.registerCommand("taskRunner.runTask", () => {
      showRunTaskQuickPick(provider, runner, tracker);
    })
  );
}

async function openDeclaration(entry: TaskEntry): Promise<void> {
  const filePath =
    entry.kind === "script" ? entry.packageJsonPath : entry.taskJsonPath;
  const line = entry.lineNumber - 1; // Convert to 0-based

  try {
    const doc = await vscode.workspace.openTextDocument(filePath);
    const range = new vscode.Range(line, 0, line, 0);
    await vscode.window.showTextDocument(doc, {
      selection: range,
      preview: false,
    });
  } catch (e) {
    vscode.window.showErrorMessage(`Could not open ${filePath}: ${e}`);
  }
}

async function createVscodeTaskForScript(entry: ScriptEntry): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }

  const tasksJsonPath = path.join(folder.uri.fsPath, ".vscode", "tasks.json");
  const tasksJsonUri = vscode.Uri.file(tasksJsonPath);

  let content: string;
  let existingContent = false;

  try {
    const bytes = await vscode.workspace.fs.readFile(tasksJsonUri);
    content = Buffer.from(bytes).toString("utf-8");
    existingContent = true;
  } catch {
    // Create new tasks.json
    content = JSON.stringify(
      {
        version: "2.0.0",
        tasks: [],
      },
      null,
      2
    );
  }

  // Check if a task for this script already exists
  const parsed = parse(content);
  if (parsed?.tasks) {
    const existing = (parsed.tasks as Array<Record<string, unknown>>).find(
      (t) =>
        t.type === "npm" &&
        t.script === entry.name
    );
    if (existing) {
      // Already exists, just open the file
      const doc = await vscode.workspace.openTextDocument(tasksJsonUri);
      await vscode.window.showTextDocument(doc, { preview: false });
      return;
    }
  }

  // Build the new task object
  const newTask = {
    type: "npm",
    script: entry.name,
    label: `npm: ${entry.name}`,
    problemMatcher: [],
  };

  // If the script is not in the root package.json, add the path
  if (!entry.isRoot) {
    const folder0 = vscode.workspace.workspaceFolders?.[0];
    if (folder0) {
      const relativePath = path.relative(folder0.uri.fsPath, entry.packageDir);
      (newTask as Record<string, unknown>).path = relativePath;
    }
  }

  // Use jsonc-parser to insert the new task into the tasks array
  const tasksArray = parsed?.tasks as unknown[] || [];
  const edits = modify(content, ["tasks", tasksArray.length], newTask, {
    isArrayInsertion: true,
    formattingOptions: {
      tabSize: 2,
      insertSpaces: true,
      eol: "\n",
    },
  });

  const newContent = applyEdits(content, edits);

  // Ensure .vscode directory exists
  if (!existingContent) {
    const vscodeDir = vscode.Uri.file(path.join(folder.uri.fsPath, ".vscode"));
    try {
      await vscode.workspace.fs.stat(vscodeDir);
    } catch {
      await vscode.workspace.fs.createDirectory(vscodeDir);
    }
  }

  // Write the content but DON'T save - open in editor as dirty
  // Write to disk first so we can open it, then we'll modify it in the editor
  if (!existingContent) {
    await vscode.workspace.fs.writeFile(
      tasksJsonUri,
      Buffer.from(content, "utf-8")
    );
  }

  // Open the document
  const doc = await vscode.workspace.openTextDocument(tasksJsonUri);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });

  // Apply the edit through the editor (leaves the file dirty/unsaved)
  const fullRange = new vscode.Range(
    doc.positionAt(0),
    doc.positionAt(doc.getText().length)
  );

  await editor.edit((editBuilder) => {
    editBuilder.replace(fullRange, newContent);
  });

  // Find and select the newly inserted task in the editor
  const newTaskText = `"npm: ${entry.name}"`;
  const newText = doc.getText();
  const insertOffset = newText.lastIndexOf(newTaskText);
  if (insertOffset >= 0) {
    // Find the opening brace of the task object before this label
    const beforeLabel = newText.lastIndexOf("{", insertOffset);
    // Find the closing brace after
    let braceDepth = 0;
    let closingBrace = beforeLabel;
    for (let i = beforeLabel; i < newText.length; i++) {
      if (newText[i] === "{") {
        braceDepth++;
      }
      if (newText[i] === "}") {
        braceDepth--;
        if (braceDepth === 0) {
          closingBrace = i;
          break;
        }
      }
    }

    const startPos = doc.positionAt(beforeLabel);
    const endPos = doc.positionAt(closingBrace + 1);
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(
      new vscode.Range(startPos, endPos),
      vscode.TextEditorRevealType.InCenter
    );
  }
}

interface TaskQuickPickItem extends vscode.QuickPickItem {
  entry?: TaskEntry;
}

function getEntryIconId(entry: TaskEntry): string {
  if (entry.kind === "vscodeTask" && entry.icon) {
    return entry.icon.id;
  }
  const name = entry.kind === "script" ? entry.name : entry.label;
  return getIconId(name);
}

function stateLabel(state: TaskState): string {
  switch (state) {
    case TaskState.Running:
      return "$(sync~spin) running";
    case TaskState.Succeeded:
      return "$(check) succeeded";
    case TaskState.Failed:
      return "$(error) failed";
    default:
      return "";
  }
}

function showRunTaskQuickPick(
  provider: TaskRunnerTreeDataProvider,
  runner: TaskRunner,
  tracker: TaskTracker
): void {
  const items: TaskQuickPickItem[] = [];
  const nodes = provider.nodes;

  for (const node of nodes) {
    if (node instanceof GroupTreeItem) {
      // Separator for the group
      items.push({
        label: node.groupLabel,
        kind: vscode.QuickPickItemKind.Separator,
      });
      // Children
      for (const child of node.children) {
        const state = tracker.getState(child.entry);
        items.push(buildQuickPickItem(child.entry, state, node.groupLabel));
      }
    } else if (node instanceof TaskTreeItem) {
      const state = tracker.getState(node.entry);
      items.push(buildQuickPickItem(node.entry, state));
    }
  }

  const quickPick = vscode.window.createQuickPick<TaskQuickPickItem>();
  quickPick.items = items;
  quickPick.placeholder = "Select a task to run";
  quickPick.matchOnDescription = true;

  quickPick.onDidAccept(() => {
    const selected = quickPick.selectedItems[0];
    if (selected?.entry) {
      const state = tracker.getState(selected.entry);
      if (state === TaskState.Running) {
        runner.focusTerminal(selected.entry);
      } else {
        runner.run(selected.entry, provider.packageManager, false);
      }
    }
    quickPick.dispose();
  });

  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

function buildQuickPickItem(
  entry: TaskEntry,
  state: TaskState,
  groupName?: string
): TaskQuickPickItem {
  const name = entry.kind === "script" ? entry.name : entry.label;
  const iconId = getEntryIconId(entry);
  const status = stateLabel(state);

  const parts: string[] = [];
  if (groupName) {
    parts.push(groupName);
  }
  if (status) {
    parts.push(status);
  }

  return {
    label: `$(${iconId}) ${name}`,
    description: parts.join("  "),
    entry,
  };
}
