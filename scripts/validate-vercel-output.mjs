#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Vercel's Build Output API defaults functions to x86_64. Validate the files
// that will be uploaded; never rewrite runtime architecture, read env files or
// log file contents. Pulled Secret values can be unresolved placeholders.
const SENSITIVE_PLACEHOLDER = Buffer.from('[SENSITIVE]');
function hasSensitivePlaceholder(filename) {
  const fd = fs.openSync(filename, 'r');
  const block = Buffer.alloc(65536);
  let tail = Buffer.alloc(0);
  try {
    let length;
    while ((length = fs.readSync(fd, block, 0, block.length, null)) > 0) {
      const chunk = Buffer.concat([tail, block.subarray(0, length)]);
      if (chunk.includes(SENSITIVE_PLACEHOLDER)) return true;
      tail = chunk.subarray(-SENSITIVE_PLACEHOLDER.length + 1);
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}
export function validateOutput(directory) {
  const root = path.resolve(directory);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
  if (config.version !== 3) throw new Error('Expected Build Output API version 3');
  let functions = 0;
  let natives = 0;
  const seen = new Set();
  function walk(filename, architecture) {
    const name = path.basename(filename);
    if (name === '.git' || name === '.env' || name.startsWith('.env.')) {
      throw new Error(`Refusing secret/source file in build output: ${filename}`);
    }
    const real = fs.realpathSync(filename); // Broken symlinks fail closed.
    const resolvedName = path.basename(real);
    if (resolvedName === '.git' || resolvedName === '.env' || resolvedName.startsWith('.env.')) {
      throw new Error(`Refusing environment symlink in build output: ${filename}`);
    }
    const stat = fs.statSync(real);
    const key = `${real}:${architecture || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (stat.isDirectory()) {
      const functionConfig = path.join(real, '.vc-config.json');
      if (name.endsWith('.func')) {
        const fn = JSON.parse(fs.readFileSync(functionConfig, 'utf8'));
        functions++;
        architecture = fn.runtime === 'edge' ? null : (fn.architecture || 'x86_64');
        if (architecture && !['x86_64', 'arm64'].includes(architecture)) {
          throw new Error(`Unsupported function architecture: ${filename}`);
        }
      }
      for (const child of fs.readdirSync(real)) walk(path.join(real, child), architecture);
      return;
    }
    if (!stat.isFile()) return;
    if (hasSensitivePlaceholder(real)) {
      throw new Error(`Refusing unresolved sensitive placeholder in build output: ${filename}`);
    }
    if (!architecture) return;
    const header = Buffer.alloc(20);
    const fd = fs.openSync(real, 'r');
    let length;
    try { length = fs.readSync(fd, header, 0, header.length, 0); }
    finally { fs.closeSync(fd); }
    const elf = length >= 20 && header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
    if (elf) {
      const machine = header[5] === 1 ? header.readUInt16LE(18) : header.readUInt16BE(18);
      const expected = architecture === 'x86_64' ? 62 : 183;
      if (header[4] !== 2 || machine !== expected) {
        throw new Error(`Native binary does not match ${architecture}: ${filename}`);
      }
      natives++;
    } else if (name.endsWith('.node') || (length >= 4 && [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(header.readUInt32BE(0)))) {
      throw new Error(`Non-Linux native binary in function: ${filename}`);
    }
  }
  walk(root, null);
  return { functions, nativeBinaries: natives };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(validateOutput(process.argv[2] || '.vercel/output')));
  } catch (error) {
    console.error(`Prebuilt validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
