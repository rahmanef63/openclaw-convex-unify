// Run seed script
// Usage: npx convex run seed:seedAll

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Action wrapper to call seed mutation
export const runSeed = internalAction({
  handler: async (ctx) => {
    const result = await ctx.runMutation(internal.seed.seedAll, {});
    console.log("Seed result:", JSON.stringify(result, null, 2));
    return result;
  },
});

// Check seed status
export const checkStatus = internalAction({
  handler: async (ctx) => {
    const result = await ctx.runMutation(internal.seed.getSeedStatus, {});
    console.log("Seed status:", JSON.stringify(result, null, 2));
    return result;
  },
});
