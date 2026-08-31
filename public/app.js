const MODE_PATH = '/zh-cn/lol/modes/aram-mayhem';
const RANKED_PATH = '/zh-cn/lol/champions';
const GROUPS = [
  { key: 'silver', label: '银色', className: 'silver' },
  { key: 'gold', label: '黄金', className: 'gold' },
  { key: 'prismatic', label: '棱彩', className: 'prismatic' }
];
const TIER_FILTERS = [
  { key: 'all', label: '全部' },
  { key: '1', label: 'T1' },
  { key: '2', label: 'T2' },
  { key: '3', label: 'T3' },
  { key: '4', label: 'T4' },
  { key: '5', label: 'T5' },
  { key: 'unranked', label: '未排名' }
];
const RANKED_TIER_OPTIONS = [
  { key: 'all', label: '全部段位' },
  { key: 'challenger', label: '王者' },
  { key: 'grandmaster', label: '宗师' },
  { key: 'master_plus', label: '大师+' },
  { key: 'master', label: '大师' },
  { key: 'diamond_plus', label: '钻石+' },
  { key: 'diamond', label: '钻石' },
  { key: 'emerald_plus', label: '翡翠+' },
  { key: 'emerald', label: '翡翠' },
  { key: 'platinum_plus', label: '铂金+' },
  { key: 'platinum', label: '铂金' },
  { key: 'gold_plus', label: '黄金+' },
  { key: 'gold', label: '黄金' },
  { key: 'silver', label: '白银' },
  { key: 'bronze', label: '青铜' },
  { key: 'iron', label: '黑铁' }
];
const POSITION_OPTIONS = [
  { key: 'all', label: '全部分路' },
  { key: 'TOP', label: '上单' },
  { key: 'JUNGLE', label: '打野' },
  { key: 'MID', label: '中单' },
  { key: 'ADC', label: '下路' },
  { key: 'SUPPORT', label: '辅助' }
];
const POSITION_LABELS = { TOP: '上单', JUNGLE: '打野', MID: '中单', ADC: '下路', SUPPORT: '辅助' };
const POLL_INTERVAL = 3000;

const state = {
  mode: 'aram',
  // —— 海克斯大乱斗 ——
  champions: [],
  championBySlug: new Map(),
  augments: new Map(),
  items: new Map(),
  errors: new Map(),
  itemErrors: new Map(),
  selectedSlug: '',
  detailTab: 'augments',
  query: '',
  tierFilter: 'all',
  snapshot: null,
  pollTimer: null,
  // —— 排位 ——
  rankedTier: 'emerald_plus',
  rankedPosition: 'all',
  rankedEntries: [],
  rankedEntriesByTier: new Map(),
  rankedSelectedKey: '',
  rankedPage: 0,
  rankedDetailTab: 'runes',
  rankedBuilds: new Map(),
  rankedItemBuilds: new Map(),
  rankedBuildErrors: new Map(),
  rankedItemErrors: new Map(),
  rankedSnapshot: null,
  rankedPollTimer: null
};

const els = {
  statusText: document.getElementById('statusText'),
  refreshBtn: document.getElementById('refreshBtn'),
  heroSearch: document.getElementById('heroSearch'),
  heroCount: document.getElementById('heroCount'),
  aramFilters: document.getElementById('aramFilters'),
  rankedFilters: document.getElementById('rankedFilters'),
  positionFilters: document.getElementById('positionFilters'),
  tierSelect: document.getElementById('tierSelect'),
  heroList: document.getElementById('heroList'),
  emptyState: document.getElementById('emptyState'),
  heroDetail: document.getElementById('heroDetail'),
  detailImage: document.getElementById('detailImage'),
  detailName: document.getElementById('detailName'),
  detailSubName: document.getElementById('detailSubName'),
  augmentsTab: document.getElementById('augmentsTab'),
  itemsTab: document.getElementById('itemsTab'),
  runesTab: document.getElementById('runesTab'),
  opggLink: document.getElementById('opggLink'),
  detailStatus: document.getElementById('detailStatus'),
  augmentGroups: document.getElementById('augmentGroups'),
  aramModeTab: document.getElementById('aramModeTab'),
  rankedModeTab: document.getElementById('rankedModeTab'),
  backToListBtn: document.getElementById('backToListBtn')
};

document.addEventListener('DOMContentLoaded', () => {
  renderTierFilters();
  renderPositionFilters();
  renderTierSelect();
  els.augmentsTab.addEventListener('click', () => setDetailTab('augments'));
  els.itemsTab.addEventListener('click', () => setDetailTab('items'));
  els.runesTab.addEventListener('click', () => setDetailTab('runes'));
  els.aramModeTab.addEventListener('click', () => setMode('aram'));
  els.rankedModeTab.addEventListener('click', () => setMode('ranked'));
  els.backToListBtn.addEventListener('click', closeMobileDetail);
  els.refreshBtn.addEventListener('click', async () => {
    els.refreshBtn.disabled = true;
    els.refreshBtn.textContent = '正在刷新...';
    const ranked = state.mode === 'ranked';
    try {
      await apiJson(ranked ? '/api/refresh?mode=ranked&force=1' : '/api/refresh?force=1');
      if (ranked) {
        startRankedPolling();
      } else {
        startPolling();
      }
    } catch (error) {
      setStatus(error.message || '触发刷新失败', true);
    } finally {
      els.refreshBtn.disabled = false;
      els.refreshBtn.textContent = '刷新数据';
    }
    if (ranked) {
      await loadRankedPageData();
    } else {
      await loadPageData(true);
    }
  });
  els.heroSearch.addEventListener('input', () => {
    state.query = els.heroSearch.value.trim().toLowerCase();
    renderChampions({ autoSelect: true });
  });
  loadPageData(false);
  preloadRankedData();
});

function preloadRankedData() {
  // 后台预取排位数据：首次切换模式时无需等待
  apiJson(`/api/ranked/champions?tier=${encodeURIComponent(state.rankedTier)}`).then((data) => {
    state.rankedEntries = data.entries || [];
    state.rankedEntriesByTier.set(state.rankedTier, state.rankedEntries);
    if (!state.rankedSelectedKey) {
      state.rankedSelectedKey = rankedKey(getVisibleRankedEntries()[0] || state.rankedEntries[0]) || '';
    }
  }).catch(() => {});
  apiJson('/api/ranked/state').then((snapshot) => {
    state.rankedSnapshot = snapshot;
  }).catch(() => {});
}

async function setMode(mode) {
  if (state.mode === mode) {
    return;
  }
  state.mode = mode;
  state.query = els.heroSearch.value.trim().toLowerCase();
  const ranked = mode === 'ranked';
  els.aramModeTab.classList.toggle('active', !ranked);
  els.aramModeTab.setAttribute('aria-selected', String(!ranked));
  els.rankedModeTab.classList.toggle('active', ranked);
  els.rankedModeTab.setAttribute('aria-selected', String(ranked));
  els.aramFilters.classList.toggle('hidden', ranked);
  els.rankedFilters.classList.toggle('hidden', !ranked);
  els.augmentsTab.classList.toggle('hidden', ranked);
  els.runesTab.classList.toggle('hidden', !ranked);
  if (ranked) {
    state.rankedDetailTab = 'runes';
    if (state.rankedEntries.length) {
      // 已有数据：同步渲染，状态后台静默刷新
      await selectRankedChampion(state.rankedSelectedKey);
      if (state.rankedSnapshot) {
        applyRankedSnapshot(state.rankedSnapshot);
      }
      apiJson('/api/ranked/state').then((snapshot) => {
        applyRankedSnapshot(snapshot);
        if (snapshot.refreshing) {
          startRankedPolling();
        }
      }).catch(() => {});
    } else {
      loadRankedPageData();
    }
  } else {
    state.detailTab = 'augments';
    if (state.champions.length) {
      await selectChampion(state.selectedSlug);
      if (state.snapshot) {
        applySnapshot(state.snapshot);
      }
      apiJson('/api/state').then((snapshot) => {
        applySnapshot(snapshot);
        if (snapshot.refreshing || snapshot.status === 'empty' || snapshot.status === 'refreshing') {
          startPolling();
        }
      }).catch(() => {});
    } else {
      loadPageData(false);
    }
  }
  syncMobileDetailClass();
}

async function apiJson(path) {
  const response = await fetch(path);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!response.ok) {
    throw new Error(data?.error || `请求失败：${response.status}`);
  }
  return data;
}

function setStatus(text, isError = false) {
  els.statusText.textContent = text;
  els.statusText.style.color = isError ? '#fecaca' : '';
}

function formatRate(value) {
  const percent = Number(value) <= 1 ? Number(value) * 100 : Number(value);
  return `${percent.toFixed(2).replace(/\.00$/, '')}%`;
}

// ================= 海克斯大乱斗（ARAM） =================

async function loadPageData(keepSelected) {
  try {
    const [snapshot, championsResult] = await Promise.all([
      apiJson('/api/state'),
      apiJson('/api/champions')
    ]);
    applySnapshot(snapshot);
    applyChampions(championsResult.champions || [], keepSelected);
    if (!keepSelected || !state.augments.has(state.selectedSlug)) {
      await selectChampion(state.selectedSlug || getVisibleChampions()[0]?.slug || state.champions[0]?.slug || '');
    } else {
      renderChampions();
      renderDetail();
    }
    if (snapshot.refreshing || snapshot.status === 'empty' || snapshot.status === 'refreshing') {
      startPolling();
    }
  } catch (error) {
    setStatus(error.message || '加载失败', true);
  }
}

function startPolling() {
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(async () => {
    try {
      const snapshot = await apiJson('/api/state');
      applySnapshot(snapshot);
      if (snapshot.championCount !== state.champions.length) {
        const championsResult = await apiJson('/api/champions');
        applyChampions(championsResult.champions || [], true);
        if (!state.augments.has(state.selectedSlug)) {
          await selectChampion(state.selectedSlug || getVisibleChampions()[0]?.slug || state.champions[0]?.slug || '');
        }
      }
      if (!snapshot.refreshing && snapshot.status !== 'empty' && snapshot.status !== 'refreshing') {
        window.clearInterval(state.pollTimer);
      }
    } catch (error) {
      setStatus(error.message || '状态刷新失败', true);
    }
  }, POLL_INTERVAL);
}

function applySnapshot(snapshot) {
  state.snapshot = snapshot;
  if (snapshot.lastError) {
    setStatus(snapshot.lastError, true);
  } else if (snapshot.refreshing && snapshot.championCount) {
    setStatus('后端正在后台更新，当前展示上次缓存');
  } else if (snapshot.refreshing || snapshot.status === 'empty') {
    setStatus('暂无缓存，后端正在初始化数据...');
  } else if (snapshot.status === 'ready') {
    setStatus('已加载服务器缓存，英雄按 OP.GG 梯度排行展示');
  } else {
    setStatus('准备读取服务器缓存');
  }
  updateProgress(snapshot);
}

function updateProgress(snapshot) {
  const updated = snapshot?.lastUpdatedAt ? `数据更新：${new Date(snapshot.lastUpdatedAt).toLocaleString()}` : '';
  if (snapshot?.refreshing) {
    const progress = snapshot?.progress || {};
    const total = progress.total || snapshot?.championCount || 0;
    const done = progress.done || (progress.completed || 0) + (progress.failed || 0);
    setStatus(updated ? `${updated} · 后台更新中 ${done}/${total}` : '后端正在初始化数据...');
  } else {
    setStatus(updated || '准备读取服务器缓存...');
  }
}

function applyChampions(champions, keepSelected) {
  state.champions = sortChampions(champions.map(normalizeChampion));
  state.championBySlug = new Map(state.champions.map(champion => [champion.slug, champion]));
  const visible = getVisibleChampions();
  if (!keepSelected || !state.championBySlug.has(state.selectedSlug) || !visible.some(champion => champion.slug === state.selectedSlug)) {
    state.selectedSlug = visible[0]?.slug || state.champions[0]?.slug || '';
  }
  renderChampions();
}

function normalizeChampion(champion) {
  return {
    ...champion,
    tier: Number.isFinite(Number(champion.tier)) ? Number(champion.tier) : null,
    rank: Number.isFinite(Number(champion.rank)) ? Number(champion.rank) : null
  };
}

function sortChampions(champions) {
  return [...champions].sort((a, b) => {
    const ar = Number.isFinite(a.rank) ? a.rank : 99999;
    const br = Number.isFinite(b.rank) ? b.rank : 99999;
    return ar - br || (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
  });
}

function getVisibleChampions() {
  const query = state.query;
  return state.champions.filter((champion) => {
    const queryMatch = !query || (champion.searchText || '').includes(query);
    const tierMatch = state.tierFilter === 'all'
      || (state.tierFilter === 'unranked' ? !Number.isFinite(champion.tier) : champion.tier === Number(state.tierFilter));
    return queryMatch && tierMatch;
  });
}

function renderTierFilters() {
  els.aramFilters.replaceChildren();
  for (const filter of TIER_FILTERS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tier-filter${state.tierFilter === filter.key ? ' active' : ''}`;
    button.textContent = filter.label;
    button.addEventListener('click', () => {
      state.tierFilter = filter.key;
      renderTierFilters();
      renderChampions({ autoSelect: true });
    });
    els.aramFilters.appendChild(button);
  }
}

function heroStatus(champion) {
  if (state.augments.has(champion.slug)) {
    return 'done';
  }
  if (state.errors.has(champion.slug) || champion.augmentStatus === 'error') {
    return 'error';
  }
  if (champion.augmentStatus === 'done') {
    return 'done';
  }
  return '';
}

function syncMobileDetailClass() {
  const hasSelection = state.mode === 'ranked' ? Boolean(state.rankedSelectedKey) : Boolean(state.selectedSlug);
  document.body.classList.toggle('mobile-detail-open', hasSelection);
}

function closeMobileDetail() {
  if (state.mode === 'ranked') {
    state.rankedSelectedKey = '';
  } else {
    state.selectedSlug = '';
  }
  renderChampions();
  renderDetail();
  syncMobileDetailClass();
}

async function selectChampion(slug) {
  state.selectedSlug = slug;
  renderChampions();
  renderDetail();
  syncMobileDetailClass();
  const requests = [];
  if (!state.augments.has(slug) && !state.errors.has(slug)) {
    requests.push(loadAugmentsForChampion(slug));
  }
  if (state.detailTab === 'items') {
    requests.push(loadItemsForChampion(slug));
  }
  await Promise.all(requests);
}

async function loadAugmentsForChampion(slug) {
  try {
    const data = await apiJson(`/api/champions/${encodeURIComponent(slug)}/augments`);
    if (data.status === 'done') {
      state.augments.set(slug, data);
    } else if (data.status === 'error') {
      state.errors.set(slug, data.error || '获取失败');
    }
  } catch (error) {
    state.errors.set(slug, error.message || '缓存中暂无该英雄数据');
  } finally {
    renderChampions();
    renderDetail();
  }
}

async function setDetailTab(tab) {
  if (state.mode === 'ranked') {
    if (state.rankedDetailTab === tab) {
      return;
    }
    state.rankedDetailTab = tab;
    renderDetail();
    const selected = getRankedSelectedEntry();
    if (tab === 'items' && selected && !state.rankedItemBuilds.has(rankedKey(selected)) && !state.rankedItemErrors.has(rankedKey(selected))) {
      await loadRankedItemsForChampion(selected.slug, selected.position);
    }
    return;
  }
  if (state.detailTab === tab) {
    return;
  }
  state.detailTab = tab;
  renderDetail();
  if (tab !== 'items' || state.items.has(state.selectedSlug) || state.itemErrors.has(state.selectedSlug)) {
    return;
  }
  await loadItemsForChampion(state.selectedSlug);
}

async function loadItemsForChampion(slug) {
  if (!slug || state.items.has(slug) || state.itemErrors.has(slug)) {
    return;
  }
  try {
    const data = await apiJson(`/api/champions/${encodeURIComponent(slug)}/items`);
    if (data.status === 'done') {
      state.items.set(slug, data);
    } else if (data.status === 'error') {
      state.itemErrors.set(slug, data.error || '获取失败');
    } else if (data.status === 'pending') {
      window.setTimeout(() => {
        if (state.selectedSlug === slug && state.detailTab === 'items') {
          loadItemsForChampion(slug);
        }
      }, POLL_INTERVAL);
    }
  } catch (error) {
    state.itemErrors.set(slug, error.message || '缓存中暂无该英雄装备数据');
  } finally {
    renderDetail();
  }
}

function renderDetail() {
  if (state.mode === 'ranked') {
    renderRankedDetail();
    return;
  }
  renderAramDetail();
}

function renderAramDetail() {
  const slug = state.selectedSlug;
  const champion = state.championBySlug.get(slug);
  if (!champion) {
    els.emptyState.classList.remove('hidden');
    els.heroDetail.classList.add('hidden');
    return;
  }

  els.emptyState.classList.add('hidden');
  els.heroDetail.classList.remove('hidden');
  els.detailImage.src = champion.image;
  els.detailImage.alt = champion.name;
  els.detailName.textContent = champion.name || champion.opggName || champion.slug;
  const rankText = [Number.isFinite(champion.tier) ? `T${champion.tier}` : '', Number.isFinite(champion.rank) ? `#${champion.rank}` : ''].filter(Boolean).join(' · ');
  els.detailSubName.textContent = [champion.title, champion.slug, rankText].filter(Boolean).join(' / ');
  const showingItems = state.detailTab === 'items';
  els.augmentsTab.classList.toggle('active', !showingItems);
  els.augmentsTab.setAttribute('aria-selected', String(!showingItems));
  els.itemsTab.classList.toggle('active', showingItems);
  els.itemsTab.setAttribute('aria-selected', String(showingItems));
  els.runesTab.classList.remove('active');
  els.runesTab.setAttribute('aria-selected', 'false');
  els.opggLink.href = `https://op.gg${MODE_PATH}/${champion.slug}/${showingItems ? 'items' : 'augments'}`;
  els.augmentGroups.replaceChildren();
  els.detailStatus.className = 'notice';

  if (showingItems) {
    renderItemsDetail(champion, slug);
    return;
  }

  if (state.errors.has(slug)) {
    els.detailStatus.className = 'notice error';
    els.detailStatus.textContent = state.errors.get(slug);
    return;
  }

  const data = state.augments.get(slug);
  if (!data) {
    els.detailStatus.textContent = `正在读取 ${champion.name} 的缓存增幅数据...`;
    return;
  }

  els.detailStatus.textContent = data.hasPickRate
    ? `已解析 ${data.count} 个增幅装置，按 OP.GG 选取率排序。`
    : `已解析 ${data.count} 个增幅装置，按 OP.GG 页面顺序展示。`;
  renderAugmentGroups(data.groups || {});
}

function renderItemsDetail(champion, slug) {
  if (state.itemErrors.has(slug)) {
    els.detailStatus.className = 'notice error';
    els.detailStatus.textContent = state.itemErrors.get(slug);
    return;
  }
  const data = state.items.get(slug);
  if (!data) {
    els.detailStatus.textContent = `正在读取 ${champion.name} 的缓存装备排行...`;
    return;
  }
  els.detailStatus.textContent = `已解析 OP.GG 出装排行，共 ${data.count} 条推荐。`;
  renderItemSections(data.sections || []);
}

function renderItemSections(sections) {
  for (const sectionData of sections) {
    const section = document.createElement('section');
    section.className = 'item-group';
    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = sectionData.label;
    const list = document.createElement('div');
    list.className = 'item-list';
    (sectionData.builds || []).forEach((build, index) => list.appendChild(createItemBuildCard(build, index)));
    section.append(title, list);
    els.augmentGroups.appendChild(section);
  }
}

function createItemBuildCard(build, index) {
  const card = document.createElement('article');
  card.className = 'item-build-card';
  const rank = document.createElement('div');
  rank.className = 'rank';
  rank.textContent = String(index + 1);
  const items = document.createElement('div');
  items.className = 'build-items';
  (build.items || []).forEach((item, itemIndex) => {
    if (itemIndex) {
      const arrow = document.createElement('span');
      arrow.className = 'build-arrow';
      arrow.textContent = '›';
      items.appendChild(arrow);
    }
    const image = document.createElement('img');
    image.width = 36;
    image.height = 36;
    image.loading = 'lazy';
    image.alt = item.name;
    image.title = item.name;
    image.src = item.icon;
    items.appendChild(image);
  });
  card.append(rank, items);
  return card;
}

function renderAugmentGroups(groups) {
  for (const group of GROUPS) {
    const section = document.createElement('section');
    section.className = 'augment-group';

    const title = document.createElement('div');
    title.className = `augment-title ${group.className}`;
    const label = document.createElement('span');
    label.textContent = group.label;
    const count = document.createElement('span');
    count.textContent = String((groups[group.key] || []).length);
    title.append(label, count);

    const list = document.createElement('div');
    list.className = 'augment-list';
    const items = groups[group.key] || [];
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'notice';
      empty.textContent = '暂无数据';
      list.appendChild(empty);
    } else {
      items.forEach((item, index) => list.appendChild(createAugmentCard(item, index)));
    }

    section.append(title, list);
    els.augmentGroups.appendChild(section);
  }
}

function createAugmentCard(item, index) {
  const card = document.createElement('article');
  card.className = 'augment-card';

  const rank = document.createElement('div');
  rank.className = 'rank';
  rank.textContent = String(index + 1);

  const img = document.createElement('img');
  img.width = 36;
  img.height = 36;
  img.loading = 'lazy';
  img.alt = item.name;
  img.src = item.icon;

  const body = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'augment-name';
  name.textContent = item.name;
  const meta = document.createElement('div');
  meta.className = 'augment-meta';
  meta.textContent = typeof item.pickRate === 'number'
    ? `选取率 ${formatRate(item.pickRate)}${typeof item.performance === 'number' ? ` · 表现 ${item.performance.toFixed(2)}` : ''}`
    : 'OP.GG 页面顺序';
  body.append(name, meta);

  if (item.desc) {
    const tooltip = document.createElement('div');
    tooltip.className = 'augment-tooltip';
    tooltip.textContent = item.desc;
    img.classList.add('has-tooltip');
    const wrap = document.createElement('div');
    wrap.className = 'augment-icon-wrap';
    wrap.append(img, tooltip);
    card.append(rank, wrap, body);
    return card;
  }

  card.append(rank, img, body);
  return card;
}

// ================= 排位 =================

function renderPositionFilters() {
  els.positionFilters.replaceChildren();
  for (const option of POSITION_OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tier-filter${state.rankedPosition === option.key ? ' active' : ''}`;
    button.textContent = option.label;
    button.addEventListener('click', () => {
      state.rankedPosition = option.key;
      renderPositionFilters();
      renderChampions({ autoSelect: true });
    });
    els.positionFilters.appendChild(button);
  }
}

function renderTierSelect() {
  els.tierSelect.replaceChildren();
  for (const option of RANKED_TIER_OPTIONS) {
    const optionEl = document.createElement('option');
    optionEl.value = option.key;
    optionEl.textContent = option.label;
    if (state.rankedTier === option.key) {
      optionEl.selected = true;
    }
    els.tierSelect.appendChild(optionEl);
  }
  els.tierSelect.addEventListener('change', () => {
    state.rankedTier = els.tierSelect.value;
    loadRankedEntries().catch((error) => setStatus(error.message || '加载段位数据失败', true));
  });
}

async function loadRankedEntries() {
  const data = await apiJson(`/api/ranked/champions?tier=${encodeURIComponent(state.rankedTier)}`);
  state.rankedEntries = data.entries || [];
  state.rankedEntriesByTier.set(state.rankedTier, state.rankedEntries);
  const visible = getVisibleRankedEntries();
  const selectedVisible = visible.some(entry => rankedKey(entry) === state.rankedSelectedKey);
  const targetKey = selectedVisible ? state.rankedSelectedKey : (rankedKey(visible[0] || state.rankedEntries[0]) || '');
  await selectRankedChampion(targetKey);
}

async function loadRankedPageData() {
  try {
    const [snapshot] = await Promise.all([
      apiJson('/api/ranked/state').then((snapshot) => {
        applyRankedSnapshot(snapshot);
        return snapshot;
      }),
      loadRankedEntries()
    ]);
    if (snapshot.refreshing || snapshot.status === 'empty' || snapshot.status === 'refreshing') {
      startRankedPolling();
    }
  } catch (error) {
    setStatus(error.message || '排位数据加载失败', true);
  }
}

function applyRankedSnapshot(snapshot) {
  state.rankedSnapshot = snapshot;
  if (snapshot.lastError) {
    setStatus(snapshot.lastError, true);
    return;
  }
  if (snapshot.refreshing) {
    const progress = snapshot.progress || {};
    if (progress.phase === 'tiers') {
      setStatus(`后台更新中：抓取段位榜单 ${progress.done || 0}/${progress.total || '?'}`);
    } else {
      setStatus(`后台更新中：抓取英雄符文/出装 ${progress.done || 0}/${progress.total || '?'}`);
    }
    return;
  }
  if (snapshot.status === 'empty' || snapshot.status === 'refreshing') {
    setStatus('暂无排位缓存，后端正在初始化数据...');
    return;
  }
  const updated = snapshot.lastUpdatedAt ? `排位数据更新：${new Date(snapshot.lastUpdatedAt).toLocaleString()}` : '';
  setStatus(updated ? `${updated} · 详情为 ${snapshot.detailTier === 'all' ? '全部段位' : '翡翠+'}数据` : '准备读取排位缓存');
}

function startRankedPolling() {
  window.clearInterval(state.rankedPollTimer);
  state.rankedPollTimer = window.setInterval(async () => {
    try {
      const snapshot = await apiJson('/api/ranked/state');
      applyRankedSnapshot(snapshot);
      const previousCount = state.rankedEntries.length;
      const previousChampionCount = state.rankedSnapshot?.championCount;
      if (snapshot.refreshing) {
        if (progressPhase(snapshot) === 'builds' && snapshot.progress?.done !== previousChampionCount) {
          state.rankedSnapshot = snapshot;
        }
        return;
      }
      if (snapshot.status !== 'empty' && snapshot.status !== 'refreshing') {
        if (!state.rankedEntries.length || snapshot.championCount !== previousChampionCount) {
          await loadRankedEntries();
        } else {
          applyRankedSnapshot(snapshot);
        }
        window.clearInterval(state.rankedPollTimer);
      }
    } catch (error) {
      setStatus(error.message || '排位状态刷新失败', true);
    }
  }, POLL_INTERVAL);
}

function progressPhase(snapshot) {
  return snapshot?.progress?.phase || '';
}

function rankedKey(entry) {
  return entry ? `${entry.slug}|${entry.position}` : '';
}

function getVisibleRankedEntries() {
  const query = state.query;
  let list = state.rankedEntries.filter((entry) => {
    const queryMatch = !query || (entry.searchText || '').includes(query);
    const positionMatch = state.rankedPosition === 'all' || entry.position === state.rankedPosition;
    return queryMatch && positionMatch;
  });
  if (state.rankedPosition === 'all') {
    // 对齐 OP.GG 全部视图：每英雄取最优（tier, rank）的一条
    const bySlug = new Map();
    for (const entry of list) {
      const existing = bySlug.get(entry.slug);
      if (!existing || betterRankedEntry(entry, existing)) {
        bySlug.set(entry.slug, entry);
      }
    }
    list = [...bySlug.values()];
  }
  return list;
}

function betterRankedEntry(a, b) {
  const at = Number.isFinite(Number(a.tier)) ? Number(a.tier) : 99;
  const bt = Number.isFinite(Number(b.tier)) ? Number(b.tier) : 99;
  if (at !== bt) {
    return at < bt;
  }
  const ar = Number.isFinite(Number(a.rank)) ? Number(a.rank) : 99999;
  const br = Number.isFinite(Number(b.rank)) ? Number(b.rank) : 99999;
  if (ar !== br) {
    return ar < br;
  }
  return (a.roleRate ?? -1) > (b.roleRate ?? -1);
}

function getRankedSelectedEntry() {
  return state.rankedEntries.find((entry) => rankedKey(entry) === state.rankedSelectedKey) || null;
}

function getRankedChampionEntries(slug) {
  return state.rankedEntries.filter((entry) => entry.slug === slug);
}

function sortRankedChampionsForAll(entries) {
  // 对齐 OP.GG 全部视图：段位升序，同段位按胜率降序
  return [...entries].sort((a, b) => {
    const at = Number.isFinite(Number(a.tier)) ? Number(a.tier) : 99;
    const bt = Number.isFinite(Number(b.tier)) ? Number(b.tier) : 99;
    if (at !== bt) {
      return at - bt;
    }
    const aw = Number.isFinite(Number(a.winRate)) ? Number(a.winRate) : -1;
    const bw = Number.isFinite(Number(b.winRate)) ? Number(b.winRate) : -1;
    if (aw !== bw) {
      return bw - aw;
    }
    const ar = Number.isFinite(Number(a.rank)) ? Number(a.rank) : 99999;
    const br = Number.isFinite(Number(b.rank)) ? Number(b.rank) : 99999;
    return ar - br;
  });
}

function createPositionBadge(position) {
  const span = document.createElement('span');
  span.className = `position-badge position-${(position || '').toLowerCase()}`;
  span.textContent = POSITION_LABELS[position] || position || '--';
  return span;
}

function createRankedTierBadge(entry) {
  const span = document.createElement('span');
  const tier = Number(entry.tier);
  if (Number.isFinite(tier)) {
    // OP.GG 样式：tier 0 = OP，其余显示数字
    span.className = `tier-badge rtier-${Math.min(5, tier)}`;
    span.textContent = tier === 0 ? 'OP' : String(tier);
  } else {
    span.className = 'tier-badge tier-empty';
    span.textContent = '未排名';
  }
  return span;
}

function rankedStatus(entry) {
  if (state.rankedBuilds.has(rankedKey(entry))) {
    return 'done';
  }
  if (state.rankedBuildErrors.has(rankedKey(entry))) {
    return 'error';
  }
  return '';
}

async function selectRankedChampion(key) {
  state.rankedSelectedKey = key;
  state.rankedPage = 0;
  renderChampions();
  renderDetail();
  syncMobileDetailClass();
  const selected = getRankedSelectedEntry();
  if (!selected) {
    return;
  }
  const buildKey = rankedKey(selected);
  if (state.rankedDetailTab === 'runes' && !state.rankedBuilds.has(buildKey) && !state.rankedBuildErrors.has(buildKey)) {
    await loadRankedBuildForChampion(selected.slug, selected.position);
  }
  if (state.rankedDetailTab === 'items' && !state.rankedItemBuilds.has(buildKey) && !state.rankedItemErrors.has(buildKey)) {
    await loadRankedItemsForChampion(selected.slug, selected.position);
  }
}

async function loadRankedBuildForChampion(slug, position) {
  const key = `${slug}|${position}`;
  try {
    const data = await apiJson(`/api/ranked/champions/${encodeURIComponent(slug)}/build?position=${encodeURIComponent(position)}`);
    if (data.status === 'done') {
      state.rankedBuilds.set(key, data);
    } else if (data.status === 'error') {
      state.rankedBuildErrors.set(key, data.error || '获取失败');
    } else if (data.status === 'pending') {
      window.setTimeout(() => {
        const selected = getRankedSelectedEntry();
        if (selected && rankedKey(selected) === key && state.mode === 'ranked' && state.rankedDetailTab === 'runes') {
          loadRankedBuildForChampion(slug, position);
        }
      }, POLL_INTERVAL);
    }
  } catch (error) {
    state.rankedBuildErrors.set(key, error.message || '缓存中暂无该英雄符文数据');
  } finally {
    renderChampions();
    renderDetail();
  }
}

async function loadRankedItemsForChampion(slug, position) {
  const key = `${slug}|${position}`;
  try {
    const data = await apiJson(`/api/ranked/champions/${encodeURIComponent(slug)}/items?position=${encodeURIComponent(position)}`);
    if (data.status === 'done') {
      state.rankedItemBuilds.set(key, data);
    } else if (data.status === 'error') {
      state.rankedItemErrors.set(key, data.error || '获取失败');
    } else if (data.status === 'pending') {
      window.setTimeout(() => {
        const selected = getRankedSelectedEntry();
        if (selected && rankedKey(selected) === key && state.mode === 'ranked' && state.rankedDetailTab === 'items') {
          loadRankedItemsForChampion(slug, position);
        }
      }, POLL_INTERVAL);
    }
  } catch (error) {
    state.rankedItemErrors.set(key, error.message || '缓存中暂无该英雄出装数据');
  } finally {
    renderDetail();
  }
}

function selectRankedPosition(position) {
  const selected = getRankedSelectedEntry();
  if (!selected || selected.position === position) {
    return;
  }
  selectRankedChampion(`${selected.slug}|${position}`);
}

function renderRankedDetail() {
  const selected = getRankedSelectedEntry();
  if (!selected) {
    els.emptyState.classList.remove('hidden');
    els.heroDetail.classList.add('hidden');
    return;
  }

  els.emptyState.classList.add('hidden');
  els.heroDetail.classList.remove('hidden');
  els.detailImage.src = selected.image;
  els.detailImage.alt = selected.name;
  els.detailName.textContent = selected.name;
  const infoBits = [
    selected.title,
    POSITION_LABELS[selected.position] || selected.position,
    Number.isFinite(Number(selected.tier)) ? (Number(selected.tier) === 0 ? 'OP' : String(Number(selected.tier))) : '',
    Number.isFinite(Number(selected.rank)) ? `#${selected.rank}` : '',
    `胜率 ${formatRate(selected.winRate)}`,
    `登场率 ${formatRate(selected.pickRate)}`
  ].filter(Boolean);
  els.detailSubName.textContent = infoBits.join(' / ');

  const showingRunes = state.rankedDetailTab === 'runes';
  els.runesTab.classList.toggle('active', showingRunes);
  els.runesTab.setAttribute('aria-selected', String(showingRunes));
  els.itemsTab.classList.toggle('active', !showingRunes);
  els.itemsTab.setAttribute('aria-selected', String(!showingRunes));
  els.augmentsTab.classList.remove('active');
  els.augmentsTab.setAttribute('aria-selected', 'false');
  els.opggLink.href = `https://op.gg${RANKED_PATH}/${selected.slug}/${showingRunes ? 'build' : 'items'}/${selected.position.toLowerCase()}?region=global&type=ranked&tier=${state.rankedTier}`;
  els.augmentGroups.replaceChildren();
  els.detailStatus.className = 'notice';

  const championEntries = getRankedChampionEntries(selected.slug);
  if (championEntries.length > 1) {
    els.augmentGroups.appendChild(createPositionSwitcher(championEntries, selected.position));
  }

  if (showingRunes) {
    renderRankedRunesDetail(selected);
    return;
  }
  renderRankedItemsDetail(selected);
}

function createPositionSwitcher(championEntries, activePosition) {
  const wrap = document.createElement('div');
  wrap.className = 'position-switcher';
  const label = document.createElement('span');
  label.className = 'position-switcher-label';
  label.textContent = '分路';
  wrap.appendChild(label);
  const ordered = [...championEntries].sort((a, b) => {
    const ai = RANKED_TIER_ORDER[a.position] ?? 99;
    const bi = RANKED_TIER_ORDER[b.position] ?? 99;
    return ai - bi;
  });
  for (const entry of ordered) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `tier-filter${entry.position === activePosition ? ' active' : ''}`;
    chip.textContent = POSITION_LABELS[entry.position] || entry.position;
    chip.addEventListener('click', () => selectRankedPosition(entry.position));
    wrap.appendChild(chip);
  }
  return wrap;
}

function renderRankedRunesDetail(entry) {
  const key = rankedKey(entry);
  if (state.rankedBuildErrors.has(key)) {
    els.detailStatus.className = 'notice error';
    els.detailStatus.textContent = state.rankedBuildErrors.get(key);
    return;
  }
  const data = state.rankedBuilds.get(key);
  if (!data) {
    els.detailStatus.textContent = `正在读取 ${entry.name} 的缓存符文数据（${POSITION_LABELS[entry.position] || entry.position}）...`;
    return;
  }
  const pages = data.runePages || [];
  if (!pages.length) {
    els.detailStatus.className = 'notice error';
    els.detailStatus.textContent = '符文数据为空';
    return;
  }
  if (state.rankedPage >= pages.length) {
    state.rankedPage = 0;
  }
  const positionLabel = POSITION_LABELS[data.position] || data.position;
  els.detailStatus.textContent = `${entry.name} · ${positionLabel} · ${pages.length} 套推荐符文（悬停符文可查看选取率/胜率/场次）`;

  const wrap = document.createElement('div');
  wrap.className = 'rune-detail';

  if (pages.length) {
    const summaryRow = document.createElement('div');
    summaryRow.className = 'rune-summary-row';
    pages.forEach((page, index) => summaryRow.appendChild(createRuneSummaryCard(page, index, index === state.rankedPage)));
    wrap.appendChild(summaryRow);
  }

  const page = pages[state.rankedPage];
  const primaryTree = data.trees?.[page.primaryStyle?.id];
  const subTree = data.trees?.[page.subStyle?.id];
  const activeIds = new Set(data.pageActives?.[state.rankedPage] || []);
  if (primaryTree) {
    const treeGrid = document.createElement('div');
    treeGrid.className = 'rune-tree-grid';
    treeGrid.appendChild(createRuneTree(page.primaryStyle?.name || '主系', primaryTree.mainRows, activeIds));
    if (subTree?.mainRows?.length) {
      treeGrid.appendChild(createRuneTree(page.subStyle?.name || '副系', subTree.mainRows.slice(1), activeIds));
    }
    if (primaryTree.shardRows?.length) {
      treeGrid.appendChild(createRuneTree('符文碎片', primaryTree.shardRows, activeIds, true));
    }
    wrap.appendChild(treeGrid);
  }

  const spells = data.summonerSpells || [];
  if (spells.length) {
    wrap.appendChild(createSummonerSpellsSection(spells));
  }

  const skills = data.skills;
  if (skills && (skills.priority || skills.orders?.length)) {
    wrap.appendChild(createSkillSection(skills));
  }

  els.augmentGroups.appendChild(wrap);
}

function createRuneSummaryCard(page, index, isActive) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `rune-summary-card${isActive ? ' selected' : ''}`;
  card.addEventListener('click', () => {
    if (state.rankedPage === index) {
      return;
    }
    state.rankedPage = index;
    renderDetail();
  });

  const icons = document.createElement('div');
  icons.className = 'rune-summary-icons';
  [page.primaryStyle, page.keystone, page.subStyle].forEach((rune) => {
    if (rune?.image) {
      const img = document.createElement('img');
      img.src = rune.image;
      img.alt = rune.name;
      img.title = rune.name;
      img.width = 34;
      img.height = 34;
      img.loading = 'lazy';
      if (rune === page.keystone) {
        img.className = 'rune-summary-keystone';
      }
      icons.appendChild(img);
    }
  });

  const pick = document.createElement('div');
  pick.className = 'rune-summary-stat';
  pick.innerHTML = `<strong>${formatRate(page.pickRate)}</strong><span>${page.play != null ? page.play.toLocaleString() : '--'} 场</span><span>选取率</span>`;

  const win = document.createElement('div');
  win.className = 'rune-summary-stat win';
  win.innerHTML = `<strong>${formatRate(page.winRate)}</strong><span>胜率</span>`;

  const label = document.createElement('span');
  label.className = 'rune-summary-label';
  label.textContent = index === 0 ? '推荐' : '次选';

  card.append(label, icons, pick, win);
  return card;
}

function createRuneTree(title, rows, activeIds, shardMode = false) {
  const tree = document.createElement('div');
  tree.className = 'rune-tree';
  const header = document.createElement('div');
  header.className = 'rune-tree-title';
  header.textContent = title;
  tree.appendChild(header);
  (rows || []).forEach((row) => {
    if (shardMode) {
      const shardRow = document.createElement('div');
      shardRow.className = 'rune-options-row';
      row.forEach((option) => shardRow.appendChild(createRuneOptionCell(option, activeIds)));
      tree.appendChild(shardRow);
      return;
    }
    const best = row.reduce((acc, cur) => ((cur.pickRate ?? -1) > (acc?.pickRate ?? -1) ? cur : acc), null);
    const optionsRow = document.createElement('div');
    optionsRow.className = 'rune-options-row';
    row.forEach((option) => {
      const isActive = activeIds.has(option.id) || (activeIds.size === 0 && option === best);
      optionsRow.appendChild(createRuneOptionCell(option, isActive));
    });
    tree.appendChild(optionsRow);
  });
  return tree;
}

function createRuneOptionCell(option, isActive) {
  const cell = document.createElement('div');
  cell.className = `rune-option-cell${isActive ? ' active' : ''}`;
  const img = document.createElement('img');
  img.src = option.image;
  img.alt = option.name;
  img.title = `${option.name} · 选取率 ${option.pickRate != null ? formatRate(option.pickRate) : '--'} · 胜率 ${option.winRate != null ? formatRate(option.winRate) : '--'} · ${option.play != null ? option.play.toLocaleString() : '--'} 场`;
  img.width = 34;
  img.height = 34;
  img.loading = 'lazy';
  const pick = document.createElement('span');
  pick.className = 'rune-cell-pick';
  pick.textContent = option.pickRate != null ? formatRate(option.pickRate) : '--';
  const win = document.createElement('span');
  win.className = 'rune-cell-win';
  win.textContent = option.winRate != null ? formatRate(option.winRate) : '--';
  const play = document.createElement('span');
  play.className = 'rune-cell-play';
  play.textContent = option.play != null ? option.play.toLocaleString() : '--';
  cell.append(img, pick, win, play);
  return cell;
}

function createSummonerSpellsSection(spells) {
  const section = document.createElement('section');
  section.className = 'rune-section';
  const title = document.createElement('div');
  title.className = 'rune-section-title';
  title.textContent = '召唤师技能推荐';
  section.appendChild(title);
  spells.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'spell-row';
    const icons = document.createElement('div');
    icons.className = 'spell-icons';
    (row.spells || []).forEach((spell) => {
      const img = document.createElement('img');
      img.src = spell.image;
      img.alt = spell.name;
      img.title = spell.name;
      img.width = 30;
      img.height = 30;
      img.loading = 'lazy';
      icons.appendChild(img);
    });
    const pick = document.createElement('div');
    pick.className = 'rune-summary-stat';
    pick.innerHTML = `<strong>${formatRate(row.pickRate)}</strong><span>${row.play != null ? row.play.toLocaleString() : '--'} 场</span><span>选用率</span>`;
    const win = document.createElement('div');
    win.className = 'rune-summary-stat win';
    win.innerHTML = `<strong>${formatRate(row.winRate)}</strong><span>胜率</span>`;
    item.append(icons, pick, win);
    section.appendChild(item);
  });
  return section;
}

function createSkillSection(skills) {
  const section = document.createElement('section');
  section.className = 'rune-section';
  const title = document.createElement('div');
  title.className = 'rune-section-title';
  title.textContent = '技能加点';
  section.appendChild(title);

  if (skills.priority) {
    const p = skills.priority;
    const priorityRow = document.createElement('div');
    priorityRow.className = 'skill-row';
    const letters = document.createElement('div');
    letters.className = 'skill-letters';
    (p.order || []).forEach((letter) => {
      const chip = document.createElement('span');
      chip.className = 'skill-chip';
      chip.textContent = letter;
      letters.appendChild(chip);
      if (letter !== p.order[p.order.length - 1]) {
        const arrow = document.createElement('span');
        arrow.className = 'skill-arrow';
        arrow.textContent = '›';
        letters.appendChild(arrow);
      }
    });
    const pick = document.createElement('div');
    pick.className = 'rune-summary-stat';
    pick.innerHTML = `<strong>${p.pickRate != null ? formatRate(p.pickRate) : '--'}</strong><span>${p.play != null ? p.play.toLocaleString() : '--'} 场</span><span>选用率</span>`;
    const win = document.createElement('div');
    win.className = 'rune-summary-stat win';
    win.innerHTML = `<strong>${p.winRate != null ? formatRate(p.winRate) : '--'}</strong><span>胜率</span>`;
    priorityRow.append(letters, pick, win);
    section.appendChild(priorityRow);
  }

  for (const order of skills.orders || []) {
    const orderRow = document.createElement('div');
    orderRow.className = 'skill-row';
    const seq = document.createElement('div');
    seq.className = 'skill-sequence';
    for (const letter of order.sequence || '') {
      const chip = document.createElement('span');
      chip.className = `skill-chip small${letter === 'R' ? ' ult' : ''}`;
      chip.textContent = letter;
      seq.appendChild(chip);
    }
    const pick = document.createElement('div');
    pick.className = 'rune-summary-stat';
    pick.innerHTML = `<strong>${order.pickRate != null ? formatRate(order.pickRate) : '--'}</strong><span>${order.play != null ? order.play.toLocaleString() : '--'} 场</span><span>选用率</span>`;
    const win = document.createElement('div');
    win.className = 'rune-summary-stat win';
    win.innerHTML = `<strong>${order.winRate != null ? formatRate(order.winRate) : '--'}</strong><span>胜率</span>`;
    orderRow.append(seq, pick, win);
    section.appendChild(orderRow);
  }
  return section;
}

function renderRankedItemsDetail(entry) {
  const key = rankedKey(entry);
  if (state.rankedItemErrors.has(key)) {
    els.detailStatus.className = 'notice error';
    els.detailStatus.textContent = state.rankedItemErrors.get(key);
    return;
  }
  const data = state.rankedItemBuilds.get(key);
  if (!data) {
    els.detailStatus.textContent = `正在读取 ${entry.name} 的缓存出装排行（${POSITION_LABELS[entry.position] || entry.position}）...`;
    return;
  }
  els.detailStatus.textContent = `${entry.name} · ${POSITION_LABELS[data.position] || data.position} · 共 ${data.count} 条出装推荐`;
  renderItemSections(data.sections || []);
}

// ================= 共用渲染 =================

function renderChampions(options = {}) {
  if (state.mode === 'ranked') {
    renderRankedChampions(options);
    return;
  }
  renderAramChampions(options);
}

function renderAramChampions(options = {}) {
  const champions = getVisibleChampions();
  if (options.autoSelect && champions.length && !champions.some(champion => champion.slug === state.selectedSlug)) {
    selectChampion(champions[0].slug);
  }
  els.heroCount.textContent = `${champions.length} / ${state.champions.length}`;
  els.heroList.replaceChildren();
  if (!champions.length) {
    const empty = document.createElement('div');
    empty.className = 'notice';
    empty.textContent = '没有匹配的英雄';
    els.heroList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const champion of champions) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `hero-row${champion.slug === state.selectedSlug ? ' selected' : ''}`;
    row.addEventListener('click', () => selectChampion(champion.slug));

    const rank = document.createElement('span');
    rank.className = 'hero-row-rank';
    rank.textContent = Number.isFinite(champion.rank) ? String(champion.rank) : '--';

    const img = document.createElement('img');
    img.width = 36;
    img.height = 36;
    img.loading = 'lazy';
    img.alt = champion.name;
    img.src = champion.image;

    const name = document.createElement('span');
    name.className = 'hero-row-name';
    name.textContent = champion.name || champion.opggName || champion.slug;

    const tier = createTierBadge(champion);
    tier.classList.add('hero-row-tier');

    const status = document.createElement('span');
    status.className = `hero-badge ${heroStatus(champion)}`;

    row.append(rank, img, name, tier, status);
    fragment.appendChild(row);
  }
  els.heroList.appendChild(fragment);
}

function createTierBadge(champion) {
  const span = document.createElement('span');
  span.className = `tier-badge ${Number.isFinite(champion.tier) ? `tier-${champion.tier}` : 'tier-empty'}`;
  span.textContent = Number.isFinite(champion.tier) ? `T${champion.tier}` : '未排名';
  return span;
}

function renderRankedChampions(options = {}) {
  const entries = getVisibleRankedEntries();
  const sorted = state.rankedPosition === 'all' ? sortRankedChampionsForAll(entries) : sortRankedEntries(entries);
  if (options.autoSelect && sorted.length && !sorted.some(entry => rankedKey(entry) === state.rankedSelectedKey)) {
    state.rankedSelectedKey = rankedKey(sorted[0]);
    selectRankedChampion(rankedKey(sorted[0]));
  }
  els.heroCount.textContent = `${sorted.length} / ${state.rankedEntries.length}`;
  els.heroList.replaceChildren();
  if (!sorted.length) {
    const empty = document.createElement('div');
    empty.className = 'notice';
    empty.textContent = state.rankedEntries.length ? '没有匹配的英雄' : '暂无排位数据';
    els.heroList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  let rowIndex = 0;
  for (const entry of sorted) {
    rowIndex += 1;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `hero-row ranked-row${rankedKey(entry) === state.rankedSelectedKey ? ' selected' : ''}`;
    row.addEventListener('click', () => selectRankedChampion(rankedKey(entry)));

    const rank = document.createElement('span');
    rank.className = 'hero-row-rank';
    rank.textContent = state.rankedPosition === 'all'
      ? String(rowIndex)
      : (Number.isFinite(Number(entry.rank)) ? String(entry.rank) : '--');

    const img = document.createElement('img');
    img.width = 36;
    img.height = 36;
    img.loading = 'lazy';
    img.alt = entry.name;
    img.src = entry.image;

    const nameWrap = document.createElement('span');
    nameWrap.className = 'hero-row-name-wrap';
    const name = document.createElement('span');
    name.className = 'hero-row-name';
    name.textContent = entry.name;
    nameWrap.appendChild(name);
    if (state.rankedPosition === 'all' || entry.position !== entry.mainPosition) {
      nameWrap.appendChild(createPositionBadge(entry.position));
    }

    const win = document.createElement('span');
    win.className = 'hero-row-rate';
    win.textContent = Number.isFinite(Number(entry.winRate)) ? `${Number(entry.winRate).toFixed(1)}%` : '--';

    const tier = createRankedTierBadge(entry);
    tier.classList.add('hero-row-tier');

    const status = document.createElement('span');
    status.className = `hero-badge ${rankedStatus(entry)}`;

    row.append(rank, img, nameWrap, win, tier, status);
    fragment.appendChild(row);
  }
  els.heroList.appendChild(fragment);
}

function sortRankedEntries(entries) {
  const positionIndex = (position) => {
    const index = RANKED_TIER_ORDER[position];
    return index === undefined ? 99 : index;
  };
  return [...entries].sort((a, b) => {
    if (state.rankedPosition === 'all') {
      const posDiff = positionIndex(a.position) - positionIndex(b.position);
      if (posDiff !== 0) {
        return posDiff;
      }
    }
    const ar = Number.isFinite(Number(a.rank)) ? Number(a.rank) : 99999;
    const br = Number.isFinite(Number(b.rank)) ? Number(b.rank) : 99999;
    return ar - br;
  });
}

const RANKED_TIER_ORDER = { TOP: 0, JUNGLE: 1, MID: 2, ADC: 3, SUPPORT: 4 };

window.__appState = state;
window.addEventListener('error', (event) => {
  console.error('[app]', event.message, event.filename, event.lineno);
});
