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
    expect(prebuiltScript).toMatch(/cli\(\) \{ npx --yes vercel@\d+\.\d+\.\d+ /);
    expect(prebuiltScript).toContain('--non-interactive');
    expect(prebuiltScript).toContain('cli pull');
    expect(prebuiltScript).toContain('--environment=production');
    expect(prebuiltScript).toContain('prj_TakUttZsa4fdddSwfVp08YFfyAdF');
    expect(prebuiltScript).toContain('Vercel project binding must be document-analyser/pfinance');
    expect(prebuiltScript).toContain('rootDirectory:"web"');
    expect(prebuiltScript).toContain('cp .vercel/.env.production.local web/.env.production.local');
    expect(prebuiltScript).toContain('NEXT_PUBLIC_FIREBASE_API_KEY');
    expect(prebuiltScript).toContain('Public Firebase settings were not inlined');
    expect(prebuiltScript).toContain('cli build');
    expect(prebuiltScript).toContain('--prod');
    expect(prebuiltScript).toContain('cli deploy');
    expect(prebuiltScript).toContain('--prebuilt');
    expect(prebuiltScript).toContain('--archive=tgz');
    expect(prebuiltScript).toContain('PFINANCE_SKIP_DOMAIN');
    expect(prebuiltScript).toContain('--skip-domain');
  });
});
