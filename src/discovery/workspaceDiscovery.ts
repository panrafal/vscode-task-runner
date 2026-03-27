import * as vscode from "vscode";
import * as path from "path";
import { PackageManager } from "../types";
import { parsePnpmWorkspaceYaml } from "./yamlParser";

/**
 * Discover workspace package.json paths from declared workspace globs.
 * Only scans paths declared in pnpm-workspace.yaml or the workspaces field,
 * never the entire project.
 */
export async function discoverWorkspacePackages(
  workspaceFolder: vscode.WorkspaceFolder,
  packageManager: PackageManager,
  rootWorkspacesField?: string[]
): Promise<string[]> {
  let globs: string[];

  if (packageManager === "pnpm") {
    globs = await getPnpmWorkspaceGlobs(workspaceFolder);
  } else if (rootWorkspacesField && rootWorkspacesField.length > 0) {
    // npm or yarn: workspaces from package.json
    globs = rootWorkspacesField;
  } else {
    return [];
  }

  if (globs.length === 0) {
    return [];
  }

  const packageJsonPaths: string[] = [];

  for (const glob of globs) {
    // Normalize the glob: strip trailing slashes, append /package.json
    const normalizedGlob = glob.replace(/\/+$/, "");
    const pattern = new vscode.RelativePattern(
      workspaceFolder,
      `${normalizedGlob}/package.json`
    );

    const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**");
    for (const uri of uris) {
      packageJsonPaths.push(uri.fsPath);
    }
  }

  // Sort by path for stable ordering
  packageJsonPaths.sort((a, b) => a.localeCompare(b));

  return packageJsonPaths;
}

async function getPnpmWorkspaceGlobs(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<string[]> {
  const yamlUri = vscode.Uri.joinPath(
    workspaceFolder.uri,
    "pnpm-workspace.yaml"
  );

  try {
    const bytes = await vscode.workspace.fs.readFile(yamlUri);
    const content = Buffer.from(bytes).toString("utf-8");
    return parsePnpmWorkspaceYaml(content);
  } catch {
    return [];
  }
}
