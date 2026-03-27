/**
 * Minimal parser for pnpm-workspace.yaml.
 * Only extracts the `packages:` array of glob strings.
 * Avoids a full YAML dependency since the format is simple and stable.
 */
export function parsePnpmWorkspaceYaml(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const packages: string[] = [];
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^packages:\s*(#.*)?$/.test(trimmed)) {
      inPackages = true;
      continue;
    }

    if (inPackages) {
      // A non-indented, non-empty line means we've left the packages block
      if (trimmed.length > 0 && !line.startsWith(" ") && !line.startsWith("\t")) {
        break;
      }

      // Match list items like `  - "packages/*"` or `  - 'apps/*'` or `  - apps/*`
      const match = trimmed.match(/^-\s+['"]?([^'"]+)['"]?\s*$/);
      if (match) {
        packages.push(match[1]);
      }
    }
  }

  return packages;
}
