import * as vscode from "vscode";

export type PackageManager = "npm" | "yarn" | "pnpm";

export enum TaskState {
  Idle = "idle",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed",
}

export interface ScriptEntry {
  kind: "script";
  name: string;
  command: string;
  packageJsonPath: string;
  lineNumber: number;
  packageName: string;
  packageDir: string;
  isRoot: boolean;
}

export interface TaskIcon {
  id: string;
  color?: string;
}

export interface VscodeTaskEntry {
  kind: "vscodeTask";
  label: string;
  taskJsonPath: string;
  lineNumber: number;
  definition: vscode.TaskDefinition;
  type: string;
  command?: string;
  icon?: TaskIcon;
}

export type TaskEntry = ScriptEntry | VscodeTaskEntry;

export interface TrackedTask {
  entry: TaskEntry;
  state: TaskState;
  execution?: vscode.TaskExecution;
}

export function taskKey(entry: TaskEntry): string {
  if (entry.kind === "script") {
    return `script:${entry.packageJsonPath}:${entry.name}`;
  }
  return `vscode:${entry.label}`;
}

export function npmTaskKeyForScript(entry: ScriptEntry): string {
  return `vscode:npm: ${entry.name}`;
}
