import * as vscode from "vscode";
import { TaskState } from "../types";

export function getIconId(name: string): string {
  const lower = name.toLowerCase();

  if (lower.includes("test") || lower.includes("spec")) {
    return "beaker";
  }
  if (
    lower.includes("lint") ||
    lower.includes("check") ||
    lower.includes("types") ||
    lower.includes("typecheck") ||
    lower.includes("eslint") ||
    lower.includes("prettier") ||
    lower.includes("format")
  ) {
    return "checklist";
  }
  if (
    lower.includes("start") ||
    lower.includes("dev") ||
    lower.includes("serve") ||
    lower.includes("watch")
  ) {
    return "play";
  }
  if (lower.includes("build") || lower.includes("compile")) {
    return "package";
  }
  if (lower.includes("clean") || lower.includes("reset")) {
    return "trash";
  }
  if (lower.includes("deploy") || lower.includes("publish") || lower.includes("release")) {
    return "rocket";
  }
  if (lower.includes("install") || lower.includes("bootstrap")) {
    return "cloud-download";
  }

  return "wrench";
}

export function getStateColor(state: TaskState): vscode.ThemeColor | undefined {
  switch (state) {
    case TaskState.Running:
      return new vscode.ThemeColor("charts.blue");
    case TaskState.Failed:
      return new vscode.ThemeColor("charts.red");
    case TaskState.Succeeded:
      return new vscode.ThemeColor("charts.green");
    case TaskState.Idle:
    default:
      return undefined; // default/gray
  }
}

export function getTaskIcon(
  name: string,
  state: TaskState
): vscode.ThemeIcon {
  return new vscode.ThemeIcon(getIconId(name), getStateColor(state));
}
