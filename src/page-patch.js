(function patchCc98Responses() {
  'use strict';

  const originalJson = Response.prototype.json;

  function shouldPatch(url) {
    return /\/topic\/new/i.test(url)
      || /\/topic\/\d+\/(?:hot-)?post/i.test(url)
      || /\/config\/index/i.test(url);
  }

  function isTopicMetadata(url) {
    return /\/topic\/\d+\/?(?:[?#].*)?$/i.test(url);
  }

  function publishBoardId(url, data) {
    if (!isTopicMetadata(url) || !Number.isInteger(data?.boardId)) return;
    const value = String(data.boardId);
    const publish = () => {
      if (!document.documentElement) return false;
      document.documentElement.dataset.cc98CleanerBoardId = value;
      document.dispatchEvent(new Event('cc98-cleaner-board-change'));
      return true;
    };
    if (!publish()) document.addEventListener('DOMContentLoaded', publish, { once: true });
  }

  function zeroDislikes(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    if (Object.prototype.hasOwnProperty.call(value, 'dislikeCount')) value.dislikeCount = 0;
    for (const child of Object.values(value)) zeroDislikes(child, seen);
    return value;
  }

  Response.prototype.json = function patchedJson() {
    return originalJson.call(this).then((data) => {
      const url = this.url || '';
      publishBoardId(url, data);
      if (shouldPatch(url)) zeroDislikes(data);
      return data;
    });
  };
})();
