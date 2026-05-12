import { existsSync, readFileSync } from 'fs';
import path from 'path';

const webRoot = process.cwd();
const repoRoot = path.resolve(webRoot, '..');
const packageJsonPath = path.join(webRoot, 'package.json');
const prebuiltScriptPath = path.join(repoRoot, 'scripts/deploy-vercel-prebuilt.sh');

function readIfExists(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

describe('Vercel prebuilt deployment', () => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    scripts: Record<string, string>;
  };
  const prebuiltScript = readIfExists(prebuiltScriptPath);

  it('routes the frontend deploy command through the prebuilt Vercel helper', () => {
    expect(packageJson.scripts.deploy).toBe('npm run deploy:vercel:prebuilt');
    expect(packageJson.scripts['deploy:vercel:prebuilt']).toBe('../scripts/deploy-vercel-prebuilt.sh');
  });

  it('builds locally before deploying prebuilt output to production', () => {
    expect(existsSync(prebuiltScriptPath)).toBe(true);
    expect(prebuiltScript).toContain('vercel pull');
    expect(prebuiltScript).toContain('--environment=production');
    expect(prebuiltScript).toContain('vercel build');
    expect(prebuiltScript).toContain('--prod');
    expect(prebuiltScript).toContain('vercel deploy');
    expect(prebuiltScript).toContain('--prebuilt');
    expect(prebuiltScript).toContain('--archive=tgz');
  });
});
