import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const TENANT_TABLES = [
  "userProfiles",
  "roles",
  "userRoles",
  "permissionLogs",
  "agents",
  "sessions",
  "messages",
  "memories",
  "dailyNotes",
  "heartbeatTasks",
  "projects",
  "projectDefaults",
  "notifications",
  "workspaceFiles",
  "fileVersions",
  "tenantCrudItems",
  "tasks",
  "vectorChunks",
] as const;

type TableName = (typeof TENANT_TABLES)[number];

function assertTable(table: string): asserts table is TableName {
  if (!TENANT_TABLES.includes(table as TableName)) {
    throw new Error(`INVALID_TABLE: ${table}`);
  }
}

function hasNullTenant(doc: any) {
  return doc.tenantId === null || doc.tenantId === undefined || doc.tenantId === "";
}

export const listTables = query({
  args: {},
  handler: async () => TENANT_TABLES,
});

export const tableDryRun = query({
  args: {
    table: v.string(),
    scanLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertTable(args.table);
    const scanLimit = Math.max(100, Math.min(args.scanLimit ?? 5000, 20000));
    const rows = await ctx.db.query(args.table as any).take(scanLimit + 1);
    const truncated = rows.length > scanLimit;
    const sample = truncated ? rows.slice(0, scanLimit) : rows;
    const nullBefore = sample.filter((r: any) => hasNullTenant(r)).length;
    return {
      table: args.table,
      scanned: sample.length,
      null_before: nullBefore,
      updated: 0,
      null_after: nullBefore,
      truncated,
      scanLimit,
    };
  },
});

export const tableApplyBatch = mutation({
  args: {
    table: v.string(),
    tenantId: v.string(),
    scanLimit: v.optional(v.number()),
    maxUpdates: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertTable(args.table);
    const scanLimit = Math.max(100, Math.min(args.scanLimit ?? 5000, 20000));
    const maxUpdates = Math.max(1, Math.min(args.maxUpdates ?? 500, 5000));

    const rows = await ctx.db.query(args.table as any).take(scanLimit + 1);
    const truncated = rows.length > scanLimit;
    const sample = truncated ? rows.slice(0, scanLimit) : rows;

    const targets = sample.filter((r: any) => hasNullTenant(r)).slice(0, maxUpdates);

    let updated = 0;
    let errors = 0;
    for (const row of targets as any[]) {
      try {
        await ctx.db.patch(row._id, { tenantId: args.tenantId });
        updated++;
      } catch {
        errors++;
        break;
      }
    }

    const nullBefore = sample.filter((r: any) => hasNullTenant(r)).length;
    const nullAfter = Math.max(0, nullBefore - updated);

    return {
      table: args.table,
      scanned: sample.length,
      null_before: nullBefore,
      updated,
      null_after: nullAfter,
      errors,
      truncated,
      scanLimit,
      maxUpdates,
    };
  },
});
