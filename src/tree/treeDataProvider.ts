import * as vscode from "vscode";
import * as path from "path";
import { PackageManager, TaskEntry, TaskState } from "../types";
import { detectPackageManager } from "../discovery/packageManager";
import { parsePackageJson, ParsedPackageJson } from "../discovery/scriptParser";
import { discoverWorkspacePackages } from "../discovery/workspaceDiscovery";
import { parseTasksJson } from "../discovery/taskJsonParser";
import { GroupTreeItem, TaskTreeItem } from "./treeItems";
import { TaskTracker } from "../execution/taskTracker";

type TreeNode = GroupTreeItem | TaskTreeItem;

export class TaskRunnerTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootNodes: TreeNode[] = [];

  private _packageManager: PackageManager = "npm";
  private _allEntries: TaskEntry[] = [];

  constructor(private tracker: TaskTracker) {}

  get packageManager(): PackageManager {
    return this._packageManager;
  }

  get allEntries(): TaskEntry[] {
    return this._allEntries;
  }

  get nodes(): TreeNode[] {
    return this.rootNodes;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.rootNodes;
    }
    if (element instanceof GroupTreeItem) {
      return element.children;
    }
    return [];
  }

  getParent(element: TreeNode): TreeNode | undefined {
    // For simplicity, we don't track parents. This means reveal() won't work
    // but it's not critical for our use case.
    return undefined;
  }

  async refresh(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.rootNodes = [];
      this._allEntries = [];
      this._onDidChangeTreeData.fire();
      return;
    }

    const folder = folders[0]; // Primary workspace folder
    this._packageManager = await detectPackageManager(folder);
    const allEntries: TaskEntry[] = [];
    const rootNodes: TreeNode[] = [];

    // 1. Parse VS Code tasks.json
    const tasksJson = await parseTasksJson(folder);

    // Add ungrouped VS Code tasks
    for (const entry of tasksJson.ungrouped) {
      allEntries.push(entry);
      rootNodes.push(this.createTaskItem(entry));
    }

    // Add grouped VS Code tasks
    for (const groupName of tasksJson.groupOrder) {
      const entries = tasksJson.groups.get(groupName)!;
      const group = new GroupTreeItem(groupName, `vscode-group:${groupName}`);
      for (const entry of entries) {
        allEntries.push(entry);
        group.children.push(this.createTaskItem(entry));
      }
      rootNodes.push(group);
    }

    // 2. Parse root package.json
    const rootPackageJsonPath = path.join(folder.uri.fsPath, "package.json");
    let rootParsed: ParsedPackageJson | undefined;
    try {
      rootParsed = await parsePackageJson(rootPackageJsonPath, true);
    } catch {
      // No root package.json
    }

    if (rootParsed && rootParsed.scripts.length > 0) {
      const group = new GroupTreeItem(
        rootParsed.packageName,
        `package:${rootPackageJsonPath}`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      for (const entry of rootParsed.scripts) {
        allEntries.push(entry);
        group.children.push(this.createTaskItem(entry));
      }
      rootNodes.push(group);
    }

    // 3. Parse workspace package.json files
    const workspacePackagePaths = await discoverWorkspacePackages(
      folder,
      this._packageManager,
      rootParsed?.workspaces
    );

    for (const pkgPath of workspacePackagePaths) {
      // Skip root package.json if it shows up in workspace discovery
      if (pkgPath === rootPackageJsonPath) {
        continue;
      }

      try {
        const parsed = await parsePackageJson(pkgPath, false);
        if (parsed.scripts.length > 0) {
          const group = new GroupTreeItem(
            parsed.packageName,
            `package:${pkgPath}`,
            vscode.TreeItemCollapsibleState.Collapsed
          );
          for (const entry of parsed.scripts) {
            allEntries.push(entry);
            group.children.push(this.createTaskItem(entry));
          }
          rootNodes.push(group);
        }
      } catch {
        // Skip unreadable package.json
      }
    }

    this.rootNodes = rootNodes;
    this._allEntries = allEntries;
    this.tracker.buildCrossReferences(allEntries);
    this.tracker.cacheEntries(allEntries);
    this._onDidChangeTreeData.fire();
  }

  private createTaskItem(entry: TaskEntry): TaskTreeItem {
    const state = this.tracker.getState(entry);
    return new TaskTreeItem(entry, state);
  }

  /**
   * Refresh just the tree items (update state/icons) without re-parsing files.
   */
  refreshState(): void {
    // Rebuild tree items with current states
    for (const node of this.rootNodes) {
      if (node instanceof GroupTreeItem) {
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          node.children[i] = this.createTaskItem(child.entry);
        }
      }
    }
    // Also rebuild any root-level TaskTreeItems (ungrouped vscode tasks)
    for (let i = 0; i < this.rootNodes.length; i++) {
      const node = this.rootNodes[i];
      if (node instanceof TaskTreeItem) {
        this.rootNodes[i] = this.createTaskItem(node.entry);
      }
    }
    this._onDidChangeTreeData.fire();
  }
}
