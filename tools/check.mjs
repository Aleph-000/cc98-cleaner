import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'dist', 'manifest.json'), 'utf8'));
const popupHtml = await readFile(path.join(root, 'dist', 'popup.html'), 'utf8');
const popupJs = await readFile(path.join(root, 'dist', 'popup.js'), 'utf8');
const contentJs = await readFile(path.join(root, 'dist', 'content.js'), 'utf8');
const contentSource = await readFile(path.join(root, 'src', 'content.js'), 'utf8');
const backgroundJs = await readFile(path.join(root, 'dist', 'background.js'), 'utf8');
const pagePatchJs = await readFile(path.join(root, 'dist', 'page-patch.js'), 'utf8');
const boardCatalog = JSON.parse(await readFile(path.join(root, 'dist', 'board-catalog.json'), 'utf8'));
const localModel = path.join(
  root,
  'dist',
  'models',
  'Xenova',
  'bge-small-zh-v1.5',
  'onnx',
  'model_quantized.onnx',
);

if (manifest.manifest_version !== 3) throw new Error('manifest_version must be 3');
if (!manifest.background?.service_worker) throw new Error('background service worker missing');
if (manifest.host_permissions?.some((value) => !value.includes('cc98.org'))) {
  throw new Error('unexpected non-CC98 host permission');
}
if (!backgroundJs.includes('allowRemoteModels=!1') && !backgroundJs.includes('allowRemoteModels = false')) {
  throw new Error('remote model loading must be disabled');
}
if ((await stat(localModel)).size < 20_000_000) throw new Error('bundled local BGE model is missing or incomplete');
if (manifest.content_scripts?.length !== 2) throw new Error('expected two content scripts');
if (!popupHtml.includes('id="showHiddenNotice"')) throw new Error('hidden-comment notice setting missing');
if (!popupHtml.includes('id="filterThreshold"')) throw new Error('single filter threshold setting missing');
if (!popupHtml.includes('id="boardFilterEnabled"') || !popupHtml.includes('id="boardOptions"')) {
  throw new Error('board multi-select setting missing');
}
if (popupHtml.includes('id="foldThreshold"') || popupHtml.includes('id="hideThreshold"')) {
  throw new Error('legacy split thresholds must not be shown');
}
const noticeDefaultsOff = (source) => /showHiddenNotice\s*:\s*(?:false|!1)/.test(source);
if (!noticeDefaultsOff(popupJs)) throw new Error('hidden-comment notice must default to off');
if (!noticeDefaultsOff(contentJs)) throw new Error('content default must hide without a notice');
if (/cc98CleanerDecision\s*=\s*["']fold/.test(contentJs)) throw new Error('fold decision must be removed');
if (`${contentJs}${backgroundJs}`.includes('近似')) throw new Error('nearest-example text must not be exposed');
if (!/function scan\([^)]*\)\s*\{\s*hideNegativeRatings\(root\);\s*if \(!filterActive\) return;/.test(contentSource)) {
  throw new Error('negative ratings must be hidden before the board-specific comment filter');
}
if (!/filterActive = settings\.enabled && boardIsSelected\(\);\s*scan\(\);/.test(contentSource)) {
  throw new Error('global cleanup must scan even when the current board is not selected');
}
if (!/function isOpeningPost\(reply\)/.test(contentSource)
    || !/if \(isOpeningPost\(reply\)\)/.test(contentSource)
    || !/opening-post/.test(contentSource)) {
  throw new Error('topic opening post must bypass comment filtering');
}
const boards = boardCatalog.groups.flatMap((group) => group.boards);
if (!boards.some((board) => board.id === 68 && board.name === '学习天地')) {
  throw new Error('board catalog must include 学习天地 (68)');
}
if (new Set(boards.map((board) => board.id)).size !== boards.length) {
  throw new Error('board catalog contains duplicate IDs');
}
if (JSON.stringify(boardCatalog).match(/boardMasters|masters|topicCount|postCount|description/)) {
  throw new Error('board catalog contains unnecessary forum metadata');
}
if (!pagePatchJs.includes('cc98CleanerBoardId') || !contentJs.includes('selectedBoardIds')) {
  throw new Error('topic board detection is not wired to content filtering');
}

console.log('Manifest, default-hidden behavior, and privacy checks look valid.');
