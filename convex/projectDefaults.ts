// Project defaults - global rules for project creation

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getProjectDefaults = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("projectDefaults")
      .withIndex("by_scope", (q) => q.eq("scope", "global"))
      .first();
  },
});

export const setProjectDefaults = mutation({
  args: {
    basePath: v.string(),
    projectRootPattern: v.string(),
    frontendDir: v.string(),
    backendDir: v.string(),
    frontendFramework: v.string(),
    frontendArchitecture: v.optional(v.string()),
    frontendRootFolders: v.optional(v.array(v.string())),
    backendFramework: v.string(),
    backendDatabase: v.string(),
    convexProjectPolicy: v.string(),
    schemaPolicy: v.string(),
    deployPrimary: v.string(),
    deployMustUseContainer: v.optional(v.boolean()),
    deploySecondary: v.optional(v.string()),
    deployNotes: v.optional(v.string()),
    dbMode: v.string(),
    dbUrl: v.optional(v.string()),
    mvpStorage: v.string(),
    mvpRule: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("projectDefaults")
      .withIndex("by_scope", (q) => q.eq("scope", "global"))
      .first();

    const payload = {
      scope: "global",
      basePath: args.basePath,
      projectRootPattern: args.projectRootPattern,
      structure: {
        frontendDir: args.frontendDir,
        backendDir: args.backendDir,
      },
      frontend: {
        framework: args.frontendFramework,
        architecture: args.frontendArchitecture,
        rootFolders: args.frontendRootFolders,
      },
      backend: {
        framework: args.backendFramework,
        database: args.backendDatabase,
        convexProjectPolicy: args.convexProjectPolicy,
        schemaPolicy: args.schemaPolicy,
      },
      deploy: {
        primary: args.deployPrimary,
        mustUseContainer: args.deployMustUseContainer,
        secondary: args.deploySecondary,
        notes: args.deployNotes,
      },
      db: {
        mode: args.dbMode,
        url: args.dbUrl,
        mvpStorage: args.mvpStorage,
        mvpRule: args.mvpRule,
      },
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { updated: true };
    }

    await ctx.db.insert("projectDefaults", {
      ...payload,
      createdAt: now,
    });

    return { created: true };
  },
});
