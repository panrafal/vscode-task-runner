import * as vscode from "vscode";
import * as path from "path";
import { PackageManager } from "../types";

const LOCK_FILES: [string, PackageManager][] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

export async function detectPackageManager(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<PackageManager> {
  for (const [lockFile, pm] of LOCK_FILES) {
    const lockUri = vscode.Uri.joinPath(workspaceFolder.uri, lockFile);
    try {
      await vscode.workspace.fs.stat(lockUri);
      return pm;
    } catch {
      // File doesn't exist, try next
    }
  }
  return "npm";
}

export function getRunCommand(pm: PackageManager): string {
  return pm === "npm" ? "npm run" : pm === "yarn" ? "yarn run" : "pnpm run";
}

export function getExecuteCommand(pm: PackageManager): string[] {
  switch (pm) {
    case "npm":
      return ["npm", "run"];
    case "yarn":
      return ["yarn", "run"];
    case "pnpm":
      return ["pnpm", "run"];
  }
}
