// RBAC (Role-Based Access Control) Functions

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Default system roles
const SYSTEM_ROLES = [
  {
    name: "super_admin",
    displayName: "Super Admin",
    description: "Full system access with all permissions",
    level: 100,
    permissions: ["*"], // All permissions
    isSystem: true,
  },
  {
    name: "admin",
    displayName: "Administrator",
    description: "Administrative access",
    level: 80,
    permissions: ["read", "write", "delete", "manage_users", "manage_agents", "view_logs"],
    isSystem: true,
  },
  {
    name: "moderator",
    displayName: "Moderator",
    description: "Content moderation access",
    level: 50,
    permissions: ["read", "write", "moderate", "view_logs"],
    isSystem: true,
  },
  {
    name: "user",
    displayName: "User",
    description: "Standard user access",
    level: 20,
    permissions: ["read", "write", "use_agents"],
    isSystem: true,
  },
  {
    name: "guest",
    displayName: "Guest",
    description: "Limited read-only access",
    level: 10,
    permissions: ["read"],
    isSystem: true,
  },
];

// ============================================
// INITIALIZATION
// ============================================

// Initialize system roles (run once)
export const initializeRoles = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const existingRoles = await ctx.db.query("roles").collect();
    
    if (existingRoles.length === 0) {
      for (const role of SYSTEM_ROLES) {
        await ctx.db.insert("roles", {
          ...role,
          createdAt: now,
          updatedAt: now,
        });
      }
      return { initialized: true, count: SYSTEM_ROLES.length };
    }
    
    return { initialized: false, message: "Roles already exist" };
  },
});

// ============================================
// ROLE QUERIES
// ============================================

// Get all roles
export const getAllRoles = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("roles")
      .withIndex("by_level", (q) => q)
      .order("desc")
      .collect();
  },
});

// Get role by name
export const getRoleByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

// ============================================
// USER ROLE MANAGEMENT
// ============================================

// Grant role to user
export const grantRole = mutation({
  args: {
    userId: v.id("userProfiles"),
    roleName: v.string(),
    grantedBy: v.optional(v.id("userProfiles")),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get the role
    const role = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.roleName))
      .first();
    
    if (!role) {
      throw new Error(`Role '${args.roleName}' not found`);
    }
    
    // Check if user already has this role
    const existing = await ctx.db
      .query("userRoles")
      .withIndex("by_user_role", (q) => 
        q.eq("userId", args.userId).eq("roleId", role._id)
      )
      .first();
    
    const now = Date.now();
    
    if (existing) {
      // Reactivate if inactive
      await ctx.db.patch(existing._id, {
        isActive: true,
        grantedAt: now,
        grantedBy: args.grantedBy,
        expiresAt: args.expiresAt,
      });
    } else {
      // Create new role assignment
      await ctx.db.insert("userRoles", {
        userId: args.userId,
        roleId: role._id,
        grantedBy: args.grantedBy,
        grantedAt: now,
        expiresAt: args.expiresAt,
        isActive: true,
      });
    }
    
    // Log the action
    await ctx.db.insert("permissionLogs", {
      userId: args.userId,
      action: "role_granted",
      roleId: role._id,
      performedBy: args.grantedBy,
      timestamp: now,
      metadata: { roleName: args.roleName },
    });
    
    return { success: true, role: role.name };
  },
});

// Revoke role from user
export const revokeRole = mutation({
  args: {
    userId: v.id("userProfiles"),
    roleName: v.string(),
    revokedBy: v.optional(v.id("userProfiles")),
  },
  handler: async (ctx, args) => {
    const role = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.roleName))
      .first();
    
    if (!role) {
      throw new Error(`Role '${args.roleName}' not found`);
    }
    
    const userRole = await ctx.db
      .query("userRoles")
      .withIndex("by_user_role", (q) => 
        q.eq("userId", args.userId).eq("roleId", role._id)
      )
      .first();
    
    if (userRole) {
      await ctx.db.patch(userRole._id, { isActive: false });
      
      // Log the action
      await ctx.db.insert("permissionLogs", {
        userId: args.userId,
        action: "role_revoked",
        roleId: role._id,
        performedBy: args.revokedBy,
        timestamp: Date.now(),
        metadata: { roleName: args.roleName },
      });
    }
    
    return { success: true };
  },
});

// Get user's roles
export const getUserRoles = query({
  args: { userId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const userRoles = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    // Filter out expired roles and fetch role details
    const roles = [];
    for (const ur of userRoles) {
      if (ur.expiresAt && ur.expiresAt < now) {
        continue; // Skip expired roles
      }
      const role = await ctx.db.get(ur.roleId);
      if (role) {
        roles.push({
          ...role,
          grantedAt: ur.grantedAt,
          expiresAt: ur.expiresAt,
        });
      }
    }
    
    // Sort by level descending
    return roles.sort((a, b) => b.level - a.level);
  },
});

// Get user's highest role level
export const getUserLevel = query({
  args: { userId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const roles = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    let maxLevel = 0;
    const now = Date.now();
    
    for (const ur of roles) {
      if (ur.expiresAt && ur.expiresAt < now) continue;
      const role = await ctx.db.get(ur.roleId);
      if (role && role.level > maxLevel) {
        maxLevel = role.level;
      }
    }
    
    return maxLevel;
  },
});

// ============================================
// PERMISSION CHECKING
// ============================================

// Check if user has permission
export const hasPermission = query({
  args: {
    userId: v.id("userProfiles"),
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    const roles = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    const now = Date.now();
    
    for (const ur of roles) {
      if (ur.expiresAt && ur.expiresAt < now) continue;
      const role = await ctx.db.get(ur.roleId);
      if (role) {
        // Check for wildcard permission
        if (role.permissions.includes("*")) {
          return true;
        }
        // Check for specific permission
        if (role.permissions.includes(args.permission)) {
          return true;
        }
      }
    }
    
    return false;
  },
});

// Check if user has minimum level
export const hasLevel = query({
  args: {
    userId: v.id("userProfiles"),
    minLevel: v.number(),
  },
  handler: async (ctx, args) => {
    const roles = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    const now = Date.now();
    
    for (const ur of roles) {
      if (ur.expiresAt && ur.expiresAt < now) continue;
      const role = await ctx.db.get(ur.roleId);
      if (role && role.level >= args.minLevel) {
        return true;
      }
    }
    
    return false;
  },
});

// Check if user can perform action on target user (based on levels)
export const canManageUser = query({
  args: {
    actorId: v.id("userProfiles"),
    targetId: v.id("userProfiles"),
  },
  handler: async (ctx, args) => {
    if (args.actorId === args.targetId) {
      return true; // Users can manage themselves (within limits)
    }
    
    // Get actor's highest level
    const actorRoles = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", args.actorId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    let actorLevel = 0;
    const now = Date.now();
    
    for (const ur of actorRoles) {
      if (ur.expiresAt && ur.expiresAt < now) continue;
      const role = await ctx.db.get(ur.roleId);
      if (role && role.level > actorLevel) {
        actorLevel = role.level;
      }
    }
    
    // Get target's highest level
    const targetRoles = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", args.targetId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    let targetLevel = 0;
    
    for (const ur of targetRoles) {
      if (ur.expiresAt && ur.expiresAt < now) continue;
      const role = await ctx.db.get(ur.roleId);
      if (role && role.level > targetLevel) {
        targetLevel = role.level;
      }
    }
    
    // Actor can only manage users with lower or equal level
    return actorLevel > targetLevel;
  },
});

// ============================================
// ADMIN FUNCTIONS
// ============================================

// Get all users with their roles
export const getAllUsersWithRoles = query({
  handler: async (ctx) => {
    const users = await ctx.db.query("userProfiles").collect();
    const result = [];
    
    for (const user of users) {
      const userRoles = await ctx.db
        .query("userRoles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
      
      const roles = [];
      for (const ur of userRoles) {
        const role = await ctx.db.get(ur.roleId);
        if (role) {
          roles.push({
            name: role.name,
            displayName: role.displayName,
            level: role.level,
            grantedAt: ur.grantedAt,
          });
        }
      }
      
      result.push({
        ...user,
        roles,
        highestLevel: roles.reduce((max, r) => Math.max(max, r.level), 0),
      });
    }
    
    // Sort by highest level
    return result.sort((a, b) => b.highestLevel - a.highestLevel);
  },
});

// Get permission logs
export const getPermissionLogs = query({
  args: {
    limit: v.optional(v.number()),
    userId: v.optional(v.id("userProfiles")),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("permissionLogs");
    
    if (args.userId) {
      query = query.withIndex("by_user", (q) => q.eq("userId", args.userId));
    } else {
      query = query.withIndex("by_timestamp", (q) => q);
    }
    
    const logs = await query.order("desc").take(args.limit || 50);
    
    // Enrich with user and role data
    const result = [];
    for (const log of logs) {
      const user = await ctx.db.get(log.userId);
      let performedByUser = null;
      if (log.performedBy) {
        performedByUser = await ctx.db.get(log.performedBy);
      }
      
      result.push({
        ...log,
        userName: user?.name || user?.phone || "Unknown",
        performedByName: performedByUser?.name || performedByUser?.phone || null,
      });
    }
    
    return result;
  },
});
