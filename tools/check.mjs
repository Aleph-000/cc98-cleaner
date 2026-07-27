import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'dist', 'manifest.json'), 'utf8'));
const popupHtml = await readFile(path.join(root, 'dist', 'popup.html'), 'utf8');
const popupJs = await readFile(path.join(root, 'dist', 'popup.js'), 'utf8');
const contentJs = await readFile(path.join(root, 'dist', 'content.js'), 'utf8');
const backgroundJs = await readFile(path.join(root, 'dist', 'background.js'), 'utf8');

if (manifest.manifest_version !== 3) throw new Error('manifest_version must be 3');
if (!manifest.background?.service_worker) throw new Error('background service worker missing');
if (manifest.content_scripts?.length !== 2) throw new Error('expected two content scripts');
if (!popupHtml.includes('id="showHiddenNotice"')) throw new Error('hidden-comment notice setting missing');
if (!popupHtml.includes('id="filterThreshold"')) throw new Error('single filter threshold setting missing');
if (popupHtml.includes('id="foldThreshold"') || popupHtml.includes('id="hideThreshold"')) {
  throw new Error('legacy split thresholds must not be shown');
}
const noticeDefaultsOff = (source) => /showHiddenNotice\s*:\s*(?:false|!1)/.test(source);
if (!noticeDefaultsOff(popupJs)) throw new Error('hidden-comment notice must default to off');
if (!noticeDefaultsOff(contentJs)) throw new Error('content default must hide without a notice');
if (/cc98CleanerDecision\s*=\s*["']fold/.test(contentJs)) throw new Error('fold decision must be removed');
if (`${contentJs}${backgroundJs}`.includes('近似')) throw new Error('nearest-example text must not be exposed');

console.log('Manifest, default-hidden behavior, and privacy checks look valid.');
