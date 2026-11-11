import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const { build } = createRequire(
  new URL('../apps/server/package.json', import.meta.url),
)('esbuild');
import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build'],
  {
    cwd: 'apps/web',
    env: { ...process.env, VITE_HOSTED: 'true' },
    stdio: 'inherit',
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync('dist/server', { recursive: true });
cpSync('apps/web/dist', 'dist/client', { recursive: true });
if (existsSync('.openai/hosting.json')) {
  mkdirSync('dist/.openai', { recursive: true });
  cpSync('.openai/hosting.json', 'dist/.openai/hosting.json');
}
await build({
  entryPoints: ['apps/server/src/hosted.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/server/index.js',
  minify: true,
});
