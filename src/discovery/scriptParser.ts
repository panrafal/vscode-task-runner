import * as vscode from "vscode";
import * as path from "path";
import { parseTree, findNodeAtLocation } from "jsonc-parser";
import { ScriptEntry } from "../types";

export interface ParsedPackageJson {
  scripts: ScriptEntry[];
  packageName: string;
  workspaces?: string[];
}

function offsetToLine(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") {
      line++;
    }
  }
  return line;
}

export async function parsePackageJson(
  filePath: string,
  isRoot: boolean
): Promise<ParsedPackageJson> {
  const uri = vscode.Uri.file(filePath);
  const bytes = await vscode.workspace.fs.readFile(uri);
  const content = Buffer.from(bytes).toString("utf-8");
  const tree = parseTree(content);

  const scripts: ScriptEntry[] = [];
  const packageDir = path.dirname(filePath);
  let packageName = path.basename(packageDir);
  let workspaces: string[] | undefined;

  if (tree) {
    // Extract package name
    const nameNode = findNodeAtLocation(tree, ["name"]);
    if (nameNode && nameNode.type === "string") {
      packageName = nameNode.value as string;
    }

    // Extract workspaces
    const workspacesNode = findNodeAtLocation(tree, ["workspaces"]);
    if (workspacesNode) {
      if (workspacesNode.type === "array" && workspacesNode.children) {
        workspaces = workspacesNode.children
          .filter((c) => c.type === "string")
          .map((c) => c.value as string);
      } else if (workspacesNode.type === "object") {
        // yarn workspaces: { packages: [...] }
        const packagesNode = findNodeAtLocation(tree, [
          "workspaces",
          "packages",
        ]);
        if (packagesNode?.type === "array" && packagesNode.children) {
          workspaces = packagesNode.children
            .filter((c) => c.type === "string")
            .map((c) => c.value as string);
        }
      }
    }

    // Extract scripts with line numbers
    const scriptsNode = findNodeAtLocation(tree, ["scripts"]);
    if (scriptsNode?.type === "object" && scriptsNode.children) {
      for (const prop of scriptsNode.children) {
        if (
          prop.type === "property" &&
          prop.children &&
          prop.children.length === 2
        ) {
          const keyNode = prop.children[0];
          const valueNode = prop.children[1];
          if (keyNode.type === "string" && valueNode.type === "string") {
            scripts.push({
              kind: "script",
              name: keyNode.value as string,
              command: valueNode.value as string,
              packageJsonPath: filePath,
              lineNumber: offsetToLine(content, keyNode.offset),
              packageName,
              packageDir,
              isRoot,
            });
          }
        }
      }
    }
  }

  return { scripts, packageName, workspaces };
}
