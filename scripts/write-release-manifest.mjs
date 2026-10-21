import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export function releaseManifest(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('A full Git commit SHA is required');
  return { schemaVersion: 1, application: 'pfinance', commit: sha };
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const output = path.join(root, 'web/public/release.json');
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(releaseManifest(sha)) + '\n');
  console.log(`Release manifest: ${sha}`);
}
