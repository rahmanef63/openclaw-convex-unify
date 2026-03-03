#!/usr/bin/env node
const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isApply = args.includes('--apply');
const isExact = args.includes('--exact');
const tenantIdArg = args.find((a) => a.startsWith('--tenantId='));
const tenantId = tenantIdArg ? tenantIdArg.split('=')[1] : (process.env.APP_TENANT_ID || 'rahman-main');
const scanLimitArg = args.find((a) => a.startsWith('--scanLimit='));
const scanLimit = scanLimitArg ? Number(scanLimitArg.split('=')[1]) : 5000;
const maxUpdatesArg = args.find((a) => a.startsWith('--maxUpdates='));
const maxUpdates = maxUpdatesArg ? Number(maxUpdatesArg.split('=')[1]) : 500;
const pageSizeArg = args.find((a) => a.startsWith('--pageSize='));
const pageSize = pageSizeArg ? Number(pageSizeArg.split('=')[1]) : 500;

if (!isDryRun && !isApply) {
  console.error('Use --dry-run or --apply');
  process.exit(1);
}

function execConvex(fn, payload) {
  const argv = ['convex', 'run', fn, JSON.stringify(payload)];
  if (process.platform === 'win32') {
    return execFileSync('cmd', ['/c', 'npx', ...argv], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  }
  return execFileSync('npx', argv, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function run(fn, payload) {
  const out = execConvex(fn, payload);
  return JSON.parse(out);
}

function runSafe(fn, payload) {
  try {
    return { ok: true, data: run(fn, payload) };
  } catch (e) {
    const msg = ((e.stdout || '') + (e.stderr || '') || String(e)).slice(0, 240);
    return { ok: false, error: msg };
  }
}

function printHeader(mode) {
  console.log(`mode=${mode}${isExact ? '+exact' : ''} tenantId=${tenantId} scanLimit=${scanLimit} pageSize=${pageSize}${isApply ? ` maxUpdates=${maxUpdates}` : ''}`);
  console.log('table | scanned | null_before | updated | null_after | truncated | errors');
}

function printRow(r) {
  console.log(`${r.table} | ${r.scanned} | ${r.null_before} | ${r.updated} | ${r.null_after} | ${!!r.truncated} | ${r.errors ?? 0}`);
}

function combine(agg, r) {
  agg.scanned += r.scanned || 0;
  agg.null_before += r.null_before || 0;
  agg.updated += r.updated || 0;
  agg.errors += r.errors || 0;
  agg.null_after += r.null_after || 0;
  return agg;
}

try {
  const tables = run('backfill:listTables', {});
  printHeader(isDryRun ? 'dry-run' : 'apply');

  let totalUpdated = 0;
  let totalNullBefore = 0;
  let totalErrors = 0;

  for (const table of tables) {
    if (!isExact) {
      if (isDryRun) {
        const rr = runSafe('backfill:tableDryRun', { table, scanLimit });
        if (!rr.ok) {
          totalErrors += 1;
          printRow({ table, scanned: 0, null_before: 0, updated: 0, null_after: 0, truncated: false, errors: 1 });
          continue;
        }
        const r = rr.data;
        totalNullBefore += r.null_before;
        printRow(r);
        continue;
      }

      let agg = null;
      while (true) {
        const rr = runSafe('backfill:tableApplyBatch', { table, tenantId, scanLimit, maxUpdates });
        if (!rr.ok) {
          totalErrors += 1;
          agg = agg || { table, scanned: 0, null_before: 0, updated: 0, null_after: 0, truncated: false, errors: 1 };
          break;
        }
        const r = rr.data;
        if (!agg) agg = { ...r };
        else {
          agg.updated += r.updated;
          agg.errors += r.errors;
          agg.null_after = r.null_after;
          agg.scanned = r.scanned;
          agg.null_before = r.null_before;
          agg.truncated = r.truncated;
        }
        totalUpdated += r.updated;
        totalErrors += r.errors;
        if (r.errors > 0 || r.updated === 0 || r.updated < maxUpdates) break;
      }
      totalNullBefore += agg?.null_before ?? 0;
      printRow(agg || { table, scanned: 0, null_before: 0, updated: 0, null_after: 0, truncated: false, errors: 0 });
      if (totalErrors > 0) { console.error('STOPPED: error encountered (fail-safe)'); break; }
      continue;
    }

    let cursor = null;
    const agg = { table, scanned: 0, null_before: 0, updated: 0, null_after: 0, truncated: false, errors: 0 };
    while (true) {
      const payload = { table, paginationOpts: { numItems: pageSize, cursor } };
      const fn = isDryRun ? 'backfill:tableDryRunPage' : 'backfill:tableApplyPage';
      const rr = runSafe(fn, isApply ? { ...payload, tenantId, maxUpdates } : payload);
      if (!rr.ok) { agg.errors += 1; totalErrors += 1; break; }
      const r = rr.data;
      combine(agg, r);
      totalUpdated += r.updated || 0;
      totalErrors += r.errors || 0;
      cursor = r.continueCursor ?? null;
      if (r.errors > 0 || r.isDone) break;
    }
    totalNullBefore += agg.null_before;
    printRow(agg);
    if (totalErrors > 0) { console.error('STOPPED: error encountered (fail-safe)'); break; }
  }

  console.log(`total_null_before=${totalNullBefore}`);
  if (isApply) console.log(`total_updated=${totalUpdated} total_errors=${totalErrors}`);
  process.exit(totalErrors > 0 ? 1 : 0);
} catch (e) {
  const msg = (e.stdout || '') + (e.stderr || '') || String(e);
  console.error(msg);
  process.exit(1);
}
