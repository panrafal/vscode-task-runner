import * as vscode from "vscode";
import { TaskEntry, TaskState } from "../types";
import { getTaskIcon, getStateColor } from "./iconResolver";

export class GroupTreeItem extends vscode.TreeItem {
  public readonly children: (GroupTreeItem | TaskTreeItem)[] = [];

  constructor(
    public readonly groupLabel: string,
    public readonly groupId: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Expanded
  ) {
    super(groupLabel, collapsibleState);
    this.contextValue = "group";
    this.iconPath = new vscode.ThemeIcon(
      "folder",
      new vscode.ThemeColor("charts.yellow")
    );
    // resourceUri drives the FileDecorationProvider to color this label
    this.resourceUri = vscode.Uri.parse(
      `taskrunner-group:/${encodeURIComponent(groupId)}`
    );
  }
}

export class TaskTreeItem extends vscode.TreeItem {
  constructor(
    public readonly entry: TaskEntry,
    public readonly state: TaskState,
    displayLabel?: string
  ) {
    const name = displayLabel ?? (entry.kind === "script" ? entry.name : entry.label);
    super(name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = `task.${state}`;

    // Use the task's custom icon if defined, otherwise fall back to heuristic
    if (entry.kind === "vscodeTask" && entry.icon) {
      const color = getStateColor(state) ??
        (entry.icon.color ? new vscode.ThemeColor(entry.icon.color) : undefined);
      this.iconPath = new vscode.ThemeIcon(entry.icon.id, color);
    } else {
      this.iconPath = getTaskIcon(name, state);
    }

    // When the task has an active state, show a status label as the subtitle
    // and color the item to match the status icon color.
    // Otherwise fall back to any normal subtitle (e.g. detail for vscode tasks).
    if (state === TaskState.Running) {
      this.description = "Running";
      this.resourceUri = vscode.Uri.parse(`taskrunner-task:/running`);
    } else if (state === TaskState.Succeeded) {
      this.description = "Succeeded";
      this.resourceUri = vscode.Uri.parse(`taskrunner-task:/succeeded`);
    } else if (state === TaskState.Failed) {
      this.description = "Failed";
      this.resourceUri = vscode.Uri.parse(`taskrunner-task:/failed`);
    } else if (entry.kind === "vscodeTask") {
      // For VS Code tasks, show detail as description only if available
      const detail = (entry.definition as Record<string, unknown>).detail as string | undefined;
      if (detail) {
        this.description = detail;
      }
    }

    if (entry.kind === "script") {
      this.tooltip = new vscode.MarkdownString(
        `**${entry.name}**\n\n\`${entry.command}\`\n\n*${entry.packageJsonPath}:${entry.lineNumber}*`
      );
    } else {
      this.tooltip = new vscode.MarkdownString(
        `**${entry.label}**\n\nType: \`${entry.type}\`${entry.command ? `\nCommand: \`${entry.command}\`` : ""}\n\n*${entry.taskJsonPath}:${entry.lineNumber}*`
      );
    }

    // On-click: open declaration or focus terminal depending on state
    this.command = {
      command: "taskRunner.itemClicked",
      title: "Open",
      arguments: [this],
    };
  }
}
