import * as vscode from "vscode";

export class GroupDecorationProvider implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme === "taskrunner-group") {
      return {
        // color: new vscode.ThemeColor("charts.yellow"),
      };
    }
    return undefined;
  }
}
