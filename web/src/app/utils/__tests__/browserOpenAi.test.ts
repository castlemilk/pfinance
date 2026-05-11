import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}

describe('browser OpenAI safety', () => {
  it('does not allow browser-side OpenAI API clients in app source', () => {
    const appDir = path.join(process.cwd(), 'src/app');
    const offenders = collectSourceFiles(appDir).filter((file) => {
      if (file.endsWith('browserOpenAi.test.ts')) return false;
      return readFileSync(file, 'utf8').includes('dangerouslyAllowBrowser');
    });

    expect(offenders).toEqual([]);
  });
});
