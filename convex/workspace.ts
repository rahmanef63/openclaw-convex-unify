// Workspace Files Management

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================
// FILE OPERATIONS
// ============================================

// Save or update a file
export const saveFile = mutation({
  args: {
    path: v.string(),
    fileType: v.string(),
    category: v.string(),
    content: v.string(),
    ownerId: v.optional(v.id("userProfiles")),
    agentId: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    isTemplate: v.optional(v.boolean()),
    parsedData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workspaceFiles")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();
    
    const now = Date.now();
    
    if (existing) {
      // Save version history before updating
      await ctx.db.insert("fileVersions", {
        fileId: existing._id,
        version: existing.version,
        content: existing.content,
        changedBy: args.ownerId,
        timestamp: now,
      });
      
      // Update file
      await ctx.db.patch(existing._id, {
        content: args.content,
        parsedData: args.parsedData,
        description: args.description,
        tags: args.tags,
        version: existing.version + 1,
        updatedAt: now,
        syncStatus: "synced",
        lastSyncedAt: now,
      });
      
      return await ctx.db.get(existing._id);
    } else {
      // Create new file
      const id = await ctx.db.insert("workspaceFiles", {
        path: args.path,
        fileType: args.fileType,
        category: args.category,
        ownerId: args.ownerId,
        agentId: args.agentId,
        content: args.content,
        parsedData: args.parsedData,
        description: args.description,
        tags: args.tags,
        isTemplate: args.isTemplate,
        version: 1,
        syncStatus: "synced",
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      
      return await ctx.db.get(id);
    }
  },
});

// Get file by path
export const getFile = query({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceFiles")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();
  },
});

// Get files by owner
export const getFilesByOwner = query({
  args: { 
    ownerId: v.optional(v.id("userProfiles")),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.category) {
      return await ctx.db
        .query("workspaceFiles")
        .withIndex("by_owner_category", (q) => 
          q.eq("ownerId", args.ownerId).eq("category", args.category!)
        )
        .collect();
    }
    
    return await ctx.db
      .query("workspaceFiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();
  },
});

// Get files by category (e.g., all "agent" files)
export const getFilesByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceFiles")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();
  },
});

// Get files by agent
export const getFilesByAgent = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceFiles")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();
  },
});

// Delete file
export const deleteFile = mutation({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("workspaceFiles")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();
    
    if (file) {
      // Delete version history
      const versions = await ctx.db
        .query("fileVersions")
        .withIndex("by_file", (q) => q.eq("fileId", file._id))
        .collect();
      
      for (const v of versions) {
        await ctx.db.delete(v._id);
      }
      
      await ctx.db.delete(file._id);
      return true;
    }
    
    return false;
  },
});

// Get file version history
export const getFileHistory = query({
  args: { 
    path: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("workspaceFiles")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();
    
    if (!file) return [];
    
    return await ctx.db
      .query("fileVersions")
      .withIndex("by_file", (q) => q.eq("fileId", file._id))
      .order("desc")
      .take(args.limit || 10);
  },
});

// ============================================
// WORKSPACE TREE OPERATIONS
// ============================================

// Create workspace tree
export const createWorkspace = mutation({
  args: {
    rootPath: v.string(),
    name: v.string(),
    type: v.string(),
    ownerId: v.optional(v.id("userProfiles")),
    parentId: v.optional(v.id("workspaceTrees")),
    agentId: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workspaceTrees")
      .withIndex("by_rootPath", (q) => q.eq("rootPath", args.rootPath))
      .first();
    
    if (existing) {
      return existing;
    }
    
    const now = Date.now();
    const id = await ctx.db.insert("workspaceTrees", {
      rootPath: args.rootPath,
      name: args.name,
      type: args.type,
      ownerId: args.ownerId,
      parentId: args.parentId,
      agentId: args.agentId,
      description: args.description,
      fileCount: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    
    return await ctx.db.get(id);
  },
});

// Get workspace by path
export const getWorkspace = query({
  args: { rootPath: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceTrees")
      .withIndex("by_rootPath", (q) => q.eq("rootPath", args.rootPath))
      .first();
  },
});

// Get workspaces by owner
export const getWorkspacesByOwner = query({
  args: { ownerId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceTrees")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

// Get child workspaces
export const getChildWorkspaces = query({
  args: { parentId: v.id("workspaceTrees") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceTrees")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

// List all workspaces
export const listWorkspaces = query({
  args: { type: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let query = ctx.db.query("workspaceTrees");
    
    if (args.type) {
      query = query.withIndex("by_type", (q) => q.eq("type", args.type!));
    }
    
    return await query
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

// ============================================
// BULK OPERATIONS
// ============================================

// Get all files in a workspace (by path prefix)
export const getWorkspaceFiles = query({
  args: { rootPath: v.string() },
  handler: async (ctx, args) => {
    // Get all files and filter by path prefix
    const allFiles = await ctx.db.query("workspaceFiles").collect();
    const prefix = args.rootPath;
    
    return allFiles.filter(f => 
      f.path === prefix || f.path.startsWith(prefix + "/")
    );
  },
});

// Export workspace (all files as object)
export const exportWorkspace = query({
  args: { rootPath: v.string() },
  handler: async (ctx, args) => {
    const files = await ctx.db.query("workspaceFiles").collect();
    const prefix = args.rootPath;
    
    const result: Record<string, { content: string; version: number }> = {};
    
    for (const f of files) {
      if (f.path === prefix || f.path.startsWith(prefix + "/")) {
        result[f.path] = {
          content: f.content,
          version: f.version,
        };
      }
    }
    
    return result;
  },
});

// ============================================
// TEMPLATE OPERATIONS
// ============================================

// Get template files
export const getTemplates = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("workspaceFiles")
      .filter((q) => q.eq(q.field("isTemplate"), true))
      .collect();
  },
});

// Clone template for new user
export const cloneTemplate = mutation({
  args: {
    templatePath: v.string(),
    newPath: v.string(),
    ownerId: v.id("userProfiles"),
    replacements: v.optional(v.any()), // { "{{name}}": "Rahman" }
  },
  handler: async (ctx, args) => {
    const template = await ctx.db
      .query("workspaceFiles")
      .withIndex("by_path", (q) => q.eq("path", args.templatePath))
      .first();
    
    if (!template) {
      throw new Error(`Template not found: ${args.templatePath}`);
    }
    
    let content = template.content;
    
    // Apply replacements
    if (args.replacements) {
      for (const [key, value] of Object.entries(args.replacements)) {
        content = content.replaceAll(key, String(value));
      }
    }
    
    const now = Date.now();
    
    const id = await ctx.db.insert("workspaceFiles", {
      path: args.newPath,
      fileType: template.fileType,
      category: template.category,
      ownerId: args.ownerId,
      agentId: template.agentId,
      content,
      version: 1,
      syncStatus: "synced",
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    
    return await ctx.db.get(id);
  },
});
