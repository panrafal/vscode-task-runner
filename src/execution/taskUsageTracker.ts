import * as vscode from "vscode";
import { TaskEntry, taskKey } from "../types";

const MRU_KEY = "taskRunner.mru.v1";
const MAX_ENTRIES = 200;

interface UsageRecord {
  lastRunAt?: number;
  lastStateChangeAt?: number;
}

type UsageMap = Record<string, UsageRecord>;

export class TaskUsageTracker {
  private map: UsageMap;

  constructor(private context: vscode.ExtensionContext) {
    this.map = context.workspaceState.get<UsageMap>(MRU_KEY) ?? {};
  }

  recordRun(entry: TaskEntry): void {
    const key = taskKey(entry);
    const rec = this.map[key] ?? {};
    rec.lastRunAt = Date.now();
    this.map[key] = rec;
    this.persist();
  }

  recordStateChange(entry: TaskEntry): void {
    const key = taskKey(entry);
    const rec = this.map[key] ?? {};
    rec.lastStateChangeAt = Date.now();
    this.map[key] = rec;
    this.persist();
  }

  getSortTimestamp(entry: TaskEntry): number | undefined {
    const rec = this.map[taskKey(entry)];
    if (!rec) {
      return undefined;
    }
    return rec.lastRunAt ?? rec.lastStateChangeAt;
  }

  getRecent(entries: TaskEntry[], limit: number): TaskEntry[] {
    const withTs: Array<{ entry: TaskEntry; ts: number }> = [];
    for (const entry of entries) {
      const ts = this.getSortTimestamp(entry);
      if (ts !== undefined) {
        withTs.push({ entry, ts });
      }
    }
    withTs.sort((a, b) => b.ts - a.ts);
    return withTs.slice(0, limit).map((x) => x.entry);
  }

  private persist(): void {
    const keys = Object.keys(this.map);
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys
        .map((k) => {
          const rec = this.map[k];
          const ts = rec.lastRunAt ?? rec.lastStateChangeAt ?? 0;
          return { k, ts };
        })
        .sort((a, b) => b.ts - a.ts);
      const kept: UsageMap = {};
      for (const { k } of sorted.slice(0, MAX_ENTRIES)) {
        kept[k] = this.map[k];
      }
      this.map = kept;
    }
    void this.context.workspaceState.update(MRU_KEY, this.map);
  }
}
