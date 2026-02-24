#!/usr/bin/env node
'use strict';

/**
 * Kill any process listening on the API port, then start the server.
 * Ensures "npm start" works every time without EADDRINUSE.
 */

const path = require('path');
const { execSync, spawn } = require('child_process');

// Same .env resolution as config: repo root first, then api/ (so PORT is always correct)
const repoRoot = path.resolve(__dirname, '../..');
const apiDir = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(repoRoot, '.env') });
require('dotenv').config({ path: path.join(apiDir, '.env') }); // api/.env overrides

const port = process.env.PORT || 4001;

function killPort(p) {
  try {
    const out = execSync(`lsof -ti:${p}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const pids = out.trim().split(/\s+/).filter(Boolean);
    if (pids.length) {
      execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'inherit' });
      console.log(`[api] Killed process(es) on port ${p}: ${pids.join(', ')}`);
    }
  } catch (_) {
    // lsof exits non-zero when no process found
  }
}

killPort(port);

const child = spawn(process.execPath, [path.join(apiDir, 'dist/index.js')], {
  stdio: 'inherit',
  env: process.env,
  cwd: apiDir,
});

child.on('exit', (code, signal) => {
  process.exit(code != null ? code : signal ? 1 : 0);
});
