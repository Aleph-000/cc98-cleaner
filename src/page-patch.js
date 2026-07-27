(function patchCc98Responses() {
  'use strict';

  const originalJson = Response.prototype.json;

  function shouldPatch(url) {
    return /\/topic\/new/i.test(url)
      || /\/topic\/\d+\/(?:hot-)?post/i.test(url)
      || /\/config\/index/i.test(url);
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
      if (shouldPatch(this.url || '')) zeroDislikes(data);
      return data;
    });
  };
})();
