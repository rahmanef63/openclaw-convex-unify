import { query } from "./_generated/server";
import { v } from "convex/values";

const tableName = v.union(
  v.literal("userProfiles"),
  v.literal("workspaceTrees"),
  v.literal("agents"),
  v.literal("agentDelegations"),
  v.literal("sessions"),
  v.literal("messages"),
  v.literal("agentSessions"),
  v.literal("dailyNotes"),
  v.literal("workspaceFiles"),
);

const CORE_TABLES = [
  "userProfiles",
  "workspaceTrees",
  "agents",
  "agentDelegations",
  "sessions",
  "messages",
  "agentSessions",
  "dailyNotes",
  "workspaceFiles",
] as const;

export const getCoreTableStatsLight = query({
  args: {
    maxPerTable: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxPerTable = Math.max(20, Math.min(args.maxPerTable ?? 100, 1000));
    const stats: Record<string, number> = {};
    const truncated: string[] = [];

    for (const table of CORE_TABLES) {
      try {
        const rows = await ctx.db.query(table as any).take(maxPerTable + 1);
        if (rows.length > maxPerTable) {
          stats[table] = maxPerTable;
          truncated.push(table);
        } else {
          stats[table] = rows.length;
        }
      } catch {
        stats[table] = -1;
      }
    }

    return { maxPerTable, stats, truncated };
  },
});

export const getSingleTableCountLight = query({
  args: {
    table: tableName,
    maxPerTable: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxPerTable = Math.max(20, Math.min(args.maxPerTable ?? 100, 2000));
    const rows = await ctx.db.query(args.table as any).take(maxPerTable + 1);
    return {
      table: args.table,
      maxPerTable,
      count: rows.length > maxPerTable ? maxPerTable : rows.length,
      truncated: rows.length > maxPerTable,
    };
  },
});
