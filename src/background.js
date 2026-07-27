import { env, pipeline } from '@xenova/transformers';
import classifier from '../data/classifier.json';
import seedEmbeddings from '../data/seed-embeddings.json';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('wasm/');

let extractorPromise;
let seedPromise;
const scoreCache = new Map();

function normalizeVectors(value) {
  const vectors = value.tolist();
  if (Array.isArray(vectors[0]?.[0])) return vectors.map((item) => item[0]);
  return vectors;
}

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      'feature-extraction',
      'Xenova/bge-small-zh-v1.5',
      { quantized: true },
    );
  }
  return extractorPromise;
}

async function embed(texts, batchSize = 16) {
  const extractor = await getExtractor();
  const vectors = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const output = await extractor(
      texts.slice(start, start + batchSize),
      { pooling: 'mean', normalize: true },
    );
    vectors.push(...normalizeVectors(output));
  }
  return vectors;
}

function restoreVectors(rows) {
  return rows.map((row) => {
    const vector = row.map((value) => value / seedEmbeddings.scale);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / norm);
  });
}

async function getSeeds() {
  if (!seedPromise) {
    seedPromise = Promise.resolve({
      hostile: restoreVectors(seedEmbeddings.hostile),
      normal: restoreVectors(seedEmbeddings.normal),
    });
  }
  return seedPromise;
}

function dot(a, b) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += a[index] * b[index];
  return sum;
}

function topMean(vector, candidates, count = 3) {
  const ranked = candidates
    .map((candidate) => dot(vector, candidate))
    .sort((a, b) => b - a)
    .slice(0, count);
  return ranked.reduce((sum, value) => sum + value, 0) / ranked.length;
}

function vectorScore(vector, seeds) {
  let linearLogit = classifier.bias;
  for (let index = 0; index < vector.length; index += 1) {
    linearLogit += classifier.weights[index] * vector[index];
  }
  const linearProbability = 1 / (1 + Math.exp(-linearLogit));
  if (linearProbability <= 0.28 || linearProbability >= 0.82) {
    return {
      probability: linearProbability,
      linearProbability,
      neighborProbability: null,
      margin: null,
    };
  }

  const hostile = topMean(vector, seeds.hostile);
  const normal = topMean(vector, seeds.normal);
  const margin = hostile - normal;
  const neighborProbability = 1 / (1 + Math.exp(-12 * (margin - 0.015)));
  const probability = 0.75 * linearProbability + 0.25 * neighborProbability;
  return {
    probability,
    linearProbability,
    neighborProbability,
    margin,
  };
}

async function classify(items) {
  const seeds = await getSeeds();
  const uniqueTexts = [...new Set(items.flatMap((item) => item.texts))];
  const missingTexts = uniqueTexts.filter((text) => !scoreCache.has(text));
  if (missingTexts.length) {
    const vectors = await embed(missingTexts);
    missingTexts.forEach((text, index) => {
      scoreCache.set(text, vectorScore(vectors[index], seeds));
    });
    while (scoreCache.size > 2048) {
      scoreCache.delete(scoreCache.keys().next().value);
    }
  }
  return items.map((item) => {
    const scores = item.texts.map((text) => scoreCache.get(text));
    scores.sort((a, b) => b.probability - a.probability);
    return { id: item.id, ...scores[0] };
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'CLASSIFY') {
    classify(message.items)
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'WARMUP') {
    Promise.all([getExtractor(), getSeeds()])
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  return false;
});
