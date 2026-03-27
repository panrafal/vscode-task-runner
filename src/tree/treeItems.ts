import * as vscode from "vscode";
import { TaskEntry, TaskState } from "../types";
import { getTaskIcon, getStateColor } from "./iconResolver";

export class GroupTreeItem extends vscode.TreeItem {
  public readonly children: TaskTreeItem[] = [];

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
    public readonly state: TaskState
  ) {
    super(
      entry.kind === "script" ? entry.name : entry.label,
      vscode.TreeItemCollapsibleState.None
    );

    const name = entry.kind === "script" ? entry.name : entry.label;
    this.contextValue = `task.${state}`;

    // Use the task's custom icon if defined, otherwise fall back to heuristic
    if (entry.kind === "vscodeTask" && entry.icon) {
      const color = getStateColor(state) ??
        (entry.icon.color ? new vscode.ThemeColor(entry.icon.color) : undefined);
      this.iconPath = new vscode.ThemeIcon(entry.icon.id, color);
    } else {
      this.iconPath = getTaskIcon(name, state);
    }

    if (entry.kind === "script") {
      this.tooltip = new vscode.MarkdownString(
        `**${entry.name}**\n\n\`${entry.command}\`\n\n*${entry.packageJsonPath}:${entry.lineNumber}*`
      );
    } else {
      // For VS Code tasks, show detail as description only if available
      const detail = (entry.definition as Record<string, unknown>).detail as string | undefined;
      if (detail) {
        this.description = detail;
      }
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
