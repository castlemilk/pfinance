import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseManifest } from './write-release-manifest.mjs';
import { verifyProduction } from './verify-production.mjs';
const sha = 'a'.repeat(40);
function responses({ stale = false, status = 200, missing = false, wrongType = false } = {}) {
  return async url => new Response(url.pathname === '/release.json' ? JSON.stringify(releaseManifest(stale ? 'b'.repeat(40) : sha)) : missing ? 'error page' : 'PFinance Super growth calculator', { status, headers: { 'content-type': wrongType ? 'application/json' : 'text/html' } });
}
test('manifest requires exact full source identity', () => {
  assert.equal(releaseManifest(sha).commit, sha);
  for (const value of ['', 'main', 'abc123', 'a'.repeat(41)]) assert.throws(() => releaseManifest(value));
});
test('passes only matching release and both public pages', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return responses()(url); };
  assert.equal((await verifyProduction({ expectedSha: sha, fetchImpl })).status, 'passed');
  assert.equal(calls.length, 3);
  assert.ok(calls.slice(1).every(c => c.url.pathname.endsWith('/')), 'public HTML checks must use canonical trailing-slash URLs without redirects');
  assert.ok(calls.every(c => c.url.origin === 'https://pfinance.dev' && c.options.redirect === 'error' && !c.options.method && !c.options.headers.Authorization));
});
for (const [name, config] of [['stale release', { stale: true }], ['HTTP error', { status: 500 }], ['missing content', { missing: true }], ['wrong type', { wrongType: true }]]) {
  test(`fails closed for ${name}`, async () => { await assert.rejects(verifyProduction({ expectedSha: sha, fetchImpl: responses(config), attempts: 1 })); });
}
test('allows bounded propagation retry', async () => {
  let calls = 0, waits = 0;
  const result = await verifyProduction({ expectedSha: sha, fetchImpl: async url => responses({ stale: ++calls === 1 })(url), wait: async () => waits++ });
  assert.equal(result.attempt, 2); assert.equal(waits, 1);
});
test('does not retry access denials or follow redirects', async () => {
  let waits = 0;
  await assert.rejects(verifyProduction({ expectedSha: sha, fetchImpl: responses({ status: 403 }), wait: async () => waits++ }), /403/);
  assert.equal(waits, 0);
  await assert.rejects(verifyProduction({ expectedSha: sha, fetchImpl: async () => { throw Error('redirect blocked'); }, attempts: 1 }), /redirect/);
});
test('rejects missing commit before contacting production', async () => {
  await assert.rejects(verifyProduction({ fetchImpl: () => { throw Error('must not call'); } }), /expected commit/);
});

test('no GitHub workflow provisions or deletes hosted resources', async () => {
  // CI/CD runs on Cuttlefish; hosted previews were removed. A workflow file
  // here would also run on Cuttlefish's GitHub Actions compatibility layer.
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../.github/workflows/', import.meta.url);
  for (const name of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    const source = readFileSync(new URL(name, dir), 'utf8');
    assert.doesNotMatch(source, /gcloud run (deploy|services delete)|vercel (deploy|alias|remove)|ko build/, `${name} must not deploy`);
  }
  const pkg = JSON.parse(readFileSync(new URL('../web/package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.prebuild, 'node ../scripts/write-release-manifest.mjs');
});
