// OpenClaw Data Schema
// This defines all tables for storing OpenClaw data persistently

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // USER PROFILES (USER.md equivalent)
  // ============================================
  userProfiles: defineTable({
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    nickname: v.optional(v.string()),
    timezone: v.optional(v.string()),
    language: v.optional(v.string()),
    preferences: v.optional(v.object({
      notifications: v.optional(v.boolean()),
      voiceResponse: v.optional(v.boolean()),
      quietHours: v.optional(v.object({
        start: v.optional(v.string()),
        end: v.optional(v.string()),
      })),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_phone", ["phone"])
    .index("by_email", ["email"]),

  // ============================================
  // AGENT IDENTITY (SOUL.md, IDENTITY.md equivalent)
  // ============================================
  agentIdentity: defineTable({
    agentId: v.string(),
    name: v.optional(v.string()),
    creature: v.optional(v.string()), // AI, robot, familiar, ghost, etc.
    vibe: v.optional(v.string()), // sharp, warm, chaotic, calm
    emoji: v.optional(v.string()),
    avatar: v.optional(v.string()), // path or URL
    soulContent: v.optional(v.string()), // SOUL.md raw content
    identityContent: v.optional(v.string()), // IDENTITY.md raw content
    version: v.number(),
    updatedAt: v.number(),
  }).index("by_agentId", ["agentId"]),

  // ============================================
  // AGENT OPERATIONS (AGENTS.md equivalent)
  // ============================================
  agentOperations: defineTable({
    agentId: v.string(),
    operationsContent: v.string(), // AGENTS.md raw content
    rules: v.optional(v.array(v.object({
      category: v.string(),
      rule: v.string(),
    }))),
    version: v.number(),
    updatedAt: v.number(),
  }).index("by_agentId", ["agentId"]),

  // ============================================
  // TOOLS CONFIG (TOOLS.md equivalent)
  // ============================================
  toolsConfig: defineTable({
    agentId: v.string(),
    toolsContent: v.string(), // TOOLS.md raw content
    cameraNames: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      location: v.optional(v.string()),
    }))),
    sshHosts: v.optional(v.array(v.object({
      alias: v.string(),
      host: v.string(),
      user: v.optional(v.string()),
    }))),
    voicePreferences: v.optional(v.object({
      preferredVoice: v.optional(v.string()),
      defaultSpeaker: v.optional(v.string()),
    })),
    version: v.number(),
    updatedAt: v.number(),
  }).index("by_agentId", ["agentId"]),

  // ============================================
  // HEARTBEAT TASKS (HEARTBEAT.md equivalent)
  // ============================================
  heartbeatTasks: defineTable({
    taskId: v.string(),
    description: v.string(),
    schedule: v.optional(v.string()), // cron or description
    enabled: v.boolean(),
    lastRun: v.optional(v.number()),
    lastResult: v.optional(v.string()),
    nextRun: v.optional(v.number()),
    config: v.optional(v.any()), // task-specific config
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_taskId", ["taskId"])
    .index("by_enabled", ["enabled"]),

  // ============================================
  // SESSIONS (OpenClaw sessions)
  // ============================================
  sessions: defineTable({
    sessionKey: v.string(),
    channel: v.optional(v.string()), // whatsapp, telegram, discord, web
    userId: v.optional(v.id("userProfiles")),
    agentId: v.optional(v.string()),
    model: v.optional(v.string()),
    status: v.optional(v.string()), // active, paused, ended
    createdAt: v.number(),
    lastActiveAt: v.number(),
    metadata: v.optional(v.any()),
  }).index("by_sessionKey", ["sessionKey"])
    .index("by_channel", ["channel"]),

  // ============================================
  // MESSAGES (Chat history)
  // ============================================
  messages: defineTable({
    sessionId: v.string(),
    role: v.string(), // user, assistant, system
    content: v.string(),
    timestamp: v.number(),
    messageId: v.optional(v.string()), // external message ID
    metadata: v.optional(v.any()),
  }).index("by_session", ["sessionId"])
    .index("by_session_time", ["sessionId", "timestamp"]),

  // ============================================
  // MEMORIES (Long-term memory)
  // ============================================
  memories: defineTable({
    userId: v.optional(v.id("userProfiles")),
    category: v.string(), // preference, fact, event, decision, lesson
    key: v.string(),
    value: v.string(),
    context: v.optional(v.string()), // additional context
    importance: v.optional(v.number()), // 1-10
    source: v.optional(v.string()), // where this memory came from
    createdAt: v.number(),
    lastAccessedAt: v.optional(v.number()),
    accessCount: v.optional(v.number()),
  }).index("by_user", ["userId"])
    .index("by_user_category", ["userId", "category"])
    .index("by_key", ["key"]),

  // ============================================
  // PROJECTS (Deployed projects)
  // ============================================
  projects: defineTable({
    name: v.string(),
    slug: v.string(), // URL-friendly name
    description: v.optional(v.string()),
    domain: v.optional(v.string()),
    type: v.optional(v.string()), // web, api, fullstack, landing
    status: v.string(), // active, paused, archived, building
    technologies: v.optional(v.array(v.string())),
    config: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deployedAt: v.optional(v.number()),
  }).index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  // ============================================
  // DAILY NOTES (Daily memory files)
  // ============================================
  dailyNotes: defineTable({
    date: v.string(), // YYYY-MM-DD format
    content: v.string(), // Raw markdown content
    summary: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_date", ["date"]),

  // ============================================
  // RBAC - ROLES
  // ============================================
  roles: defineTable({
    name: v.string(), // super_admin, admin, moderator, user, guest
    displayName: v.string(),
    description: v.optional(v.string()),
    level: v.number(), // 100 = super admin, 50 = admin, etc.
    permissions: v.array(v.string()), // ["read", "write", "delete", "admin", "manage_users"]
    isSystem: v.boolean(), // System roles cannot be deleted
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"])
    .index("by_level", ["level"]),

  // ============================================
  // RBAC - USER ROLES (Many-to-Many)
  // ============================================
  userRoles: defineTable({
    userId: v.id("userProfiles"),
    roleId: v.id("roles"),
    grantedBy: v.optional(v.id("userProfiles")), // Who granted this role
    grantedAt: v.number(),
    expiresAt: v.optional(v.number()), // Optional expiration
    isActive: v.boolean(),
  }).index("by_user", ["userId"])
    .index("by_role", ["roleId"])
    .index("by_user_role", ["userId", "roleId"]),

  // ============================================
  // RBAC - PERMISSIONS LOG
  // ============================================
  permissionLogs: defineTable({
    userId: v.id("userProfiles"),
    action: v.string(), // "role_granted", "role_revoked", "permission_check"
    resource: v.optional(v.string()), // What resource was accessed
    roleId: v.optional(v.id("roles")),
    performedBy: v.optional(v.id("userProfiles")),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  }).index("by_user", ["userId"])
    .index("by_timestamp", ["timestamp"]),

  // ============================================
  // AGENTS (Multi-agent support)
  // ============================================
  agents: defineTable({
    agentId: v.string(), // Unique agent identifier
    name: v.string(),
    type: v.string(), // "main", "sub", "worker", "specialized"
    model: v.optional(v.string()),
    status: v.string(), // "active", "paused", "offline"
    capabilities: v.optional(v.array(v.string())),
    config: v.optional(v.any()),
    owner: v.optional(v.id("userProfiles")),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastActiveAt: v.optional(v.number()),
  }).index("by_agentId", ["agentId"])
    .index("by_owner", ["owner"])
    .index("by_status", ["status"]),

  // ============================================
  // AGENT SESSIONS (Detailed session tracking)
  // ============================================
  agentSessions: defineTable({
    sessionId: v.string(),
    agentId: v.string(),
    userId: v.optional(v.id("userProfiles")),
    channel: v.optional(v.string()),
    model: v.optional(v.string()),
    status: v.string(), // "active", "paused", "ended", "error"
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    messageCount: v.optional(v.number()),
    tokenUsage: v.optional(v.object({
      input: v.number(),
      output: v.number(),
      total: v.number(),
    })),
    metadata: v.optional(v.any()),
  }).index("by_sessionId", ["sessionId"])
    .index("by_agent", ["agentId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // ============================================
  // NOTIFICATIONS
  // ============================================
  notifications: defineTable({
    userId: v.id("userProfiles"),
    type: v.string(), // "info", "warning", "error", "success"
    title: v.string(),
    message: v.string(),
    read: v.boolean(),
    actionUrl: v.optional(v.string()),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  }).index("by_user", ["userId"])
    .index("by_user_read", ["userId", "read"]),

  // ============================================
  // WORKSPACE FILES (All workspace files in DB)
  // Hierarchy:
  // - workspace/*.md (super admin agent files)
  // - workspace/user/[username]/*.md (user-specific files)
  // - workspace/user/[username]/[workspace-name]/* (nested workspaces)
  // ============================================
  workspaceFiles: defineTable({
    // Path structure: "SOUL.md", "user/rahman/USER.md", "user/rahman/myproject/README.md"
    path: v.string(),
    
    // File type
    fileType: v.string(), // "md", "json", "txt", "yaml", etc.
    
    // File category for quick filtering
    category: v.string(), // "agent", "user", "workspace", "project", "memory", "config"
    
    // Owner (null for super admin files, userId for user files)
    ownerId: v.optional(v.id("userProfiles")),
    
    // Agent this file belongs to (for multi-agent support)
    agentId: v.optional(v.string()),
    
    // The actual content
    content: v.string(),
    
    // Parsed/extracted data (optional, for structured files)
    parsedData: v.optional(v.any()),
    
    // Version control
    version: v.number(),
    
    // File metadata
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    isTemplate: v.optional(v.boolean()), // Template files can be cloned for new users
    
    // Sync status with local filesystem
    syncStatus: v.optional(v.string()), // "synced", "pending", "conflict"
    lastSyncedAt: v.optional(v.number()),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    
  }).index("by_path", ["path"])
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"])
    .index("by_agent", ["agentId"])
    .index("by_owner_category", ["ownerId", "category"]),

  // ============================================
  // WORKSPACE TREES (Track workspace structure)
  // ============================================
  workspaceTrees: defineTable({
    // Root path for this tree
    rootPath: v.string(), // "", "user/rahman", "user/rahman/myproject"
    
    // Owner of this workspace tree
    ownerId: v.optional(v.id("userProfiles")),
    
    // Workspace name
    name: v.string(),
    
    // Description
    description: v.optional(v.string()),
    
    // Parent workspace (for nested workspaces)
    parentId: v.optional(v.id("workspaceTrees")),
    
    // Agent this workspace belongs to
    agentId: v.optional(v.string()),
    
    // Workspace type
    type: v.string(), // "root", "user", "project", "shared"
    
    // File count
    fileCount: v.optional(v.number()),
    
    // Status
    status: v.string(), // "active", "archived", "deleted"
    
    createdAt: v.number(),
    updatedAt: v.number(),
    
  }).index("by_rootPath", ["rootPath"])
    .index("by_owner", ["ownerId"])
    .index("by_parent", ["parentId"])
    .index("by_type", ["type"]),

  // ============================================
  // FILE VERSIONS (Version history for workspace files)
  // ============================================
  fileVersions: defineTable({
    fileId: v.id("workspaceFiles"),
    version: v.number(),
    content: v.string(),
    changedBy: v.optional(v.id("userProfiles")),
    changeSummary: v.optional(v.string()),
    timestamp: v.number(),
  }).index("by_file", ["fileId"])
    .index("by_file_version", ["fileId", "version"]),
});
