#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const https = require('node:https');
const http = require('node:http');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isApply = args.includes('--apply');
const isExact = args.includes('--exact');
const noResume = args.includes('--no-resume');
const maxRetriesArg = args.find((a) => a.startsWith('--maxRetries='));
const maxRetries = maxRetriesArg ? Number(maxRetriesArg.split('=')[1]) : 3;
const tenantIdArg = args.find((a) => a.startsWith('--tenantId='));
const tenantId = tenantIdArg ? tenantIdArg.split('=')[1] : (process.env.APP_TENANT_ID || 'rahman-main');
const scanLimitArg = args.find((a) => a.startsWith('--scanLimit='));
const scanLimit = scanLimitArg ? Number(scanLimitArg.split('=')[1]) : 5000;
const maxUpdatesArg = args.find((a) => a.startsWith('--maxUpdates='));
const maxUpdates = maxUpdatesArg ? Number(maxUpdatesArg.split('=')[1]) : 500;
const pageSizeArg = args.find((a) => a.startsWith('--pageSize='));
const defaultPageSize = pageSizeArg ? Number(pageSizeArg.split('=')[1]) : null;
const stateFileArg = args.find((a) => a.startsWith('--stateFile='));
const stateFile = stateFileArg ? stateFileArg.split('=')[1] : path.join(process.cwd(), 'scripts', '.backfill_cursor_state.json');

const CONVEX_URL = process.env.CONVEX_SELF_HOSTED_URL || 'https://api.rahmanef.com';
const CONVEX_ADMIN_KEY = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || 'rahmanef-convex|01365a724e228c4bffd8f1e0bcc36f9ace8a551df04299000957a30162348e10bc2c820a4e';

if (!isDryRun && !isApply) {
  console.error('Use --dry-run or --apply');
  process.exit(1);
}

function httpCall(endpoint, fnPath, argsObj) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({ path: fnPath, args: argsObj }), 'utf8');
    const url = new URL(`${CONVEX_URL}/api/${endpoint}`);
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'Authorization': `Convex ${CONVEX_ADMIN_KEY}`,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 400)}`));
        }
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.status === 'success') return resolve(parsed.value);
          if (parsed && parsed.status === 'error') return reject(new Error(parsed.errorMessage || raw.slice(0, 400)));
          return resolve(parsed);
        } catch {
          resolve(raw);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('HTTP timeout 30s')); });
    req.write(body);
    req.end();
  });
}

async function httpRun(fn, argsObj, isMutation = false) {
  const endpoint = isMutation ? 'mutation' : 'query';
  return httpCall(endpoint, fn, argsObj);
}

function execConvex(fn, payload) {
  const argv = ['convex', 'run', fn, JSON.stringify(payload)];
  if (process.platform === 'win32') {
    return execFileSync('cmd', ['/c', 'npx', ...argv], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  }
  return execFileSync('npx', argv, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function runCli(fn, payload) {
  const out = execConvex(fn, payload);
  return JSON.parse(out);
}

function runCliSafe(fn, payload) {
  try {
    return { ok: true, data: runCli(fn, payload) };
  } catch (e) {
    const msg = ((e.stdout || '') + (e.stderr || '') || String(e)).slice(0, 900);
    return { ok: false, error: msg };
  }
}

function printHeader(mode) {
  console.log(`mode=${mode}${isExact ? '+exact' : ''} tenantId=${tenantId} scanLimit=${scanLimit} pageSize=${defaultPageSize ?? 'adaptive'}${isApply ? ` maxUpdates=${maxUpdates}` : ''} maxRetries=${maxRetries}`);
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

function defaultAdaptivePageSize(table) {
  if (defaultPageSize) return defaultPageSize;
  if (table === 'messages') return 25;
  if (table === 'fileVersions') return 50;
  return 200;
}

function readState() {
  if (noResume) return {};
  try {
    if (!fs.existsSync(stateFile)) return {};
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch { /* ignore */ }
}

function cursorShort(c) {
  if (!c) return 'null';
  const s = String(c);
  return s.length > 18 ? `${s.slice(0, 8)}...${s.slice(-8)}` : s;
}

async function processExactTable(table, state) {
  let cursor = state[table]?.cursor ?? null;
  let pageIndex = Number(state[table]?.pageIndex ?? 0);
  let basePageSize = Number(state[table]?.pageSize ?? defaultAdaptivePageSize(table));
  const isMutation = !isDryRun && isApply;
  const fn = isDryRun ? 'backfill:tableDryRunPage' : 'backfill:tableApplyPage';
  const agg = { table, scanned: 0, null_before: 0, updated: 0, null_after: 0, truncated: false, errors: 0 };

  while (true) {
    let attempt = 0;
    let pageSize = basePageSize;
    let success = false;
    let lastErr = null;
    let pageResult = null;

    while (attempt <= maxRetries) {
      try {
        const payload = { table, paginationOpts: { numItems: pageSize, cursor } };
        if (isApply) { payload.tenantId = tenantId; payload.maxUpdates = maxUpdates; }
        const result = await httpRun(fn, payload, isMutation);
        pageResult = result;
        success = true;
        break;
      } catch (e) {
        lastErr = String(e.message || e).slice(0, 500);
        console.error(`[retry] table=${table} page=${pageIndex + 1} cursor=${cursorShort(cursor)} attempt=${attempt + 1}/${maxRetries + 1} pageSize=${pageSize}`);
        console.error(`[error_signature] ${lastErr.split('\n')[0]}`);
        attempt += 1;
        pageSize = Math.max(5, Math.floor(pageSize / 2));
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    if (!success) {
      agg.errors += 1;
      state[table] = {
        cursor,
        pageIndex,
        pageSize: basePageSize,
        at: new Date().toISOString(),
        lastError: lastErr ? lastErr.slice(0, 500) : 'unknown',
      };
      writeState(state);
      return agg;
    }

    const r = pageResult;
    combine(agg, r);
    pageIndex += 1;
    cursor = r.continueCursor ?? null;

    state[table] = { cursor, pageIndex, pageSize: basePageSize, at: new Date().toISOString() };
    writeState(state);

    if (r.errors > 0) {
      console.error(`[error_signature] table=${table} page=${pageIndex} cursor=${cursorShort(cursor)} mutation_errors=${r.errors}`);
      agg.errors += 1;
      return agg;
    }

    if (r.isDone) {
      delete state[table];
      writeState(state);
      return agg;
    }
  }
}

async function main() {
  const tables = runCli('backfill:listTables', {});
  const state = readState();
  printHeader(isDryRun ? 'dry-run' : 'apply');

  let totalUpdated = 0;
  let totalNullBefore = 0;
  let totalErrors = 0;

  for (const table of tables) {
    if (!isExact) {
      if (isDryRun) {
        const rr = runCliSafe('backfill:tableDryRun', { table, scanLimit });
        if (!rr.ok) {
          totalErrors += 1;
          printRow({ table, scanned: 0, null_before: 0, updated: 0, null_after: 0, truncated: false, errors: 1 });
          console.error(`[error_signature] table=${table} error=${rr.error.split('\n')[0]}`);
          continue;
        }
        totalNullBefore += rr.data.null_before;
        printRow(rr.data);
        continue;
      }
      let agg = null;
      while (true) {
        const rr = runCliSafe('backfill:tableApplyBatch', { table, tenantId, scanLimit, maxUpdates });
        if (!rr.ok) {
          totalErrors += 1;
          agg = agg || { table, scanned: 0, null_before: 0, updated: 0, null_after: 0, truncated: false, errors: 1 };
          break;
        }
        const r = rr.data;
        if (!agg) agg = { ...r };
        else { agg.updated += r.updated; agg.errors += r.errors; agg.null_after = r.null_after; }
        totalUpdated += r.updated;
        totalErrors += r.errors;
        if (r.errors > 0 || r.updated === 0 || r.updated < maxUpdates) break;
      }
      totalNullBefore += agg?.null_before ?? 0;
      printRow(agg || { table, scanned: 0, null_before: 0, updated: 0, null_after: 0, truncated: false, errors: 0 });
      if (totalErrors > 0) { console.error('STOPPED: error encountered (fail-safe)'); break; }
      continue;
    }

    // exact mode with HTTP
    const agg = await processExactTable(table, state);
    totalNullBefore += agg.null_before;
    totalUpdated += agg.updated;
    totalErrors += agg.errors;
    printRow(agg);
    if (totalErrors > 0) { console.error('STOPPED: error encountered (fail-safe)'); break; }
  }

  console.log(`total_null_before=${totalNullBefore}`);
  if (isApply) console.log(`total_updated=${totalUpdated} total_errors=${totalErrors}`);
  console.log(`state_file=${stateFile}`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
