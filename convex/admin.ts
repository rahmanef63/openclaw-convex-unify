// Admin - Check all tables status

import { query } from "./_generated/server";

export const getTableStats = query({
  handler: async (ctx) => {
    const tables = [
      "userProfiles",
      "agentIdentity",
      "agentOperations",
      "toolsConfig",
      "heartbeatTasks",
      "sessions",
      "messages",
      "memories",
      "projects",
      "dailyNotes",
      "roles",
      "userRoles",
      "permissionLogs",
      "agents",
      "agentSessions",
      "notifications",
      "workspaceFiles",
      "workspaceTrees",
      "fileVersions",
    ];
    
    const stats: Record<string, number> = {};
    
    for (const table of tables) {
      try {
        const docs = await ctx.db.query(table as any).collect();
        stats[table] = docs.length;
      } catch (e) {
        stats[table] = -1; // Error
      }
    }
    
    return stats;
  },
});
