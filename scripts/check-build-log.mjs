#!/usr/bin/env node
/**
 * check-build-log.mjs — CI's "zero warnings" gate on `vite build` output.
 *
 *   node scripts/check-build-log.mjs build.log
 *
 * Exit 0: clean. Exit 1: the offending lines are printed. Exit 2: no log file.
 * File paths and asset names are dropped before matching, so a module called
 * AIErrorLine.tsx or a chunk called InlineAIError-xxxx.js is not an "error"
 * (2026-10-23: the old grep failed a clean build on exactly those names).
 * A Rollup/Vite plugin warning ("[plugin vite:esbuild] x.tsx: Duplicate key …")
 * fails too; vite:reporter's bare "[plugin vite:reporter]" line and its "(!) …
 * dynamically imported" notes do not, nor the known "(!) Some chunks are
 * larger" note (the OpenCC cn2t dictionary, loaded only for 繁).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const PROBLEM = /error|warning.*duplicate|warning.*unused|duplicate (?:key|case)/i;
/** "[plugin <name>]" followed by any message text (after paths are dropped). */
const PLUGIN_WARNING = /^\[plugin [^\]]+\]\s*\S/;
const FILE_EXT = 'js|mjs|cjs|jsx|ts|mts|cts|tsx|css|scss|html|json|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|wasm|bcmap|txt|xml|webmanifest|md';
/** A token that names a file: contains a path separator, or ends in a file extension (optionally :line:col). */
const PATH_TOKEN = new RegExp(`[/\\\\]|\\.(?:${FILE_EXT})(?::\\d+)*$`, 'i');

function stripPaths(line) {
  return line
    .split(/\s+/)
    .filter(token => !PATH_TOKEN.test(token.replace(/^["'`(\[]+|["'`)\],;:]+$/g, '')))
    .join(' ');
}

/** The lines of a build log that report an error, a duplicate/unused warning or a plugin warning. */
export function findBuildLogProblems(log) {
  const lines = log.replace(ANSI, '').split(/\r?\n/);
  if (lines.every(line => line.trim() === '')) return ['build log is empty'];
  return lines
    .filter(line => {
      const text = stripPaths(line.trim());
      return PROBLEM.test(text) || PLUGIN_WARNING.test(text);
    })
    .map(line => line.trim());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  let log;
  try {
    log = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`❌ Cannot read build log ${file}: ${err.message}`);
    process.exit(2);
  }
  const problems = findBuildLogProblems(log);
  if (problems.length > 0) {
    for (const line of problems) console.error(line);
    console.error('❌ Build has errors or warnings. Fix them before merging.');
    process.exit(1);
  }
  console.log('✅ Build log has no errors, duplicate or unused warnings.');
}
