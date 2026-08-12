import { analyzeRules, maskText, normalizeText, splitSentences } from './tone.js';

const DEFAULTS = {
  enabled: true,
  modelEnabled: true,
  filterThreshold: 0.56,
  hideNegativeRatings: true,
  showHiddenNotice: false,
  boardFilterEnabled: false,
  selectedBoardIds: [68],
};

let settings = { ...DEFAULTS };
let overrides = {};
let nextId = 1;
let flushTimer = null;
const queued = [];
const pending = new Map();
let filterActive = true;

function textKey(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function extractReplyText(reply) {
  const article = reply.querySelector('.reply-content .substance > article, .substance > article, article');
  if (!article) return '';
  const clone = article.cloneNode(true);
  clone.querySelectorAll('script, style, img, video, audio, .quote, blockquote').forEach((node) => node.remove());
  clone.querySelectorAll('span').forEach((span) => {
    if ((span.textContent || '').trim().startsWith('以下是引用')) {
      const quoteRow = span.parentElement;
      const quoteBox = quoteRow?.parentElement;
      (quoteBox || quoteRow || span).remove();
    }
  });
  return normalizeText(clone.textContent || '');
}

function createPlaceholder(reply, text, score, reason) {
  const placeholder = document.createElement('div');
  placeholder.className = 'cc98-cleaner-placeholder';
  placeholder.dataset.forReply = reply.dataset.cc98CleanerId;
  placeholder.innerHTML = `<strong>已隐藏疑似戾气评论</strong> <span class="cc98-cleaner-reason">${Math.round(score * 100)}% · ${reason}</span>`;

  const reveal = document.createElement('button');
  reveal.textContent = '查看原文';
  reveal.addEventListener('click', () => {
    reply.style.display = '';
    placeholder.remove();
  });

  const keep = document.createElement('button');
  keep.textContent = '以后保留';
  keep.addEventListener('click', async () => {
    overrides[textKey(text)] = 'keep';
    await chrome.storage.local.set({ overrides });
    reply.style.display = '';
    placeholder.remove();
  });

  placeholder.append(reveal, keep);
  reply.before(placeholder);
  reply.style.display = 'none';
}

function applyDecision(item, modelResult) {
  const { reply, text, rule } = item;
  if (!document.contains(reply) || reply.dataset.cc98CleanerDecision) return;
  const override = overrides[textKey(text)];
  if (override === 'keep') {
    reply.dataset.cc98CleanerDecision = 'keep';
    return;
  }

  const modelProbability = modelResult?.probability ?? 0;
  let finalProbability = Math.max(
    modelProbability,
    0.35 * rule.probability + 0.65 * modelProbability,
  );
  if (rule.hostileExact) finalProbability = Math.max(finalProbability, rule.probability);
  if (rule.probability >= 0.95) finalProbability = Math.max(finalProbability, 0.98);
  const reason = rule.reasons[0] || '本地语气模型';

  reply.dataset.cc98CleanerScore = finalProbability.toFixed(3);
  reply.dataset.cc98CleanerReason = reason;

  if (override === 'hide' || finalProbability >= settings.filterThreshold) {
    reply.dataset.cc98CleanerDecision = 'hide';
    if (settings.showHiddenNotice) createPlaceholder(reply, text, finalProbability, reason);
    else reply.style.display = 'none';
  } else {
    reply.dataset.cc98CleanerDecision = 'show';
  }
}

function modelTexts(text) {
  const unique = new Set([text]);
  const masked = maskText(text);
  if (masked !== text) unique.add(masked);

  if (text.length >= 80) {
    const ranked = splitSentences(text)
      .filter((part) => part !== text)
      .map((part) => ({ part, score: analyzeRules(part).probability }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    for (const { part } of ranked) unique.add(part);
  }
  return [...unique].slice(0, 4);
}

function queueModel(item) {
  queued.push({ id: item.id, texts: modelTexts(item.text) });
  pending.set(item.id, item);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushQueue, 180);
}

async function flushQueue() {
  const batch = queued.splice(0, 12);
  if (!batch.length) return;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'CLASSIFY', items: batch });
    if (!response?.ok) throw new Error(response?.error || '模型调用失败');
    for (const result of response.results) {
      const item = pending.get(result.id);
      pending.delete(result.id);
      if (item) applyDecision(item, result);
    }
  } catch (error) {
    for (const request of batch) {
      const item = pending.get(request.id);
      pending.delete(request.id);
      if (item) applyDecision(item, null);
    }
    showModelError(error);
  }

  if (queued.length) flushTimer = setTimeout(flushQueue, 50);
}

function showModelError(error) {
  if (document.querySelector('.cc98-cleaner-model-error')) return;
  const notice = document.createElement('div');
  notice.className = 'cc98-cleaner-model-error';
  notice.textContent = `CC98 Cleaner 向量模型暂不可用，已继续使用规则过滤：${error?.message || error}`;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 8000);
}

function processReply(reply) {
  if (!settings.enabled || !filterActive || reply.dataset.cc98CleanerQueued) return;
  const text = extractReplyText(reply);
  if (!text) return;

  reply.dataset.cc98CleanerQueued = '1';
  reply.dataset.cc98CleanerId = String(nextId);
  const item = { id: nextId, reply, text, rule: analyzeRules(text) };
  nextId += 1;

  const override = overrides[textKey(text)];
  if (override === 'keep') return applyDecision(item, null);
  if (override === 'hide') return applyDecision(item, { probability: 1 });

  if (!settings.modelEnabled || /^(?:bd|bdbd|cy|加油|围观|火钳刘明)[！!。.]*$/i.test(text)) {
    applyDecision(item, null);
    return;
  }
  if (item.rule.safeExact) {
    applyDecision(item, null);
    return;
  }
  if (item.rule.hostileExact || item.rule.probability >= 0.78) {
    applyDecision(item, { probability: item.rule.probability });
    return;
  }
  queueModel(item);
}

function hideNegativeRatings(root = document) {
  if (!settings.hideNegativeRatings) return;
  const grades = [
    ...(root.matches?.('.grades') ? [root] : []),
    ...(root.querySelectorAll?.('.grades') || []),
  ];
  grades.forEach((grade) => {
    if ((grade.textContent || '').trim() === '风评值 -1') {
      const row = grade.closest('.good.tagSize') || grade.parentElement;
      if (row) row.style.display = 'none';
    }
  });
}

function scan(root = document) {
  hideNegativeRatings(root);
  if (!filterActive) return;
  const replies = [
    ...(root.matches?.('div.reply') ? [root] : []),
    ...(root.querySelectorAll?.('div.reply') || []),
  ];
  replies.forEach(processReply);
}

function currentBoardId() {
  const value = Number(document.documentElement?.dataset.cc98CleanerBoardId);
  return Number.isInteger(value) ? value : null;
}

function boardIsSelected() {
  if (!settings.boardFilterEnabled) return true;
  const boardId = currentBoardId();
  return boardId !== null && settings.selectedBoardIds.includes(boardId);
}

function resetPageDecisions() {
  queued.length = 0;
  pending.clear();
  clearTimeout(flushTimer);
  document.querySelectorAll('.cc98-cleaner-placeholder').forEach((node) => node.remove());
  document.querySelectorAll('div.reply[data-cc98-cleaner-queued]').forEach((reply) => {
    reply.style.display = '';
    delete reply.dataset.cc98CleanerQueued;
    delete reply.dataset.cc98CleanerDecision;
    delete reply.dataset.cc98CleanerId;
    delete reply.dataset.cc98CleanerScore;
    delete reply.dataset.cc98CleanerReason;
  });
}

function updateBoardActivation() {
  const next = settings.enabled && boardIsSelected();
  if (next === filterActive) return;
  filterActive = next;
  if (filterActive) {
    scan();
    if (settings.modelEnabled) chrome.runtime.sendMessage({ type: 'WARMUP' }).catch(() => {});
  } else {
    resetPageDecisions();
  }
}

async function start() {
  const sync = await chrome.storage.sync.get(null);
  const legacyThreshold = Number.isFinite(sync.foldThreshold) ? sync.foldThreshold : DEFAULTS.filterThreshold;
  settings = {
    ...DEFAULTS,
    ...sync,
    filterThreshold: Number.isFinite(sync.filterThreshold) ? sync.filterThreshold : legacyThreshold,
    selectedBoardIds: Array.isArray(sync.selectedBoardIds)
      ? sync.selectedBoardIds.map(Number).filter(Number.isInteger)
      : DEFAULTS.selectedBoardIds,
  };
  const local = await chrome.storage.local.get({ overrides: {} });
  overrides = local.overrides || {};
  filterActive = settings.enabled && boardIsSelected();
  scan();
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        updateBoardActivation();
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      }
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-cc98-cleaner-board-id'],
  });
  document.addEventListener('cc98-cleaner-board-change', updateBoardActivation);
  if (filterActive && settings.modelEnabled) chrome.runtime.sendMessage({ type: 'WARMUP' }).catch(() => {});
}

start().catch(showModelError);
