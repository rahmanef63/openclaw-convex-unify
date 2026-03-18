/**
 * admin.ts — Admin queries untuk monitoring & diagnostics
 */

import { query } from "./_generated/server";
import { v } from "convex/values";

const ALL_TABLES = [
  "userProfiles", "roles", "userRoles", "permissionLogs",
  "agents", "sessions", "messages", "agentSessions",
  "memories", "dailyNotes", "heartbeatTasks",
  "projects", "projectDefaults",
  "notifications",
  "workspaceFiles", "workspaceTrees", "fileVersions",
  // legacy
  "agentIdentity", "agentOperations", "toolsConfig",
] as const;

/**
 * Hitung record per tabel dengan mode ringan (aman untuk self-hosted).
 *
 * - `maxPerTable` membatasi scan per tabel (default 2000)
 * - hasil == maxPerTable+ menandakan jumlah sebenarnya lebih besar dari batas scan
 */
export const getTableStats = query({
  args: {
    maxPerTable: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxPerTable = Math.max(100, Math.min(args.maxPerTable ?? 2000, 20000));
    const stats: Record<string, number> = {};
    const truncated: string[] = [];

    for (const table of ALL_TABLES) {
      try {
        const docs = await ctx.db.query(table as any).take(maxPerTable + 1);
        if (docs.length > maxPerTable) {
          stats[table] = maxPerTable;
          truncated.push(table);
        } else {
          stats[table] = docs.length;
        }
      } catch {
        stats[table] = -1;
      }
    }

    return {
      maxPerTable,
      truncated,
      stats,
    };
  },
});

/** Detail semua relasi (FK check) — untuk validasi integritas. */
export const checkIntegrity = query({
  handler: async (ctx) => {
    const issues: string[] = [];
    const pageSize = 200;

    let messagesCount = 0;
    {
      let cursor: string | null = null;
      while (true) {
        const page = await ctx.db.query("messages").paginate({ numItems: pageSize, cursor });
        for (const m of page.page) {
          messagesCount++;
          const session = await ctx.db.get(m.sessionId);
          if (!session) issues.push(`message ${m._id}: sessionId ${m.sessionId} not found`);
        }
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }

    const userRoles = await ctx.db.query("userRoles").collect();
    const userRolesCount = userRoles.length;
    for (const ur of userRoles) {
      const user = await ctx.db.get(ur.userId);
      if (!user) issues.push(`userRole ${ur._id}: userId ${ur.userId} not found`);
      const role = await ctx.db.get(ur.roleId);
      if (!role) issues.push(`userRole ${ur._id}: roleId ${ur.roleId} not found`);
    }

    const fvs = await ctx.db.query("fileVersions").collect();
    const fileVersionsCount = fvs.length;
    for (const fv of fvs) {
      const file = await ctx.db.get(fv.fileId);
      if (!file) issues.push(`fileVersion ${fv._id}: fileId ${fv.fileId} not found`);
    }

    const agentSessions = await ctx.db.query("agentSessions").collect();
    const agentSessionsCount = agentSessions.length;
    for (const as_ of agentSessions) {
      if (as_.convexSessionId) {
        const session = await ctx.db.get(as_.convexSessionId);
        if (!session) issues.push(`agentSession ${as_._id}: convexSessionId not found`);
      }
    }

    return {
      ok: issues.length === 0,
      issues,
      checked: {
        messages: messagesCount,
        userRoles: userRolesCount,
        fileVersions: fileVersionsCount,
        agentSessions: agentSessionsCount,
      },
    };
  },
});

/** Summary lengkap database untuk dashboard. */
export const getDashboard = query({
  handler: async (ctx) => {
    const [
      users, sessions, messages, agents,
      workspaceFiles, dailyNotes, memories,
      projects, roles,
    ] = await Promise.all([
      ctx.db.query("userProfiles").collect(),
      ctx.db.query("sessions").collect(),
      ctx.db.query("messages").collect(),
      ctx.db.query("agents").collect(),
      ctx.db.query("workspaceFiles").collect(),
      ctx.db.query("dailyNotes").collect(),
      ctx.db.query("memories").collect(),
      ctx.db.query("projects").collect(),
      ctx.db.query("roles").collect(),
    ]);

    const activeSessions = sessions.filter((s) => s.status === "active");
    const totalMessages  = messages.length;

    return {
      users:          users.length,
      agents:         agents.length,
      sessions:       sessions.length,
      activeSessions: activeSessions.length,
      messages:       totalMessages,
      workspaceFiles: workspaceFiles.length,
      dailyNotes:     dailyNotes.length,
      memories:       memories.length,
      projects:       projects.length,
      roles:          roles.length,
      sessionsByChannel: sessions.reduce((acc, s) => {
        const ch = s.channel ?? "unknown";
        acc[ch] = (acc[ch] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      projectsByStatus: projects.reduce((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  },
});

/** Ringan: statistik pesan tanpa scan penuh. */
export const getMessageStatsLight = query({
  args: {
    maxItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxItems = Math.max(100, Math.min(args.maxItems ?? 2000, 20000));
    const rows = await ctx.db.query("messages").take(maxItems + 1);
    const truncated = rows.length > maxItems;
    const sample = rows.slice(0, Math.min(maxItems, rows.length));

    const byRole = sample.reduce((acc, m) => {
      const key = m.role ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const latestTimestamp = sample.reduce((mx, m) => Math.max(mx, m.timestamp ?? 0), 0);

    return {
      maxItems,
      counted: sample.length,
      truncated,
      byRole,
      latestTimestamp,
    };
  },
});

/**
 * Single-page stats for fileVersions (cursor-based; client drives pagination).
 * Safe with Convex rule: one paginated query per function call.
 */
export const getFileVersionStatsPage = query({
  args: {
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageSize = Math.max(100, Math.min(args.pageSize ?? 500, 1000));
    const page = await ctx.db
      .query("fileVersions")
      .paginate({ numItems: pageSize, cursor: args.cursor ?? null });

    let latestTimestamp = 0;
    const distinct = new Set<string>();
    for (const r of page.page) {
      distinct.add(String(r.fileId));
      latestTimestamp = Math.max(latestTimestamp, r.timestamp ?? 0);
    }

    return {
      pageSize,
      counted: page.page.length,
      isDone: page.isDone,
      nextCursor: page.continueCursor,
      distinctFileIdsInPage: distinct.size,
      latestTimestampInPage: latestTimestamp,
    };
  },
});
