import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Public, read-only checks. Never submit forms, call AI/payment APIs or use bypass tokens.
export async function verifyProduction({ expectedSha, fetchImpl = fetch, attempts = 6, wait = delay }) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '')) throw new Error('A full expected commit SHA is required');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 6) throw new Error('Invalid attempt limit');
  const origin = 'https://pfinance.dev';
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const get = async (pathname) => {
        const url = new URL(pathname, origin);
        url.searchParams.set('release_check', expectedSha);
        const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
        if (response.status !== 200) throw new Error(`${pathname}: HTTP ${response.status}`);
        return response;
      };
      const manifest = await (await get('/release.json')).json();
      if (manifest.schemaVersion !== 1 || manifest.application !== 'pfinance' || manifest.commit !== expectedSha) {
        throw new Error('Production is not serving the expected release');
      }
      for (const [pathname, text] of [['/', 'PFinance'], ['/tools/super-calculator/', 'Super growth calculator']]) {
        const response = await get(pathname);
        if (!(response.headers.get('content-type') || '').includes('text/html')) throw new Error(`${pathname}: expected HTML`);
        if (!(await response.text()).includes(text)) throw new Error(`${pathname}: expected page content missing`);
      }
      return { status: 'passed', application: 'pfinance', commit: expectedSha, checks: ['release-identity', 'homepage', 'super-calculator'], attempt };
    } catch (error) {
      lastError = error;
      // Authentication/protection errors are not deployment propagation delays.
      if (/HTTP (401|403)/.test(error.message)) throw error;
      if (attempt < attempts) await wait(10000);
    }
  }
  throw lastError;
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await verifyProduction({ expectedSha: process.argv[2] }))); }
  catch (error) { console.error(JSON.stringify({ status: 'failed', error: error.message })); process.exitCode = 1; }
}
