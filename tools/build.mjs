import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'wasm'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'background.js')],
  outfile: path.join(dist, 'background.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome109', 'edge109'],
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  sourcemap: false,
});

await build({
  entryPoints: [path.join(root, 'src', 'content.js')],
  outfile: path.join(dist, 'content.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome109', 'edge109'],
  minify: true,
});

for (const name of ['manifest.json']) {
  await cp(path.join(root, name), path.join(dist, name));
}
for (const name of ['page-patch.js', 'content.css', 'popup.html', 'popup.css', 'popup.js']) {
  await cp(path.join(root, 'src', name), path.join(dist, name));
}
await cp(
  path.join(root, 'data', 'board-catalog.json'),
  path.join(dist, 'board-catalog.json'),
);
await cp(path.join(root, 'models'), path.join(dist, 'models'), { recursive: true });

await cp(
  path.join(root, 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd.wasm'),
  path.join(dist, 'wasm', 'ort-wasm-simd.wasm'),
);

const manifestPath = path.join(dist, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Built extension: ${dist}`);
