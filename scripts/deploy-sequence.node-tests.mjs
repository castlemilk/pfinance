import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = path.dirname(fileURLToPath(import.meta.url));
// preview-fixture.sh is replaced when installing this fixture in a repository.
const nested = '';
const workflow = fs.readFileSync(path.join(source, '../.github/workflows/preview-deploy.yml'), 'utf8');
const section = workflow.split('      - name: Deploy to Vercel')[1].split('      - name: Comment PR')[0];
const commands = section.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n').replace(/\$\{\{ github.event.pull_request.number \}\}/g, '123').replace(/\$\{\{ env.PREVIEW_DOMAIN \}\}/g, 'preview.fixture.test');
const modes = [{target: 'preview', args: []}, {target: 'production', args: []}];

function run(mode, failure = '') {
  const helper = mode.target === 'production' ? 'deploy-vercel-prebuilt.sh' : 'preview-fixture.sh';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vercel-sequence-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    for (const file of [helper, 'validate-vercel-output.mjs']) {
      if (file === 'preview-fixture.sh') fs.writeFileSync(path.join(root, 'scripts', file), commands);
      else fs.copyFileSync(path.join(source, file), path.join(root, 'scripts', file));
    }
    fs.mkdirSync(path.join(root, 'web'));
    const cwd = path.join(root, nested);
    fs.mkdirSync(path.join(cwd, '.vercel'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.vercel/project.json'), JSON.stringify({ orgId: 'team_fixture', projectId: 'prj_fixture' }));
    if (failure === 'missing-binding') fs.unlinkSync(path.join(cwd, '.vercel/project.json'));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'vercel'), `#!${process.execPath}
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
const verb = args.find(a => ['project', 'pull', 'build', 'deploy', 'alias'].includes(a));
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({verb, args, token: !!process.env.VERCEL_TOKEN}) + '\\n');
if (args.some(a => a.includes(process.env.TEST_TOKEN))) process.exit(91);
if (process.env.FAILURE === verb) process.exit(42);
if (verb === 'project') process.exit(0);
if (verb === 'pull') {
  fs.mkdirSync('.vercel', {recursive:true});
  fs.writeFileSync('.vercel/project.json', JSON.stringify({orgId:'team_fixture', projectId:process.env.FAILURE==='binding' ? 'prj_wrong' : 'prj_fixture'}));
  const target = args.includes('--environment=production') ? 'production' : 'preview';
  fs.writeFileSync('.vercel/.env.'+target+'.local', 'TEST_ONLY=true');
}
if (verb === 'build') {
  fs.mkdirSync('.vercel/output', {recursive:true});
  fs.writeFileSync('.vercel/output/config.json', '{"version":3}');
  if (process.env.FAILURE === 'native') {
    fs.mkdirSync('.vercel/output/functions/api.func', {recursive:true});
    fs.writeFileSync('.vercel/output/functions/api.func/.vc-config.json', '{"runtime":"nodejs24.x"}');
    fs.writeFileSync('.vercel/output/functions/api.func/bad.node', 'not-a-linux-library');
  }
}
if (verb === 'deploy') {
  if (process.env.FAILURE === 'json') console.log('not json');
  else if (args.includes('--format=json')) console.log(JSON.stringify({status:'ok', deployment:{readyState:process.env.FAILURE==='state'?'ERROR':'READY',url:'https://fixture.vercel.app'}}));
  else console.log('https://fixture.vercel.app');
}
`);
    for (const [name, body] of Object.entries({npx: 'exec vercel "$@"', npm: 'exit 0', sleep: 'exit 0', curl: 'case "$*" in *http_code*) printf 200;; *) printf fixture-page;; esac'})) {
      fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`);
    }
    for (const name of fs.readdirSync(bin)) fs.chmodSync(path.join(bin, name), 0o755);
    const log = path.join(root, 'calls.jsonl');
    const result = spawnSync('bash', [path.join(root, 'scripts', helper), ...mode.args], {
      cwd: root, encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`, CALL_LOG:log,
        VERCEL_ORG_ID:'team_fixture', VERCEL_PROJECT_ID:'prj_fixture', VERCEL_TOKEN:'unit-only-token', TEST_TOKEN:'unit-only-token',
        VERCEL_GIT_BRANCH:'feature/a', PR_BRANCH:'feature/a', BACKEND_URL:'https://api.fixture.test', GEMINI_API_KEY:'unit-only-token', OPENAI_API_KEY:'unit-only-token', GITHUB_OUTPUT:path.join(root,'github-output'), FAILURE:failure},
    });
    const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s)) : [];
    const caches = ['production','preview'].filter(t => fs.existsSync(path.join(cwd, `.vercel/.env.${t}.local`)));
    return {result, calls, caches};
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
}

for (const mode of modes) {
  test(`${mode.target}: pull, one build, then compressed prebuilt upload`, () => {
    const {result, calls, caches} = run(mode);
    assert.equal(result.status, 0, result.stderr);
    const pull = calls.find(c => c.verb === 'pull');
    const build = calls.filter(c => c.verb === 'build');
    const deploy = calls.find(c => c.verb === 'deploy');
    assert.ok(pull.args.includes(`--environment=${mode.target}`));
    assert.equal(build.length, 1);
    assert.ok(calls.indexOf(pull) < calls.indexOf(build[0]));
    assert.ok(calls.indexOf(build[0]) < calls.indexOf(deploy));
    assert.ok(deploy.args.includes('--prebuilt'));
    assert.ok(deploy.args.includes('--archive=tgz'));
    assert.equal(deploy.args.includes('--prod'), mode.target === 'production');
    assert.equal(build[0].args.includes('--prod'), mode.target === 'production');
    if (mode.target === 'preview') assert.ok(pull.args.some(a => a.startsWith('--git-branch=')));
    assert.deepEqual(caches, []);
    assert.ok(!result.stdout.includes('unit-only-token'));
  });
  for (const failure of ['pull', 'build', 'native', 'deploy']) {
    test(`${mode.target}: ${failure} failure stops release`, () => {
      const {result, calls, caches} = run(mode, failure);
      assert.notEqual(result.status, 0);
      assert.ok(!calls.some(c => c.verb === 'alias'));
      if (failure !== 'deploy') assert.ok(!calls.some(c => c.verb === 'deploy'));
      assert.deepEqual(caches, []);
    });
  }
}
{
  for (const failure of ['json','state']) test(`reject ${failure} mismatch`, () => {
    const {result, calls} = run(modes[0], failure);
    assert.notEqual(result.status, 0);
    assert.ok(!calls.some(c => c.verb === 'alias'));
  });
}
test('local production: missing binding cannot auto-link or create a project', () => {
  const { result, calls } = run(modes[1], 'missing-binding');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing.*binding/i);
  assert.deepEqual(calls, []);
});
test('local production: project rebinding during pull stops before build', () => {
  const { result, calls, caches } = run(modes[1], 'binding');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /binding changed/);
  assert.ok(!calls.some(c => ['build', 'deploy'].includes(c.verb)));
  assert.deepEqual(caches, []);
});
