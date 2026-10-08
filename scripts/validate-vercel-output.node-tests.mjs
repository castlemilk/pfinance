import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateOutput } from './validate-vercel-output.mjs';

test('rejects unresolved sensitive values in a static browser bundle without exposing contents', t => {
  const { root, fn } = fixture(t);
  fs.rmSync(path.dirname(fn), { recursive: true });
  const bundle = path.join(root, 'static', 'app.js');
  fs.mkdirSync(path.dirname(bundle), { recursive: true });
  fs.writeFileSync(bundle, 'const config = "[SENSITIVE]"; const adjacent = "private-fixture-value";');
  assert.throws(() => validateOutput(root), error => {
    assert.match(error.message, /unresolved sensitive placeholder/);
    assert.ok(!error.message.includes('private-fixture-value'));
    return true;
  });
});
test('rejects unresolved sensitive values in server output', t => {
  const { root, fn } = fixture(t);
  fs.writeFileSync(path.join(fn, 'server.js'), 'const config = "[SENSITIVE]";');
  assert.throws(() => validateOutput(root), /unresolved sensitive placeholder/);
});
test('rejects unresolved sensitive values in edge output', t => {
  const { root, fn } = fixture(t);
  fs.writeFileSync(path.join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'edge' }));
  fs.writeFileSync(path.join(fn, 'edge.js'), 'const config = "[SENSITIVE]";');
  assert.throws(() => validateOutput(root), /unresolved sensitive placeholder/);
});
test('checks unresolved sensitive values reached through tracing symlinks', t => {
  const { root, fn } = fixture(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'traced-config-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  fs.writeFileSync(path.join(external, 'config.js'), 'const config = "[SENSITIVE]";');
  fs.symlinkSync(external, path.join(fn, 'node_modules'));
  assert.throws(() => validateOutput(root), /unresolved sensitive placeholder/);
});
test('rejects a sensitive placeholder spanning a read boundary', t => {
  const { root, fn } = fixture(t);
  fs.writeFileSync(path.join(fn, 'server.js'), 'x'.repeat(65533) + '[SENSITIVE]' + 'x'.repeat(65536));
  assert.throws(() => validateOutput(root), /unresolved sensitive placeholder/);
});
test('accepts large output with resolved configuration', t => {
  const { root, fn } = fixture(t);
  fs.writeFileSync(path.join(fn, 'server.js'), 'x'.repeat(131072) + 'https://config.example.test');
  assert.equal(validateOutput(root).functions, 1);
});

function fixture(t, architecture) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prebuilt-output-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'config.json'), '{"version":3}');
  const fn = path.join(root, 'functions', 'api.func');
  fs.mkdirSync(fn, { recursive: true });
  fs.writeFileSync(path.join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', architecture }));
  return { root, fn };
}
function elf(machine) {
  const header = Buffer.alloc(20);
  header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
  header.writeUInt16LE(machine, 18);
  return header;
}
test('static output needs no native host architecture', t => {
  const { root, fn } = fixture(t);
  fs.rmSync(path.dirname(fn), { recursive: true });
  assert.deepEqual(validateOutput(root), { functions: 0, nativeBinaries: 0 });
});
for (const [architecture, machine] of [['x86_64', 62], ['arm64', 183], [undefined, 62]]) {
  test(`accepts matching Linux native code for ${architecture || 'default'}`, t => {
    const { root, fn } = fixture(t, architecture);
    fs.writeFileSync(path.join(fn, 'addon.node'), elf(machine));
    assert.equal(validateOutput(root).nativeBinaries, 1);
  });
}
test('rejects ARM64 native code for default x86_64 function', t => {
  const { root, fn } = fixture(t);
  fs.writeFileSync(path.join(fn, 'addon.node'), elf(183));
  assert.throws(() => validateOutput(root), /does not match/);
});
test('rejects Darwin native code', t => {
  const { root, fn } = fixture(t);
  fs.writeFileSync(path.join(fn, 'addon.node'), Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
  assert.throws(() => validateOutput(root), /Non-Linux/);
});
test('rejects malformed native addon', t => {
  const { root, fn } = fixture(t);
  fs.writeFileSync(path.join(fn, 'addon.node'), 'not native');
  assert.throws(() => validateOutput(root), /Non-Linux/);
});
test('checks native code reached through external tracing symlinks', t => {
  const { root, fn } = fixture(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'traced-native-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  fs.writeFileSync(path.join(external, 'addon.node'), elf(183));
  fs.symlinkSync(external, path.join(fn, 'node_modules'));
  assert.throws(() => validateOutput(root), /does not match/);
});
test('rejects env file without reading or printing its value', t => {
  const { root, fn } = fixture(t);
  fs.writeFileSync(path.join(fn, '.env.production.local'), 'PRIVATE_VALUE=do-not-print');
  assert.throws(() => validateOutput(root), /Refusing secret/);
});
test('rejects env file disguised by symlink', t => {
  const { root, fn } = fixture(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'private-env-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  fs.writeFileSync(path.join(external, '.env.local'), 'PRIVATE_VALUE=do-not-print');
  fs.symlinkSync(path.join(external, '.env.local'), path.join(fn, 'credentials'));
  assert.throws(() => validateOutput(root), /environment symlink/);
});
test('rejects broken tracing symlink', t => {
  const { root, fn } = fixture(t);
  fs.symlinkSync('/missing/native-module', path.join(fn, 'addon.node'));
  assert.throws(() => validateOutput(root), /ENOENT/);
});
test('handles cyclic directory symlinks', t => {
  const { root, fn } = fixture(t);
  fs.symlinkSync(fn, path.join(fn, 'again'));
  assert.equal(validateOutput(root).functions, 1);
});
test('rejects unsupported output version', t => {
  const { root } = fixture(t);
  fs.writeFileSync(path.join(root, 'config.json'), '{"version":2}');
  assert.throws(() => validateOutput(root), /version 3/);
});

test('CLI validation runs when invoked through a symlink', t => {
  const { root, fn } = fixture(t);
  fs.writeFileSync(path.join(fn, 'bad.node'), 'not Linux');
  const link = path.join(root, 'validator.mjs');
  fs.symlinkSync(fileURLToPath(new URL('./validate-vercel-output.mjs', import.meta.url)), link);
  const result = spawnSync(process.execPath, [link, root], {encoding:'utf8'});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Non-Linux/);
});
