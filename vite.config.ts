import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Files the service worker caches at install: the app shell. The rest is cached on first use. */
const SHELL = [/^index\.html$/, /^assets\//, /^mch-atlas\//, /^icons\//, /^manifest\.webmanifest$/, /^mch\/Image\/(Icons|Characters|Cryptids|BattleIcons|Materials)\//, /^mch\/Image\/CraftBackgrounds\/Base\/100\./];

/** Writes dist/sw.js from scripts/sw-template.js with the precache list and a content hash. */
function pwa(): Plugin {
  let outDir = 'dist';
  return {
    name: 'mcw-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js')
        .sort();
      const shell = files.filter((f) => SHELL.some((re) => re.test(f)));
      const hash = createHash('sha256');
      for (const f of shell) hash.update(f).update(readFileSync(join(outDir, f)));
      const precache = ['./', ...shell.filter((f) => f !== 'index.html')];
      const sw = readFileSync('scripts/sw-template.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(precache));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any sub-path (GitHub Pages, itch.io, static hosting).
  base: './',
  build: { assetsInlineLimit: 0 },
  plugins: [pwa()],
});
