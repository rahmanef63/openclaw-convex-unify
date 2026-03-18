#!/usr/bin/env node
const { execSync } = require('node:child_process');

function run(cmd) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || ''), code: e.status };
  }
}

const checks = [];

// 1) instance config
checks.push({
  module: 'tenantCrud',
  check: 'instanceConfig exists',
  result: run("npx convex run tenantCrud:getInstanceConfig '{}'"),
  expect: 'ok'
});

// 2) same tenant read should pass
checks.push({
  module: 'tenantCrud',
  check: 'same-tenant read',
  result: run("npx convex run tenantCrud:listItems '{\"tenantId\":\"rahman-main\"}'"),
  expect: 'pass'
});

// 3) cross tenant read should fail
checks.push({
  module: 'tenantCrud',
  check: 'cross-tenant read blocked',
  result: run("npx convex run tenantCrud:listItems '{\"tenantId\":\"tenant-test-b\"}'"),
  expect: 'FORBIDDEN'
});

// 4) cross tenant write should fail
checks.push({
  module: 'tenantCrud',
  check: 'cross-tenant write blocked',
  result: run("npx convex run tenantCrud:createItem '{\"tenantId\":\"tenant-test-b\",\"key\":\"verify-block\",\"value\":\"x\"}'"),
  expect: 'FORBIDDEN'
});

// 5) legacy paths disabled (strict-only)
checks.push({
  module: 'sessions',
  check: 'legacy upsert disabled',
  result: run("npx convex run sessions:upsert '{\"sessionKey\":\"legacy-test\"}'"),
  expect: 'LEGACY_PATH_DISABLED'
});
checks.push({
  module: 'workspace',
  check: 'legacy saveFile disabled',
  result: run("npx convex run workspace:saveFile '{\"path\":\"/tmp/x.md\",\"fileType\":\"md\",\"category\":\"test\",\"content\":\"x\"}'"),
  expect: 'LEGACY_PATH_DISABLED'
});
checks.push({
  module: 'agents',
  check: 'legacy registerAgent disabled',
  result: run("npx convex run agents:registerAgent '{\"agentId\":\"legacy\",\"name\":\"legacy\"}'"),
  expect: 'LEGACY_PATH_DISABLED'
});
checks.push({
  module: 'memories',
  check: 'legacy save disabled',
  result: run("npx convex run memories:save '{\"category\":\"fact\",\"key\":\"k\",\"value\":\"v\"}'"),
  expect: 'LEGACY_PATH_DISABLED'
});

function verdict(c) {
  if (c.expect === 'FORBIDDEN') return !c.result.ok && /FORBIDDEN/i.test(c.result.out);
  if (c.expect === 'LEGACY_PATH_DISABLED') return !c.result.ok && /LEGACY_PATH_DISABLED/i.test(c.result.out);
  return c.result.ok;
}

const rows = checks.map(c => ({
  module: c.module,
  check: c.check,
  status: verdict(c) ? 'PASS' : 'FAIL',
  detail: c.result.ok ? c.result.out.slice(0, 200) : c.result.out.slice(0, 200)
}));

const failed = rows.filter(r => r.status === 'FAIL').length;
console.log(JSON.stringify({
  ok: failed === 0,
  failed,
  rows
}, null, 2));

process.exit(failed === 0 ? 0 : 1);
