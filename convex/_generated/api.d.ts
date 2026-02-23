/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as agentIdentity from "../agentIdentity.js";
import type * as agents from "../agents.js";
import type * as heartbeatTasks from "../heartbeatTasks.js";
import type * as internal_ from "../internal.js";
import type * as memories from "../memories.js";
import type * as rbac from "../rbac.js";
import type * as scripts from "../scripts.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as sync from "../sync.js";
import type * as userProfiles from "../userProfiles.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  agentIdentity: typeof agentIdentity;
  agents: typeof agents;
  heartbeatTasks: typeof heartbeatTasks;
  internal: typeof internal_;
  memories: typeof memories;
  rbac: typeof rbac;
  scripts: typeof scripts;
  seed: typeof seed;
  sessions: typeof sessions;
  sync: typeof sync;
  userProfiles: typeof userProfiles;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
