import * as vscode from "vscode";
import * as path from "path";
import { parseTree, findNodeAtLocation, Node } from "jsonc-parser";
import { VscodeTaskEntry } from "../types";

function offsetToLine(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") {
      line++;
    }
  }
  return line;
}

function nodeToValue(node: Node): unknown {
  if (node.type === "string" || node.type === "number" || node.type === "boolean") {
    return node.value;
  }
  if (node.type === "null") {
    return null;
  }
  if (node.type === "array" && node.children) {
    return node.children.map(nodeToValue);
  }
  if (node.type === "object" && node.children) {
    const obj: Record<string, unknown> = {};
    for (const prop of node.children) {
      if (prop.type === "property" && prop.children && prop.children.length === 2) {
        const key = prop.children[0].value as string;
        obj[key] = nodeToValue(prop.children[1]);
      }
    }
    return obj;
  }
  return undefined;
}

export async function parseTasksJson(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<VscodeTaskEntry[]> {
  const tasksJsonPath = path.join(workspaceFolder.uri.fsPath, ".vscode", "tasks.json");
  const uri = vscode.Uri.file(tasksJsonPath);

  const entries: VscodeTaskEntry[] = [];

  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(uri);
  } catch {
    return entries;
  }

  const content = Buffer.from(bytes).toString("utf-8");
  const tree = parseTree(content);
  if (!tree) {
    return entries;
  }

  const tasksNode = findNodeAtLocation(tree, ["tasks"]);
  if (!tasksNode || tasksNode.type !== "array" || !tasksNode.children) {
    return entries;
  }

  for (const taskNode of tasksNode.children) {
    if (taskNode.type !== "object" || !taskNode.children) {
      continue;
    }

    const taskObj = nodeToValue(taskNode) as Record<string, unknown>;
    const label = (taskObj.label as string) || (taskObj.taskName as string) || "Unnamed task";
    const type = (taskObj.type as string) || "shell";
    if (taskObj.hide === true) {
      continue;
    }

    const command = taskObj.command as string | undefined;

    // Parse icon field: { id: string, color?: string }
    let icon: import("../types").TaskIcon | undefined;
    const iconObj = taskObj.icon as Record<string, unknown> | undefined;
    if (iconObj && typeof iconObj.id === "string") {
      icon = { id: iconObj.id };
      if (typeof iconObj.color === "string") {
        icon.color = iconObj.color;
      }
    }

    entries.push({
      kind: "vscodeTask",
      label,
      taskJsonPath: tasksJsonPath,
      lineNumber: offsetToLine(content, taskNode.offset),
      definition: { type, ...taskObj } as vscode.TaskDefinition,
      type,
      command,
      icon,
    });
  }

  return entries;
}

/**
 * Read tasks.json content as string (for modification by configureTask command).
 */
export async function readTasksJsonContent(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<{ content: string; path: string } | undefined> {
  const tasksJsonPath = path.join(workspaceFolder.uri.fsPath, ".vscode", "tasks.json");
  const uri = vscode.Uri.file(tasksJsonPath);

  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return { content: Buffer.from(bytes).toString("utf-8"), path: tasksJsonPath };
  } catch {
    return undefined;
  }
}
