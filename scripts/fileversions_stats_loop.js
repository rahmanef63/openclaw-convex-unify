#!/usr/bin/env node
/*
Client-driven pagination loop for admin:getFileVersionStatsPage

Usage examples:
  node scripts/fileversions_stats_loop.js --maxItems 5000 --pageSize 500
  node scripts/fileversions_stats_loop.js --untilDone --pageSize 500
  node scripts/fileversions_stats_loop.js --untilDone --out ./out/fileversions_stats_summary.json
*/

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  return args[i + 1] ?? def;
};

const untilDone = hasFlag('untilDone');
const maxItems = Number(getArg('maxItems', 5000));
const pageSize = Number(getArg('pageSize', 500));
const outPath = getArg('out', './out/fileversions_stats_summary.json');

let cursor = null;
let totalCounted = 0;
let latestTimestamp = 0;
let pages = 0;
let done = false;

while (!done && (untilDone || totalCounted < maxItems)) {
  const remaining = untilDone ? pageSize : Math.min(pageSize, maxItems - totalCounted);
  if (remaining <= 0) break;

  const payload = {
    pageSize: remaining,
    ...(cursor ? { cursor } : {}),
  };

  const cmd = `npx convex run admin:getFileVersionStatsPage '${JSON.stringify(payload)}'`;
  const out = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const res = JSON.parse(out);

  pages += 1;
  totalCounted += Number(res.counted || 0);
  latestTimestamp = Math.max(latestTimestamp, Number(res.latestTimestampInPage || 0));

  done = !!res.isDone;
  cursor = res.nextCursor || null;

  if (!cursor && !done) {
    // Safety break if no cursor returned unexpectedly.
    break;
  }
}

const now = new Date().toISOString();
const result = {
  ok: true,
  timestamp: now,
  mode: untilDone ? 'untilDone' : 'maxItems',
  pageSize,
  maxItems: untilDone ? null : maxItems,
  pages,
  totalCounted,
  cappedByMaxItems: untilDone ? false : totalCounted >= maxItems,
  isDone: done,
  latestTimestamp,
};

const fullOutPath = path.resolve(outPath);
fs.mkdirSync(path.dirname(fullOutPath), { recursive: true });
fs.writeFileSync(fullOutPath, JSON.stringify(result, null, 2), 'utf-8');

console.log(JSON.stringify({ ...result, outFile: fullOutPath }, null, 2));
