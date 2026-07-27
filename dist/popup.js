const DEFAULTS = {
  enabled: true,
  modelEnabled: true,
  filterThreshold: 0.56,
  hideNegativeRatings: true,
  showHiddenNotice: false,
};

const ids = Object.keys(DEFAULTS);
const status = document.querySelector('#status');

function renderThresholds() {
  document.querySelector('#filterValue').textContent = Number(document.querySelector('#filterThreshold').value).toFixed(2);
}

async function save() {
  const values = {};
  for (const id of ids) {
    const element = document.querySelector(`#${id}`);
    values[id] = element.type === 'checkbox' ? element.checked : Number(element.value);
  }
  await chrome.storage.sync.set(values);
  renderThresholds();
  status.textContent = '已保存；刷新 CC98 页面后生效。';
}

async function init() {
  const stored = await chrome.storage.sync.get(null);
  const values = {
    ...DEFAULTS,
    ...stored,
    filterThreshold: Number.isFinite(stored.filterThreshold)
      ? stored.filterThreshold
      : (Number.isFinite(stored.foldThreshold) ? stored.foldThreshold : DEFAULTS.filterThreshold),
  };
  await chrome.storage.sync.set({ filterThreshold: values.filterThreshold });
  await chrome.storage.sync.remove(['foldThreshold', 'hideThreshold']);
  for (const id of ids) {
    const element = document.querySelector(`#${id}`);
    if (element.type === 'checkbox') element.checked = values[id];
    else element.value = values[id];
    element.addEventListener('input', save);
  }
  renderThresholds();
  document.querySelector('#resetOverrides').addEventListener('click', async () => {
    await chrome.storage.local.set({ overrides: {} });
    status.textContent = '已清除人工保留记录。';
  });
}

init();
