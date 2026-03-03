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
import type * as agentDelegations from "../agentDelegations.js";
import type * as agentIdentity from "../agentIdentity.js";
import type * as agents from "../agents.js";
import type * as backfill from "../backfill.js";
import type * as contextBuilder from "../contextBuilder.js";
import type * as dailyNotes from "../dailyNotes.js";
import type * as heartbeatTasks from "../heartbeatTasks.js";
import type * as internal_ from "../internal.js";
import type * as memories from "../memories.js";
import type * as projectDefaults from "../projectDefaults.js";
import type * as projectsCatalog from "../projectsCatalog.js";
import type * as rbac from "../rbac.js";
import type * as scripts from "../scripts.js";
import type * as seed from "../seed.js";
import type * as sessionSummaries from "../sessionSummaries.js";
import type * as sessions from "../sessions.js";
import type * as sync from "../sync.js";
import type * as tenantCrud from "../tenantCrud.js";
import type * as tenantGuard from "../tenantGuard.js";
import type * as userIdentities from "../userIdentities.js";
import type * as userProfiles from "../userProfiles.js";
import type * as vectors from "../vectors.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  agentDelegations: typeof agentDelegations;
  agentIdentity: typeof agentIdentity;
  agents: typeof agents;
  backfill: typeof backfill;
  contextBuilder: typeof contextBuilder;
  dailyNotes: typeof dailyNotes;
  heartbeatTasks: typeof heartbeatTasks;
  internal: typeof internal_;
  memories: typeof memories;
  projectDefaults: typeof projectDefaults;
  projectsCatalog: typeof projectsCatalog;
  rbac: typeof rbac;
  scripts: typeof scripts;
  seed: typeof seed;
  sessionSummaries: typeof sessionSummaries;
  sessions: typeof sessions;
  sync: typeof sync;
  tenantCrud: typeof tenantCrud;
  tenantGuard: typeof tenantGuard;
  userIdentities: typeof userIdentities;
  userProfiles: typeof userProfiles;
  vectors: typeof vectors;
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
