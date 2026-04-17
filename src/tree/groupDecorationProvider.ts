import * as vscode from "vscode";

export class GroupDecorationProvider implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme === "taskrunner-group") {
      return {
        // color: new vscode.ThemeColor("charts.yellow"),
      };
    }

    if (uri.scheme === "taskrunner-task") {
      const state = uri.path.slice(1); // strip leading "/"
      switch (state) {
        case "running":
          return { color: new vscode.ThemeColor("charts.blue") };
        case "succeeded":
          return { color: new vscode.ThemeColor("charts.green") };
        case "failed":
          return { color: new vscode.ThemeColor("charts.red") };
      }
    }

    return undefined;
  }
}
