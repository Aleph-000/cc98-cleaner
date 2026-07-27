const DEFAULTS = {
  enabled: true,
  modelEnabled: true,
  filterThreshold: 0.56,
  hideNegativeRatings: true,
  showHiddenNotice: false,
  boardFilterEnabled: false,
  selectedBoardIds: [68],
};

const ids = Object.keys(DEFAULTS).filter((id) => id !== 'selectedBoardIds');
const status = document.querySelector('#status');
let boardGroups = [];
let selectedBoardIds = new Set(DEFAULTS.selectedBoardIds);
let boardNames = new Map();

function renderThresholds() {
  document.querySelector('#filterValue').textContent = Number(document.querySelector('#filterThreshold').value).toFixed(2);
}

async function save() {
  const values = {};
  for (const id of ids) {
    const element = document.querySelector(`#${id}`);
    values[id] = element.type === 'checkbox' ? element.checked : Number(element.value);
  }
  values.selectedBoardIds = [...selectedBoardIds].sort((a, b) => a - b);
  await chrome.storage.sync.set(values);
  renderThresholds();
  renderBoardSummary();
  status.textContent = '已保存；刷新 CC98 页面后生效。';
}

function renderBoardSummary() {
  const names = [...selectedBoardIds].map((id) => boardNames.get(id)).filter(Boolean);
  const suffix = names.length <= 2 ? names.join('、') : `${names.slice(0, 2).join('、')}等`;
  document.querySelector('#boardSummary').textContent = names.length
    ? `已选 ${names.length} 个版面：${suffix}`
    : '选择版面（当前未选择）';
}

function renderBoardOptions(query = '') {
  const root = document.querySelector('#boardOptions');
  const keyword = query.trim().toLocaleLowerCase('zh-CN');
  root.replaceChildren();
  let count = 0;
  for (const group of boardGroups) {
    const boards = group.boards.filter((board) => (
      !keyword || board.name.toLocaleLowerCase('zh-CN').includes(keyword) || String(board.id).includes(keyword)
    ));
    if (!boards.length) continue;
    const title = document.createElement('div');
    title.className = 'board-group';
    title.textContent = group.name;
    root.appendChild(title);
    for (const board of boards) {
      count += 1;
      const label = document.createElement('label');
      label.className = 'board-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedBoardIds.has(board.id);
      checkbox.addEventListener('change', async () => {
        if (checkbox.checked) selectedBoardIds.add(board.id);
        else selectedBoardIds.delete(board.id);
        await save();
      });
      label.append(checkbox, ` ${board.name}`);
      root.appendChild(label);
    }
  }
  if (!count) {
    const empty = document.createElement('div');
    empty.className = 'board-empty';
    empty.textContent = '没有匹配的版面';
    root.appendChild(empty);
  }
  renderBoardSummary();
}

async function init() {
  const stored = await chrome.storage.sync.get(null);
  const values = {
    ...DEFAULTS,
    ...stored,
    filterThreshold: Number.isFinite(stored.filterThreshold)
      ? stored.filterThreshold
      : (Number.isFinite(stored.foldThreshold) ? stored.foldThreshold : DEFAULTS.filterThreshold),
    selectedBoardIds: Array.isArray(stored.selectedBoardIds)
      ? stored.selectedBoardIds.map(Number).filter(Number.isInteger)
      : DEFAULTS.selectedBoardIds,
  };
  selectedBoardIds = new Set(values.selectedBoardIds);
  await chrome.storage.sync.set({ filterThreshold: values.filterThreshold });
  await chrome.storage.sync.remove(['foldThreshold', 'hideThreshold']);
  for (const id of ids) {
    const element = document.querySelector(`#${id}`);
    if (element.type === 'checkbox') element.checked = values[id];
    else element.value = values[id];
    element.addEventListener('input', save);
  }
  try {
    const response = await fetch(chrome.runtime.getURL('board-catalog.json'));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    boardGroups = (await response.json()).groups || [];
    boardNames = new Map(boardGroups.flatMap((group) => group.boards.map((board) => [board.id, board.name])));
    renderBoardOptions();
  } catch (error) {
    status.textContent = `版面列表加载失败：${error.message}`;
  }
  document.querySelector('#boardSearch').addEventListener('input', (event) => {
    renderBoardOptions(event.target.value);
  });
  renderThresholds();
  document.querySelector('#resetOverrides').addEventListener('click', async () => {
    await chrome.storage.local.set({ overrides: {} });
    status.textContent = '已清除人工保留记录。';
  });
}

init();
