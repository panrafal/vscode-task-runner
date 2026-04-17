# Task Runner

A better task panel for VS Code. Discover and run all your npm, pnpm, and yarn scripts alongside VS Code tasks in a single, organized tree view.

## Features

### All your tasks in one place

Task Runner automatically discovers scripts from your `package.json` files and tasks from `.vscode/tasks.json`, presenting them in a single tree view in the Explorer sidebar. It detects your package manager and resolves workspaces — only scanning declared workspace paths, never the entire project.

The tree is ordered for quick access:

1. VS Code tasks (ungrouped first, then grouped by `category`)
2. Root package scripts
3. Workspace package scripts

Everything preserves declaration order, so the tree matches what you see in your files.

### Run, debug, and stop with one click

Hover over any task to reveal inline action buttons:

- **Run** — start the task in a dedicated terminal
- **Debug** — run with Node.js inspector attached
- **Stop** — terminate a running task
- **Configure** — promote an npm script to a VS Code task for reordering and customization

If a task is already running, clicking Run focuses its terminal instead of starting a duplicate.

### Live execution state

Icons change color to reflect what each task is doing:

- **Gray** — idle
- **Blue** — running
- **Green** — succeeded
- **Red** — failed

Click the refresh button to clear completed states and start fresh.

### Smart icons

Tasks are assigned icons based on their name — test scripts get a beaker, build gets a package, dev/start gets a play button, and so on. VS Code tasks can also specify a custom icon using the standard `icon` field in `tasks.json`.

### Quick navigation

- **Click** a task to jump to its declaration in `package.json` or `tasks.json`
- **Click** a running or completed task to focus its terminal
- **Right-click** for Open and Configure Task options

### Command palette

Run **Task Runner: Run Task** from the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) to search and run any task without leaving the keyboard.

### npm script and VS Code task linking

When a VS Code task wraps an npm script (`"type": "npm"`), both entries stay in sync — running one marks both as running, and the terminal is shared.

### Automatic refresh

File watchers monitor `package.json`, `tasks.json`, and `pnpm-workspace.yaml` for changes. The tree updates automatically whenever you edit these files.

## Installation

The extension is not published on the VS Code Marketplace. Install the latest `.vsix` from the [GitHub Releases page](https://github.com/panrafal/vscode-task-runner/releases):

1. Download `vscode-task-runner-<version>.vsix` from the [latest release](https://github.com/panrafal/vscode-task-runner/releases/latest).
2. Install it using either method below.

**From the Extensions view:**

Open the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`), click the `...` menu, choose **Install from VSIX...**, and select the downloaded file.

**From the command line:**

```sh
code --install-extension vscode-task-runner-<version>.vsix
```

## Requirements

- VS Code 1.85.0 or later

## License

MIT
