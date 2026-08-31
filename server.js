const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const OPGG_ORIGIN = 'https://op.gg';
const MODE_PREFIX = '/zh-cn/lol/modes/aram-mayhem';
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 1);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 2);
const REQUEST_DELAY = Number(process.env.REQUEST_DELAY || 220);
const CACHE_FILE = process.env.CACHE_FILE || '/data/aram-mayhem-cache.json';
const CACHE_VERSION = 1;
const REFRESH_HOUR = Number(process.env.REFRESH_HOUR || 4);
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};
const IMAGE_HOSTS = new Set([
  'opgg-static.akamaized.net',
  'ddragon.leagueoflegends.com',
  'raw.communitydragon.org'
]);
const ALIASES = {
  ahri: ['狐狸'],
  akali: ['akl'],
  alistar: ['牛头'],
  anivia: ['冰鸟'],
  annie: ['火女'],
  aurelionsol: ['龙王'],
  azir: ['沙皇'],
  blitzcrank: ['机器人'],
  brand: ['火男'],
  camille: ['卡密尔'],
  cassiopeia: ['蛇女'],
  chogath: ['大虫子'],
  corki: ['飞机'],
  darius: ['诺手'],
  diana: ['皎月'],
  drmundo: ['蒙多'],
  evelynn: ['寡妇'],
  ezreal: ['EZ', '小黄毛'],
  fiddlesticks: ['稻草人'],
  fiora: ['剑姬', 'JJ'],
  fizz: ['小鱼人'],
  garen: ['大宝剑'],
  graves: ['男枪'],
  hecarim: ['人马'],
  heimerdinger: ['大头'],
  illaoi: ['触手妈'],
  irelia: ['女刀', '女刀锋'],
  janna: ['风女'],
  jarvaniv: ['嘉文', '皇子'],
  jax: ['武器'],
  kalista: ['滑板鞋'],
  karma: ['扇子妈'],
  karthus: ['死歌'],
  katarina: ['卡特'],
  kayle: ['天使'],
  khazix: ['螳螂'],
  kogmaw: ['大嘴'],
  ksante: ['奎桑提'],
  leblanc: ['妖姬'],
  leesin: ['盲僧'],
  leona: ['日女', '阳光女孩', '女坦'],
  lillia: ['小鹿'],
  lissandra: ['冰女'],
  lucian: ['奥巴马'],
  lux: ['光辉'],
  maokai: ['大树'],
  malphite: ['石头人'],
  malzahar: ['蚂蚱'],
  masteryi: ['剑圣', '易大师'],
  missfortune: ['MF', '女枪', '好运姐'],
  monkeyking: ['猴子', '孙悟空', '悟空'],
  wukong: ['猴子', '孙悟空', '悟空'],
  mordekaiser: ['铁男'],
  nasus: ['狗头'],
  nidalee: ['豹女'],
  orianna: ['发条'],
  rammus: ['龙龟'],
  renata: ['烈娜塔'],
  renekton: ['鳄鱼'],
  rengar: ['狮子狗', '跳跳虎'],
  reksai: ['挖掘机'],
  ryze: ['流浪法师'],
  sejuani: ['猪妹'],
  sivir: ['轮子妈'],
  skarner: ['蝎子'],
  sona: ['琴女'],
  soraka: ['奶妈', '星妈'],
  shyvana: ['龙女'],
  syndra: ['球女'],
  tahmkench: ['塔姆', '蛤蟆'],
  talon: ['男刀'],
  taliyah: ['岩雀'],
  taric: ['宝石'],
  teemo: ['提百万'],
  tristana: ['小炮', '炮娘'],
  trundle: ['巨魔'],
  tryndamere: ['蛮王', '蛮子'],
  twistedfate: ['卡牌'],
  vayne: ['维恩'],
  veigar: ['小法'],
  velkoz: ['大眼'],
  vi: ['真·女拳'],
  vladimir: ['吸血鬼'],
  volibear: ['狗熊'],
  warwick: ['狼人'],
  yasuo: ['剑豪', '托儿索', '快乐风男'],
  yorick: ['掘墓'],
  ziggs: ['炸弹人']
};

// ===== 排位模式 =====
const RANKED_CACHE_FILE = process.env.RANKED_CACHE_FILE || '/data/aram-mayhem-ranked-cache.json';
const RANKED_CACHE_VERSION = 3;
const RANKED_MODE_PREFIX = '/zh-cn/lol/champions';
const RANKED_TIERS = (process.env.RANKED_TIERS
  || 'all,iron,bronze,silver,gold,gold_plus,platinum,platinum_plus,emerald,emerald_plus,diamond,diamond_plus,master,master_plus,grandmaster,challenger')
  .split(',').map((item) => item.trim()).filter(Boolean);
const RANKED_DETAIL_TIER = process.env.RANKED_DETAIL_TIER || 'emerald_plus';
const RANKED_DETAIL_LIMIT = Number(process.env.RANKED_DETAIL_LIMIT || 0);
const RANKED_POSITION_ORDER = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const RANKED_POSITION_LABELS = { TOP: '上单', JUNGLE: '打野', MID: '中单', ADC: '下路', SUPPORT: '辅助' };

let cache = null;
let refreshState = createRefreshState();
let refreshPromise = null;
let refreshTimer = null;
let bootPromise = null;

let rankedCache = null;
let rankedRefreshState = createRankedRefreshState();
let rankedRefreshPromise = null;

function createRefreshState() {
  return {
    status: 'empty',
    refreshing: false,
    reason: '',
    lastRefreshStartedAt: null,
    lastRefreshFinishedAt: null,
    lastSuccessfulRefreshAt: null,
    nextRefreshAt: null,
    lastError: '',
    progress: {
      total: 0,
      completed: 0,
      failed: 0,
      active: 0,
      done: 0
    },
    draftChampions: [],
    draftAugmentsBySlug: {},
    draftErrors: {},
    draftItemsBySlug: {},
    draftItemErrors: {}
  };
}

function createRankedRefreshState() {
  return {
    status: 'empty',
    refreshing: false,
    reason: '',
    lastError: '',
    lastRefreshStartedAt: null,
    lastRefreshFinishedAt: null,
    lastSuccessfulRefreshAt: null,
    nextRefreshAt: null,
    progress: { phase: '', total: 0, done: 0, failed: 0 },
    draftTiers: {},
    draftChampions: [],
    draftBuilds: {},
    draftItemBuilds: {},
    draftErrors: {},
    draftItemErrors: {}
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8'
  });
}

function safeStaticPath(urlPath) {
  const cleanPath = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return null;
  }
  return filePath;
}

function isAllowedOpggPath(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  if (!value.startsWith(MODE_PREFIX)) {
    return false;
  }
  if (value.includes('..') || value.includes('\\') || value.includes('://')) {
    return false;
  }
  return /^\/zh-cn\/lol\/modes\/aram-mayhem(?:\/[a-z0-9-]+\/(?:build|augments))?$/.test(value);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOpggText(remotePath) {
  const upstream = await fetchWithTimeout(`${OPGG_ORIGIN}${remotePath}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'
    }
  });
  const body = await upstream.text();
  if (!upstream.ok) {
    const error = new Error(`OP.GG 返回 ${upstream.status}`);
    error.status = upstream.status;
    throw error;
  }
  return body;
}

async function getDDragonChampions() {
  const versionsRes = await fetchWithTimeout('https://ddragon.leagueoflegends.com/api/versions.json', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json'
    }
  });
  if (!versionsRes.ok) {
    throw new Error('无法获取 Data Dragon 版本');
  }
  const versions = await versionsRes.json();
  const version = versions[0];
  const [championsRes, itemsRes] = await Promise.all([
    fetchWithTimeout(`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/champion.json`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      }
    }),
    fetchWithTimeout(`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/item.json`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      }
    })
  ]);
  if (!championsRes.ok || !itemsRes.ok) {
    throw new Error('无法获取 Data Dragon 数据');
  }
  const [champions, items] = await Promise.all([championsRes.json(), itemsRes.json()]);
  return {
    version,
    champions: Object.values(champions.data || {}),
    items: items.data || {}
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function normalizeText(value) {
  return decodeHtml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripTags(value) {
  return normalizeText(String(value || '').replace(/<[^>]*>/g, ' '));
}

function cleanImageUrl(value) {
  return decodeHtml(value || '');
}

function proxyImageUrl(value) {
  if (!value) {
    return '';
  }
  return `/api/image?url=${encodeURIComponent(cleanImageUrl(value))}`;
}

function readChampionId(image) {
  const match = cleanImageUrl(image).match(/\/champion\/([^/?]+)\.png/i);
  return match ? match[1] : '';
}

function parseChampionsFromFlight(html) {
  const arrays = extractNextPushArrays(html);
  const seen = new Map();
  for (const arrayText of arrays) {
    let data;
    try {
      data = JSON.parse(arrayText);
    } catch {
      continue;
    }
    const text = typeof data[1] === 'string' ? data[1] : '';
    if (!text.includes('"tier"') || !text.includes('"rank"') || !text.includes('image_url')) {
      continue;
    }
    let index = 0;
    while (index < text.length) {
      const keyIndex = text.indexOf('"key":', index);
      if (keyIndex === -1) {
        break;
      }
      const start = text.lastIndexOf('{', keyIndex);
      const end = start === -1 ? -1 : findBalancedEnd(text, start, '{', '}');
      if (start === -1 || end === -1) {
        index = keyIndex + 6;
        continue;
      }
      const chunk = text.slice(start, end + 1);
      if (chunk.includes('"image_url"') && chunk.includes('"tier"') && chunk.includes('"rank"')) {
        try {
          const item = JSON.parse(chunk);
          const slug = String(item.key || '').toLowerCase();
          const image = cleanImageUrl(item.image_url || '');
          if (slug && image && !seen.has(slug)) {
            seen.set(slug, {
              slug,
              opggName: item.name || slug,
              championId: String(item.id || item.champion_id || readChampionId(image) || ''),
              image: proxyImageUrl(image),
              sourceImage: image,
              tier: Number.isFinite(Number(item.tier)) ? Number(item.tier) : null,
              rank: Number.isFinite(Number(item.rank)) ? Number(item.rank) : null,
              winRate: null,
              pickRate: null,
              games: null,
              index: seen.size
            });
          }
        } catch {}
      }
      index = end + 1;
    }
  }
  return [...seen.values()].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
}

function parseChampionsFromLinks(html) {
  const seen = new Map();
  const pattern = /<a\b[^>]*href="([^"]*\/lol\/modes\/aram-mayhem\/([^/]+)\/build)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = pattern.exec(html))) {
    const slug = match[2].toLowerCase();
    if (seen.has(slug)) {
      continue;
    }
    const body = match[3];
    const imageMatch = body.match(/<img\b[^>]*src="([^"]+)"/);
    const spanMatch = body.match(/<span\b[^>]*>([\s\S]*?)<\/span>/);
    const image = imageMatch ? cleanImageUrl(imageMatch[1]) : '';
    const opggName = normalizeText(spanMatch ? spanMatch[1] : slug);
    const championId = readChampionId(image);
    seen.set(slug, {
      slug,
      opggName: opggName || slug,
      championId,
      image: proxyImageUrl(image),
      sourceImage: image,
      tier: null,
      rank: null,
      winRate: null,
      pickRate: null,
      games: null,
      index: seen.size
    });
  }
  return [...seen.values()];
}

function parseChampions(html) {
  const fromFlight = parseChampionsFromFlight(html);
  if (fromFlight.length >= 100) {
    return fromFlight;
  }
  return parseChampionsFromLinks(html);
}

function mergeChampions(champions, ddragon) {
  const byId = new Map();
  for (const champion of ddragon) {
    byId.set(normalizeKey(champion.id), champion);
  }
  return champions.map((champion) => {
    const riot = byId.get(normalizeKey(champion.championId)) || byId.get(normalizeKey(champion.slug));
    const name = riot?.name || champion.opggName;
    const title = riot?.title || '';
    const id = riot?.id || champion.championId;
    const aliases = ALIASES[champion.slug] || ALIASES[normalizeKey(id)] || [];
    const tier = Number.isFinite(Number(champion.tier)) ? Number(champion.tier) : null;
    const rank = Number.isFinite(Number(champion.rank)) ? Number(champion.rank) : null;
    const searchText = [champion.slug, champion.opggName, id, name, title, tier ? `t${tier}` : '', rank ? `#${rank}` : '', ...aliases]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return {
      slug: champion.slug,
      id,
      name,
      title,
      opggName: champion.opggName,
      image: champion.image,
      aliases,
      searchText,
      tier,
      rank,
      winRate: Number.isFinite(Number(champion.winRate)) ? Number(champion.winRate) : null,
      pickRate: Number.isFinite(Number(champion.pickRate)) ? Number(champion.pickRate) : null,
      games: Number.isFinite(Number(champion.games)) ? Number(champion.games) : null,
      augmentStatus: 'unknown'
    };
  });
}

function findBalancedEnd(text, start, open, close) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function extractNextPushArrays(html) {
  const marker = 'self.__next_f.push(';
  const arrays = [];
  let index = 0;
  while (index < html.length) {
    const markerIndex = html.indexOf(marker, index);
    if (markerIndex === -1) {
      break;
    }
    const start = html.indexOf('[', markerIndex + marker.length);
    if (start === -1) {
      break;
    }
    const end = findBalancedEnd(html, start, '[', ']');
    if (end === -1) {
      index = start + 1;
      continue;
    }
    arrays.push(html.slice(start, end + 1));
    index = end + 1;
  }
  return arrays;
}

function extractAugmentObjects(text) {
  const items = [];
  let index = 0;
  while (index < text.length) {
    const idIndex = text.indexOf('"id":', index);
    if (idIndex === -1) {
      break;
    }
    if (!text.slice(idIndex, idIndex + 900).includes('"largeIcon"')) {
      index = idIndex + 5;
      continue;
    }
    const start = text.lastIndexOf('{', idIndex);
    if (start === -1) {
      index = idIndex + 5;
      continue;
    }
    const end = findBalancedEnd(text, start, '{', '}');
    if (end === -1) {
      index = idIndex + 5;
      continue;
    }
    const chunk = text.slice(start, end + 1);
    if (chunk.includes('"largeIcon"') && chunk.includes('"rarity"') && chunk.includes('"popular"')) {
      try {
        const item = JSON.parse(chunk);
        if (item?.name && item.largeIcon && item.largeIcon.includes('/aram-augment/')) {
          items.push(normalizeAugment(item));
        }
      } catch {}
    }
    index = end + 1;
  }
  return items;
}

function parseAugmentsFromFlight(html) {
  const arrays = extractNextPushArrays(html);
  let text = '';
  for (const arrayText of arrays) {
    try {
      const data = JSON.parse(arrayText);
      if (typeof data[1] === 'string' && data[1].includes('aram-augment')) {
        text += data[1];
      }
    } catch {}
  }
  return extractAugmentObjects(text);
}

function parseAugmentsFromHtml(html) {
  const items = [];
  const iconPattern = /<img\b[^>]*(?:alt="([^"]*)"[^>]*src="([^"]*\/aram-augment\/[^"]+)"|src="([^"]*\/aram-augment\/[^"]+)"[^>]*alt="([^"]*)")[^>]*>/g;
  let match;
  while ((match = iconPattern.exec(html))) {
    const name = normalizeText(match[1] || match[4] || '');
    const icon = cleanImageUrl(match[2] || match[3] || '');
    if (!name || !icon) {
      continue;
    }
    const liStart = html.lastIndexOf('<li', match.index);
    const liEnd = html.indexOf('</li>', match.index);
    const body = liStart !== -1 && liEnd !== -1 ? html.slice(liStart, liEnd) : '';
    const rarity = htmlToRarity(body);
    items.push({
      id: `${name}|${icon}`,
      key: name,
      name,
      icon: proxyImageUrl(icon),
      rarity,
      group: rarityToGroup(rarity),
      pickRate: null,
      performance: null,
      desc: ''
    });
  }
  return items;
}

function htmlToRarity(html) {
  if (html.includes('text-red-500') || html.includes('linearGradient') || html.includes('#6B42DC') || html.includes('#FF9BD2')) {
    return 8;
  }
  if (html.includes('#EB9C00') || html.includes('text-yellow') || html.includes('text-orange')) {
    return 4;
  }
  return 1;
}

function normalizeAugment(item) {
  return {
    id: item.id,
    key: item.key,
    name: item.name,
    icon: proxyImageUrl(item.largeIcon || item.smallIcon || ''),
    rarity: Number(item.rarity),
    group: rarityToGroup(Number(item.rarity)),
    pickRate: Number.isFinite(Number(item.popular)) ? Number(item.popular) : null,
    performance: Number.isFinite(Number(item.performance)) ? Number(item.performance) : null,
    desc: stripTags(item.desc || item.tooltip || '')
  };
}

function buildAugmentResult(items, source) {
  const deduped = new Map();
  items.forEach((item, index) => {
    const key = item.id || item.key || item.name;
    if (!key || deduped.has(key)) {
      return;
    }
    deduped.set(key, {
      ...item,
      originalIndex: index,
      group: item.group || rarityToGroup(item.rarity)
    });
  });
  const groups = { silver: [], gold: [], prismatic: [] };
  for (const item of deduped.values()) {
    if (groups[item.group]) {
      groups[item.group].push(item);
    } else {
      groups.silver.push(item);
    }
  }
  const hasPickRate = [...deduped.values()].some((item) => typeof item.pickRate === 'number');
  for (const group of Object.values(groups)) {
    group.sort((a, b) => {
      if (hasPickRate) {
        return (typeof b.pickRate === 'number' ? b.pickRate : -1) - (typeof a.pickRate === 'number' ? a.pickRate : -1) || a.originalIndex - b.originalIndex;
      }
      return a.originalIndex - b.originalIndex;
    });
  }
  return {
    status: 'done',
    source,
    groups,
    count: deduped.size,
    hasPickRate
  };
}

function parseAugments(html) {
  const fromFlight = parseAugmentsFromFlight(html);
  const items = fromFlight.length ? fromFlight : parseAugmentsFromHtml(html);
  return buildAugmentResult(items, fromFlight.length ? 'opgg-flight' : 'html');
}

function parseBuildItems(tableHtml, itemNames) {
  const builds = [];
  const rows = tableHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    const classMatch = row.match(/<tr\b[^>]*class="([^"]*)"/);
    if (classMatch && /(?:^|\s)ad(?:\s|$)/.test(classMatch[1])) {
      continue;
    }
    const items = [];
    const imagePattern = /<img\b[^>]*alt="([^"]*)"[^>]*src="([^"]*\/item\/([0-9]+)\.png[^\"]*)"[^>]*>/g;
    let imageMatch;
    while ((imageMatch = imagePattern.exec(row))) {
      const name = normalizeText(imageMatch[1]);
      const icon = cleanImageUrl(imageMatch[2]);
      const id = imageMatch[3];
      if (icon) {
        items.push({ id, name: name || itemNames?.[id] || `装备 ${id}`, icon: proxyImageUrl(icon) });
      }
    }
    if (items.length) {
      builds.push({ items });
    }
  }
  return builds;
}

function parseItemsFromHtml(html, itemNames = {}) {
  const definitions = [
    { key: 'core', label: '核心装备' },
    { key: 'boots', label: '鞋子' },
    { key: 'starter', label: '出门装' }
  ];
  const sections = [];
  for (const definition of definitions) {
    const marker = `>${definition.label}</div>`;
    const start = html.indexOf(marker);
    if (start === -1) {
      continue;
    }
    const tableStart = html.indexOf('<table', start);
    const tableEnd = tableStart === -1 ? -1 : html.indexOf('</table>', tableStart);
    if (tableStart === -1 || tableEnd === -1) {
      continue;
    }
    const deduped = new Map();
    for (const build of parseBuildItems(html.slice(tableStart, tableEnd + 8), itemNames)) {
      const key = build.items.map((item) => item.id).join('-');
      if (!deduped.has(key)) {
        deduped.set(key, build);
      }
    }
    if (deduped.size) {
      sections.push({ ...definition, builds: [...deduped.values()] });
    }
  }
  return {
    status: 'done',
    source: 'opgg-html',
    sections,
    count: sections.reduce((total, section) => total + section.builds.length, 0)
  };
}

function rarityToGroup(rarity) {
  if (rarity >= 8) {
    return 'prismatic';
  }
  if (rarity >= 4) {
    return 'gold';
  }
  return 'silver';
}

// ===== 排位模式解析 =====
function extractFlightStream(html) {
  const arrays = extractNextPushArrays(html);
  let stream = '';
  for (const arrayText of arrays) {
    try {
      const data = JSON.parse(arrayText);
      if (typeof data[1] === 'string') {
        stream += data[1];
      }
    } catch {}
  }
  return stream;
}

function extractBalancedAt(stream, start, open, close) {
  const end = findBalancedEnd(stream, start, open, close);
  if (end === -1) {
    return null;
  }
  return stream.slice(start, end + 1);
}

function normalizeRankedEntry(entry, tier) {
  const image = cleanImageUrl(entry.image_url || '');
  const tierData = entry.positionTierData || {};
  return {
    slug: String(entry.key || '').toLowerCase(),
    name: entry.name || entry.key,
    image: proxyImageUrl(image),
    position: entry.positionName || '',
    winRate: Number.isFinite(Number(entry.positionWinRate)) ? Number(entry.positionWinRate) : null,
    pickRate: Number.isFinite(Number(entry.positionPickRate)) ? Number(entry.positionPickRate) : null,
    banRate: Number.isFinite(Number(entry.positionBanRate)) ? Number(entry.positionBanRate) : null,
    roleRate: Number.isFinite(Number(entry.positionRoleRate)) ? Number(entry.positionRoleRate) : null,
    tier: Number.isFinite(Number(tierData.tier ?? entry.positionTier)) ? Number(tierData.tier ?? entry.positionTier) : null,
    rank: Number.isFinite(Number(tierData.rank ?? entry.positionRank)) ? Number(tierData.rank ?? entry.positionRank) : null,
    rankPrev: Number.isFinite(Number(tierData.rank_prev)) ? Number(tierData.rank_prev) : null,
    counters: Array.isArray(entry.positionCounters)
      ? entry.positionCounters.slice(0, 3).map((counter) => ({
        key: counter.key,
        name: counter.name,
        championId: counter.champion_id,
        play: counter.play,
        win: counter.win
      }))
      : [],
    queryTier: tier
  };
}

function parseRankedTierList(html, tier) {
  const stream = extractFlightStream(html);
  const entries = [];
  const seen = new Set();
  let index = 0;
  while (true) {
    const markerIndex = stream.indexOf('"data":[', index);
    if (markerIndex === -1) {
      break;
    }
    const start = markerIndex + 7;
    const arrayText = extractBalancedAt(stream, start, '[', ']');
    if (!arrayText) {
      index = markerIndex + 8;
      continue;
    }
    index = start + arrayText.length;
    let parsed;
    try {
      parsed = JSON.parse(arrayText);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed) || !parsed.length || parsed[0]?.positionWinRate === undefined) {
      continue;
    }
    for (const item of parsed) {
      const normalized = normalizeRankedEntry(item, tier);
      if (!normalized.slug || !normalized.position) {
        continue;
      }
      const dedupeKey = `${normalized.slug}|${normalized.position}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      entries.push(normalized);
    }
  }
  return entries;
}

function pickActiveRune(rows) {
  const flat = (rows || []).flat();
  if (!flat.length) {
    return [];
  }
  const actives = flat.filter((rune) => rune.isActive);
  const chosen = actives.length ? actives : flat;
  return chosen.map((rune) => ({
    id: rune.id,
    name: rune.name,
    image: proxyImageUrl(cleanImageUrl(rune.image_url || ''))
  }));
}

function normalizeRuneOption(rune) {
  return {
    id: rune.id,
    name: rune.name,
    image: proxyImageUrl(cleanImageUrl(rune.image_url || '')),
    isActive: Boolean(rune.isActive),
    play: Number.isFinite(Number(rune.play)) ? Number(rune.play) : null,
    pickRate: Number.isFinite(Number(rune.pick_rate)) ? Number(rune.pick_rate) : null,
    winRate: Number.isFinite(Number(rune.win_rate)) ? Number(rune.win_rate) : null
  };
}

function normalizeRuneRows(rows) {
  return (rows || []).map((row) => (Array.isArray(row) ? row.map(normalizeRuneOption) : []));
}

function parseSummonerSpells(html) {
  const captionIndex = html.indexOf('SummonerSpells Table');
  if (captionIndex === -1) {
    return [];
  }
  const tableStart = html.lastIndexOf('<table', captionIndex);
  const tableEnd = html.indexOf('</table>', captionIndex);
  if (tableStart === -1 || tableEnd === -1) {
    return [];
  }
  const table = html.slice(tableStart, tableEnd);
  const rows = table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [];
  const spells = [];
  for (const row of rows) {
    const classMatch = row.match(/<tr\b[^>]*class="([^"]*)"/);
    if (classMatch && /(?:^|\s)ad(?:\s|$)/.test(classMatch[1])) {
      continue;
    }
    const iconPattern = /<img\b[^>]*alt="([^"]*)"[^>]*src="([^"]*\/spell\/[^"]+)"/g;
    const icons = [];
    let iconMatch;
    while ((iconMatch = iconPattern.exec(row))) {
      icons.push({ name: normalizeText(iconMatch[1]), image: proxyImageUrl(cleanImageUrl(iconMatch[2])) });
    }
    if (!icons.length) {
      continue;
    }
    const strongs = (row.match(/<strong[^>]*>([\s\S]*?)<\/strong>/g) || [])
      .map((s) => Number(normalizeText(s.replace(/<[^>]*>/g, '')).replace(/%/g, '')))
      .filter((v) => Number.isFinite(v));
    const playMatch = row.match(/([\d,]+)\s*场/);
    if (strongs.length < 2) {
      continue;
    }
    spells.push({
      spells: icons,
      pickRate: strongs[0],
      play: playMatch ? Number(playMatch[1].replace(/,/g, '')) : null,
      winRate: strongs[1]
    });
  }
  return spells.slice(0, 3);
}

function parseRankedSkills(html) {
  const sectionStart = html.indexOf('技能加点');
  if (sectionStart === -1) {
    return { priority: null, orders: [] };
  }
  const section = html.slice(sectionStart, sectionStart + 80000).replace(/<!--[\s\S]*?-->/g, '');
  const tokens = [];
  const tokenRe = /<strong[^>]*>\s*([QWER])\s*<\/strong>|(\d+(?:\.\d+)?)\s*%|([\d,]+)\s*场/g;
  let match;
  while ((match = tokenRe.exec(section))) {
    if (match[1]) {
      tokens.push({ type: 'letter', value: match[1] });
    } else if (match[2] !== undefined) {
      tokens.push({ type: 'percent', value: Number(match[2]) });
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'count', value: Number(match[3].replace(/,/g, '')) });
    }
  }
  const groups = [];
  let letters = [];
  for (const token of tokens) {
    if (token.type === 'letter') {
      letters.push(token.value);
      continue;
    }
    const last = groups[groups.length - 1];
    if (letters.length) {
      groups.push({ letters, pickRate: token.type === 'percent' ? token.value : null, play: null, winRate: null });
      letters = [];
    } else if (last && last.play === null && token.type === 'count') {
      last.play = token.value;
    } else if (last && last.winRate === null && token.type === 'percent') {
      last.winRate = token.value;
    }
  }
  const priorityGroup = groups[0];
  const priority = priorityGroup
    ? { order: priorityGroup.letters.slice(0, 3), pickRate: priorityGroup.pickRate, play: priorityGroup.play, winRate: priorityGroup.winRate }
    : null;
  const orders = [];
  for (const group of groups.slice(1)) {
    if (group.letters.length >= 10) {
      orders.push({ sequence: group.letters.join(''), pickRate: group.pickRate, play: group.play, winRate: group.winRate });
    }
    if (orders.length >= 2) {
      break;
    }
  }
  return { priority, orders };
}

function parseRankedRunes(html) {
  const stream = extractFlightStream(html);
  let index = 0;
  while (true) {
    const markerIndex = stream.indexOf('"data":{', index);
    if (markerIndex === -1) {
      break;
    }
    const start = markerIndex + 7;
    const objectText = extractBalancedAt(stream, start, '{', '}');
    if (!objectText) {
      index = markerIndex + 8;
      continue;
    }
    index = start + objectText.length;
    let parsed;
    try {
      parsed = JSON.parse(objectText);
    } catch {
      continue;
    }
    if (!parsed || !Array.isArray(parsed.rune_pages) || !parsed.rune_pages.length) {
      continue;
    }
    const runePages = parsed.rune_pages.slice(0, 2).map((page) => {
      const build = Array.isArray(page.builds) && page.builds.length ? page.builds[0] : {};
      return {
        play: Number.isFinite(Number(page.play)) ? Number(page.play) : null,
        pickRate: Number.isFinite(Number(page.pick_rate)) ? Number(page.pick_rate) : null,
        winRate: Number.isFinite(Number(page.win_rate)) ? Number(page.win_rate) : null,
        primaryStyle: page.primary_perk_style
          ? { id: page.primary_perk_style.id, name: page.primary_perk_style.name, image: proxyImageUrl(cleanImageUrl(page.primary_perk_style.image_url || '')) }
          : null,
        keystone: page.primary_rune
          ? { id: page.primary_rune.id, name: page.primary_rune.name, image: proxyImageUrl(cleanImageUrl(page.primary_rune.image_url || '')) }
          : null,
        subStyle: page.perk_sub_style
          ? { id: page.perk_sub_style.id, name: page.perk_sub_style.name, image: proxyImageUrl(cleanImageUrl(page.perk_sub_style.image_url || '')) }
          : null,
        mainRows: pickActiveRune(build.main_runes),
        subRows: pickActiveRune(build.sub_runes),
        shards: pickActiveRune(build.shards)
      };
    });
    const styleTrees = Array.isArray(parsed.single_rune_builds) ? parsed.single_rune_builds : [];
    const trees = {};
    for (const item of styleTrees) {
      const styleId = item.primary_perk_style?.id;
      if (!styleId) {
        continue;
      }
      trees[styleId] = {
        style: {
          id: styleId,
          name: item.primary_perk_style.name,
          image: proxyImageUrl(cleanImageUrl(item.primary_perk_style.image_url || ''))
        },
        mainRows: normalizeRuneRows(item.main_runes),
        shardRows: normalizeRuneRows(item.shards)
      };
    }
    const pageActives = (Array.isArray(parsed.rune_pages) ? parsed.rune_pages : []).slice(0, 2).map((page) => {
      const build = Array.isArray(page.builds) && page.builds.length ? page.builds[0] : {};
      return [build.main_runes, build.sub_runes, build.shards]
        .flat(2)
        .filter((rune) => rune?.isActive && rune.id !== undefined)
        .map((rune) => rune.id);
    });
    return { runePages, trees, pageActives, summonerSpells: parseSummonerSpells(html) };
  }
  return { runePages: [], trees: {}, pageActives: [], summonerSpells: [] };
}

function mergeRankedChampionInfo(entries, ddragon) {
  const bySlugKey = new Map();
  for (const champion of ddragon) {
    bySlugKey.set(normalizeKey(champion.id), champion);
  }
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.slug)) {
      grouped.set(entry.slug, []);
    }
    grouped.get(entry.slug).push(entry);
  }
  const champions = [];
  for (const [slug, group] of grouped) {
    const riot = bySlugKey.get(normalizeKey(slug));
    const main = [...group].sort((a, b) => (b.roleRate ?? -1) - (a.roleRate ?? -1))[0];
    const name = riot?.name || main.name;
    const title = riot?.title || '';
    const id = riot?.id || slug;
    const aliases = ALIASES[slug] || ALIASES[normalizeKey(id)] || [];
    const positions = RANKED_POSITION_ORDER.filter((position) => group.some((entry) => entry.position === position));
    const searchText = [slug, main.name, id, name, title, ...aliases].filter(Boolean).join(' ').toLowerCase();
    champions.push({
      slug,
      id,
      name,
      title,
      image: main.image,
      positions: positions.length ? positions : [main.position],
      mainPosition: main.position,
      aliases,
      searchText
    });
  }
  return champions;
}

function getNextRefreshDate(from = new Date()) {
  const next = new Date(from);
  next.setHours(REFRESH_HOUR, 0, 0, 0);
  if (next <= from) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function scheduleNextRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  const next = getNextRefreshDate();
  refreshState.nextRefreshAt = next.toISOString();
  refreshTimer = setTimeout(() => {
    startRefresh('scheduled').finally(() => {
      startRankedRefresh('scheduled');
    });
    scheduleNextRefresh();
  }, Math.max(1000, next.getTime() - Date.now()));
}

function resolveRankedPosition(url, slug) {
  const requested = (url.searchParams.get('position') || '').toUpperCase();
  if (RANKED_POSITION_ORDER.includes(requested)) {
    return requested;
  }
  const championInfo = (rankedCache?.champions || rankedRefreshState.draftChampions || []).find((champion) => champion.slug === slug);
  return championInfo?.mainPosition || championInfo?.positions?.[0] || '';
}

function serializeState() {
  const draftChampionCount = refreshState.draftChampions.length;
  const draftSuccessCount = Object.keys(refreshState.draftAugmentsBySlug).length;
  const draftFailedCount = Object.keys(refreshState.draftErrors).length;
  return {
    ok: true,
    mode: 'aram-mayhem',
    status: cache ? (refreshState.refreshing ? 'refreshing' : 'ready') : refreshState.status,
    refreshing: refreshState.refreshing,
    reason: refreshState.reason,
    generatedAt: cache?.generatedAt || null,
    lastUpdatedAt: cache?.generatedAt || refreshState.lastSuccessfulRefreshAt,
    lastRefreshStartedAt: refreshState.lastRefreshStartedAt,
    lastRefreshFinishedAt: refreshState.lastRefreshFinishedAt,
    lastSuccessfulRefreshAt: refreshState.lastSuccessfulRefreshAt,
    nextRefreshAt: refreshState.nextRefreshAt,
    championCount: cache?.championCount || draftChampionCount,
    successCount: cache?.successCount || draftSuccessCount,
    failedCount: cache?.failedCount || draftFailedCount,
    ddragonVersion: cache?.ddragonVersion || '',
    cacheVersion: cache?.version || CACHE_VERSION,
    lastError: refreshState.lastError,
    progress: refreshState.progress
  };
}

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || data.version !== CACHE_VERSION || !Array.isArray(data.champions) || !data.augmentsBySlug) {
      throw new Error('缓存格式不兼容');
    }
    cache = data;
    refreshState.status = 'ready';
    refreshState.lastSuccessfulRefreshAt = data.generatedAt || null;
    refreshState.lastRefreshFinishedAt = data.generatedAt || null;
    return true;
  } catch (error) {
    refreshState.status = 'empty';
    refreshState.lastError = error.code === 'ENOENT' ? '' : error.message;
    return false;
  }
}

async function saveCache(data) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  const tempFile = `${CACHE_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data), 'utf8');
  await fs.rename(tempFile, CACHE_FILE);
}

async function saveJsonFile(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data), 'utf8');
  await fs.rename(tempFile, file);
}

function startRefresh(reason) {
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = refreshAllData(reason)
    .catch((error) => {
      refreshState.status = cache ? 'ready' : 'error';
      refreshState.lastError = error.message || '刷新失败';
      refreshState.lastRefreshFinishedAt = new Date().toISOString();
    })
    .finally(() => {
      refreshState.refreshing = false;
      refreshPromise = null;
    });
  return refreshPromise;
}

async function refreshAllData(reason) {
  const started = Date.now();
  refreshState.refreshing = true;
  refreshState.reason = reason;
  refreshState.status = cache ? 'ready' : 'refreshing';
  refreshState.lastError = '';
  refreshState.lastRefreshStartedAt = new Date().toISOString();
  refreshState.progress = { total: 0, completed: 0, failed: 0, active: 0, done: 0 };

  const [homeHtml, ddragonResult] = await Promise.allSettled([
    fetchOpggText(MODE_PREFIX),
    getDDragonChampions()
  ]);
  if (homeHtml.status === 'rejected') {
    throw homeHtml.reason;
  }

  const ddragon = ddragonResult.status === 'fulfilled' ? ddragonResult.value : { version: '', champions: [], items: {} };
  const itemNames = Object.fromEntries(Object.entries(ddragon.items || {}).map(([id, item]) => [id, item.name]));
  const champions = mergeChampions(parseChampions(homeHtml.value), ddragon.champions || []);
  if (!champions.length) {
    throw new Error('未解析到英雄列表');
  }
  refreshState.draftChampions = champions;
  refreshState.draftAugmentsBySlug = {};
  refreshState.draftErrors = {};
  refreshState.draftItemsBySlug = {};
  refreshState.draftItemErrors = {};

  const augmentsBySlug = {};
  const errors = {};
  const queue = champions.map((champion) => champion.slug);
  refreshState.progress.total = queue.length;

  async function worker() {
    while (queue.length) {
      const slug = queue.shift();
      refreshState.progress.active += 1;
      try {
        const [augmentResult, itemResult] = await Promise.allSettled([
          fetchAugmentsWithRetry(slug),
          fetchItemsWithRetry(slug, itemNames)
        ]);
        if (augmentResult.status !== 'fulfilled') {
          throw augmentResult.reason;
        }
        augmentsBySlug[slug] = { slug, ...augmentResult.value };
        refreshState.draftAugmentsBySlug[slug] = augmentsBySlug[slug];
        if (itemResult.status === 'fulfilled') {
          refreshState.draftItemsBySlug[slug] = { slug, ...itemResult.value };
        } else {
          refreshState.draftItemErrors[slug] = itemResult.reason?.message || '抓取装备失败';
        }
        refreshState.progress.completed += 1;
      } catch (error) {
        errors[slug] = error.status ? `${error.status} ${error.message}` : error.message || '抓取失败';
        refreshState.draftErrors[slug] = errors[slug];
        refreshState.progress.failed += 1;
      } finally {
        refreshState.progress.active -= 1;
        refreshState.progress.done = refreshState.progress.completed + refreshState.progress.failed;
        await delay(REQUEST_DELAY + Math.random() * 180);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, () => worker()));

  if (!Object.keys(augmentsBySlug).length) {
    throw new Error('未成功抓取任何英雄增幅');
  }

  const generatedAt = new Date().toISOString();
  const data = {
    version: CACHE_VERSION,
    source: 'op.gg',
    modePath: MODE_PREFIX,
    locale: 'zh-cn',
    generatedAt,
    nextRefreshAt: refreshState.nextRefreshAt,
    durationMs: Date.now() - started,
    championCount: champions.length,
    successCount: Object.keys(augmentsBySlug).length,
    failedCount: Object.keys(errors).length,
    errors,
    ddragonVersion: ddragon.version || '',
    champions: champions.map((champion) => ({
      ...champion,
      augmentStatus: augmentsBySlug[champion.slug] ? 'done' : errors[champion.slug] ? 'error' : 'missing'
    })),
    augmentsBySlug,
    itemsBySlug: refreshState.draftItemsBySlug,
    itemErrors: refreshState.draftItemErrors
  };

  await saveCache(data);
  cache = data;
  refreshState.status = 'ready';
  refreshState.lastRefreshFinishedAt = generatedAt;
  refreshState.lastSuccessfulRefreshAt = generatedAt;
}

async function fetchAugmentsWithRetry(slug) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const html = await fetchOpggText(`${MODE_PREFIX}/${slug}/augments`);
      const parsed = parseAugments(html);
      if (!parsed.count) {
        throw new Error('未解析到增幅装置');
      }
      return parsed;
    } catch (error) {
      lastError = error;
      await delay(500 + attempt * 500);
    }
  }
  throw lastError;
}

async function fetchItemsWithRetry(slug, itemNames) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const html = await fetchOpggText(`${MODE_PREFIX}/${slug}/items`);
      const parsed = parseItemsFromHtml(html, itemNames);
      if (!parsed.count) {
        throw new Error('未解析到装备排行');
      }
      return parsed;
    } catch (error) {
      lastError = error;
      await delay(500 + attempt * 500);
    }
  }
  throw lastError;
}

// ===== 排位模式抓取 =====
async function fetchRankedTierList(tier) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const html = await fetchOpggText(`${RANKED_MODE_PREFIX}?type=ranked&tier=${encodeURIComponent(tier)}`);
      const entries = parseRankedTierList(html, tier);
      if (!entries.length) {
        throw new Error('未解析到排位榜单');
      }
      return entries;
    } catch (error) {
      lastError = error;
      await delay(600 + attempt * 600);
    }
  }
  throw lastError;
}

async function fetchRankedRunes(slug, position) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const html = await fetchOpggText(`${RANKED_MODE_PREFIX}/${slug}/build/${position.toLowerCase()}?region=global&type=ranked&tier=${RANKED_DETAIL_TIER}`);
      const parsed = parseRankedRunes(html);
      if (!parsed.runePages.length) {
        throw new Error('未解析到符文数据');
      }
      return parsed;
    } catch (error) {
      lastError = error;
      await delay(600 + attempt * 600);
    }
  }
  throw lastError;
}

async function fetchRankedItems(slug, position, itemNames) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const html = await fetchOpggText(`${RANKED_MODE_PREFIX}/${slug}/items/${position.toLowerCase()}?region=global&type=ranked&tier=${RANKED_DETAIL_TIER}`);
      const parsed = parseItemsFromHtml(html, itemNames);
      if (!parsed.count) {
        throw new Error('未解析到出装排行');
      }
      return parsed;
    } catch (error) {
      lastError = error;
      await delay(600 + attempt * 600);
    }
  }
  throw lastError;
}

async function fetchRankedSkills(slug, position) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const html = await fetchOpggText(`${RANKED_MODE_PREFIX}/${slug}/skills/${position.toLowerCase()}?region=global&type=ranked&tier=${RANKED_DETAIL_TIER}`);
      const parsed = parseRankedSkills(html);
      if (!parsed.priority && !parsed.orders.length) {
        throw new Error('未解析到技能加点');
      }
      return parsed;
    } catch (error) {
      lastError = error;
      await delay(600 + attempt * 600);
    }
  }
  throw lastError;
}

function serializeRankedState() {
  const draftSuccessCount = Object.keys(rankedRefreshState.draftBuilds).length;
  return {
    ok: true,
    mode: 'ranked',
    status: rankedCache ? (rankedRefreshState.refreshing ? 'refreshing' : 'ready') : rankedRefreshState.status,
    refreshing: rankedRefreshState.refreshing,
    reason: rankedRefreshState.reason,
    generatedAt: rankedCache?.generatedAt || null,
    lastUpdatedAt: rankedCache?.generatedAt || rankedRefreshState.lastSuccessfulRefreshAt,
    lastRefreshStartedAt: rankedRefreshState.lastRefreshStartedAt,
    lastRefreshFinishedAt: rankedRefreshState.lastRefreshFinishedAt,
    lastSuccessfulRefreshAt: rankedRefreshState.lastSuccessfulRefreshAt,
    championCount: rankedCache?.championCount || rankedRefreshState.draftChampions.length,
    successCount: rankedCache?.successCount || draftSuccessCount,
    failedCount: rankedCache?.failedCount || 0,
    detailTier: rankedCache?.detailTier || RANKED_DETAIL_TIER,
    tiersReady: rankedCache ? Object.keys(rankedCache.tiers || {}).length : Object.keys(rankedRefreshState.draftTiers).length,
    tiersTotal: RANKED_TIERS.length,
    cacheVersion: rankedCache?.version || RANKED_CACHE_VERSION,
    lastError: rankedRefreshState.lastError,
    progress: rankedRefreshState.progress
  };
}

async function loadRankedCache() {
  try {
    const raw = await fs.readFile(RANKED_CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || data.version !== RANKED_CACHE_VERSION || !data.tiers || !Array.isArray(data.champions)) {
      throw new Error('排位缓存格式不兼容');
    }
    rankedCache = data;
    rankedRefreshState.status = 'ready';
    rankedRefreshState.lastSuccessfulRefreshAt = data.generatedAt || null;
    rankedRefreshState.lastRefreshFinishedAt = data.generatedAt || null;
    return true;
  } catch (error) {
    rankedRefreshState.status = 'empty';
    rankedRefreshState.lastError = error.code === 'ENOENT' ? '' : error.message;
    return false;
  }
}

function startRankedRefresh(reason) {
  if (rankedRefreshPromise) {
    return rankedRefreshPromise;
  }
  rankedRefreshPromise = refreshRankedData(reason)
    .catch((error) => {
      rankedRefreshState.status = rankedCache ? 'ready' : 'error';
      rankedRefreshState.lastError = error.message || '排位刷新失败';
      rankedRefreshState.lastRefreshFinishedAt = new Date().toISOString();
    })
    .finally(() => {
      rankedRefreshState.refreshing = false;
      rankedRefreshPromise = null;
    });
  return rankedRefreshPromise;
}

async function refreshRankedData(reason) {
  const started = Date.now();
  rankedRefreshState.refreshing = true;
  rankedRefreshState.reason = reason;
  rankedRefreshState.status = rankedCache ? 'ready' : 'refreshing';
  rankedRefreshState.lastError = '';
  rankedRefreshState.lastRefreshStartedAt = new Date().toISOString();
  rankedRefreshState.progress = { phase: 'tiers', total: RANKED_TIERS.length, done: 0, failed: 0 };
  rankedRefreshState.draftTiers = {};
  rankedRefreshState.draftBuilds = {};
  rankedRefreshState.draftItemBuilds = {};
  rankedRefreshState.draftErrors = {};
  rankedRefreshState.draftItemErrors = {};

  const ddragonResult = await Promise.allSettled([getDDragonChampions()]);
  const ddragon = ddragonResult[0].status === 'fulfilled' ? ddragonResult[0].value : { version: '', champions: [], items: {} };
  const itemNames = Object.fromEntries(Object.entries(ddragon.items || {}).map(([id, item]) => [id, item.name]));

  const tiers = {};
  for (const tier of RANKED_TIERS) {
    try {
      tiers[tier] = await fetchRankedTierList(tier);
      rankedRefreshState.draftTiers[tier] = tiers[tier];
    } catch (error) {
      console.error(`[ranked] 抓取段位 ${tier} 失败:`, error.message);
    }
    rankedRefreshState.progress.done += 1;
    await delay(REQUEST_DELAY);
  }
  const allEntries = Object.values(tiers).flat();
  if (!allEntries.length) {
    throw new Error('未抓取到任何段位的排位榜单');
  }

  const champions = mergeRankedChampionInfo(allEntries, ddragon.champions || []);
  if (!champions.length) {
    throw new Error('未解析到排位英雄列表');
  }
  rankedRefreshState.draftChampions = champions;

  const championBySlug = new Map(champions.map((champion) => [champion.slug, champion]));
  const queue = [];
  for (const champion of champions) {
    for (const position of champion.positions) {
      queue.push({ slug: champion.slug, position });
    }
  }
  const limitedChampions = RANKED_DETAIL_LIMIT > 0 ? new Set(champions.slice(0, RANKED_DETAIL_LIMIT).map((c) => c.slug)) : null;
  const detailQueue = limitedChampions ? queue.filter((item) => limitedChampions.has(item.slug)) : queue;
  rankedRefreshState.progress = { phase: 'builds', total: detailQueue.length, done: 0, failed: 0 };

  async function worker() {
    while (detailQueue.length) {
      const item = detailQueue.shift();
      const key = `${item.slug}|${item.position}`;
      try {
        const [runeResult, itemResult, skillResult] = await Promise.allSettled([
          fetchRankedRunes(item.slug, item.position),
          fetchRankedItems(item.slug, item.position, itemNames),
          fetchRankedSkills(item.slug, item.position)
        ]);
        if (runeResult.status !== 'fulfilled') {
          throw runeResult.reason;
        }
        rankedRefreshState.draftBuilds[key] = {
          slug: item.slug,
          position: item.position,
          status: 'done',
          ...runeResult.value,
          skills: skillResult.status === 'fulfilled' ? skillResult.value : null
        };
        if (itemResult.status === 'fulfilled') {
          rankedRefreshState.draftItemBuilds[key] = {
            slug: item.slug,
            position: item.position,
            ...itemResult.value
          };
        } else {
          rankedRefreshState.draftItemErrors[key] = itemResult.reason?.message || '抓取出装失败';
        }
        rankedRefreshState.progress.done += 1;
      } catch (error) {
        rankedRefreshState.draftErrors[key] = error.message || '抓取失败';
        rankedRefreshState.progress.failed += 1;
        rankedRefreshState.progress.done += 1;
      } finally {
        await delay(REQUEST_DELAY + Math.random() * 200);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, detailQueue.length) }, () => worker()));

  const buildsBySlug = rankedRefreshState.draftBuilds;
  if (!Object.keys(buildsBySlug).length) {
    throw new Error('未成功抓取任何英雄的排位数据');
  }

  const generatedAt = new Date().toISOString();
  const data = {
    version: RANKED_CACHE_VERSION,
    mode: 'ranked',
    source: 'op.gg',
    detailTier: RANKED_DETAIL_TIER,
    generatedAt,
    durationMs: Date.now() - started,
    ddragonVersion: ddragon.version || '',
    championCount: champions.length,
    successCount: Object.keys(buildsBySlug).length,
    failedCount: Object.keys(rankedRefreshState.draftErrors).length,
    errors: rankedRefreshState.draftErrors,
    tiers,
    champions: champions.map((champion) => ({
      ...champion,
      buildStatus: champion.positions.some((position) => buildsBySlug[`${champion.slug}|${position}`]) ? 'done' : rankedRefreshState.draftErrors[`${champion.slug}|${champion.positions[0]}`] ? 'error' : 'missing',
      itemStatus: champion.positions.some((position) => rankedRefreshState.draftItemBuilds[`${champion.slug}|${position}`]) ? 'done' : rankedRefreshState.draftItemErrors[`${champion.slug}|${champion.positions[0]}`] ? 'error' : 'missing'
    })),
    buildsBySlug,
    itemBuildsBySlug: rankedRefreshState.draftItemBuilds,
    itemErrors: rankedRefreshState.draftItemErrors
  };
  await saveJsonFile(RANKED_CACHE_FILE, data);
  rankedCache = data;
  rankedRefreshState.status = 'ready';
  rankedRefreshState.lastRefreshFinishedAt = generatedAt;
  rankedRefreshState.lastSuccessfulRefreshAt = generatedAt;
}

async function handleOpgg(req, res, url) {
  const remotePath = url.searchParams.get('path');
  if (!isAllowedOpggPath(remotePath)) {
    sendJson(res, 400, { error: '不允许的 OP.GG 路径' });
    return;
  }
  try {
    const body = await fetchOpggText(remotePath);
    send(res, 200, body, { 'Content-Type': 'text/html; charset=utf-8' });
  } catch (error) {
    const message = error.name === 'AbortError' ? '请求 OP.GG 超时' : error.message;
    sendJson(res, 502, { error: message });
  }
}

async function handleDDragon(res) {
  try {
    sendJson(res, 200, await getDDragonChampions());
  } catch (error) {
    const message = error.name === 'AbortError' ? '请求 Data Dragon 超时' : error.message;
    sendJson(res, 502, { error: message });
  }
}

async function handleImage(res, url) {
  const raw = url.searchParams.get('url');
  if (!raw) {
    sendJson(res, 400, { error: '缺少图片 URL' });
    return;
  }
  let target;
  try {
    target = new URL(raw);
  } catch {
    sendJson(res, 400, { error: '非法图片 URL' });
    return;
  }
  if (target.protocol !== 'https:' || !IMAGE_HOSTS.has(target.hostname)) {
    sendJson(res, 403, { error: '不允许的图片域名' });
    return;
  }
  try {
    const upstream = await fetchWithTimeout(target.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if (!upstream.ok) {
      sendJson(res, upstream.status, { error: `图片请求失败 ${upstream.status}` });
      return;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    send(res, 200, buffer, {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400'
    });
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
}

async function handleStatic(res, pathname) {
  const filePath = safeStaticPath(pathname);
  if (!filePath) {
    send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, body, {
      'Content-Type': STATIC_TYPES[ext] || 'application/octet-stream'
    });
  } catch (error) {
    if (pathname !== '/') {
      send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }
    send(res, 500, error.message, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

const server = http.createServer(async (req, res) => {
  if (bootPromise) {
    await bootPromise;
  }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: '只支持 GET' });
    return;
  }
  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'aram-mayhem', time: new Date().toISOString() });
    return;
  }
  if (url.pathname === '/api/refresh') {
    if (url.searchParams.get('mode') === 'ranked') {
      startRankedRefresh('manual');
    } else {
      startRefresh(url.searchParams.get('force') === '1' ? 'manual' : 'manual');
    }
    sendJson(res, 202, serializeState());
    return;
  }
  if (url.pathname === '/api/state') {
    sendJson(res, 200, serializeState());
    return;
  }
  if (url.pathname === '/api/champions') {
    sendJson(res, 200, { champions: cache?.champions || refreshState.draftChampions || [] });
    return;
  }
  const augmentMatch = url.pathname.match(/^\/api\/champions\/([a-z0-9-]+)\/augments$/);
  if (augmentMatch) {
    const slug = augmentMatch[1];
    const data = cache?.augmentsBySlug?.[slug] || refreshState.draftAugmentsBySlug[slug];
    const error = cache?.errors?.[slug] || refreshState.draftErrors[slug];
    if (data) {
      sendJson(res, 200, data);
    } else if (error) {
      sendJson(res, 404, { slug, status: 'error', error });
    } else if (refreshState.refreshing) {
      sendJson(res, 202, { slug, status: 'pending' });
    } else {
      sendJson(res, cache ? 404 : 202, { slug, status: cache ? 'missing' : 'pending' });
    }
    return;
  }
  const itemsMatch = url.pathname.match(/^\/api\/champions\/([a-z0-9-]+)\/items$/);
  if (itemsMatch) {
    const slug = itemsMatch[1];
    const data = cache?.itemsBySlug?.[slug] || refreshState.draftItemsBySlug[slug];
    const error = cache?.itemErrors?.[slug] || refreshState.draftItemErrors[slug];
    if (data) {
      sendJson(res, 200, data);
    } else if (error) {
      sendJson(res, 404, { slug, status: 'error', error });
    } else if (refreshState.refreshing) {
      sendJson(res, 202, { slug, status: 'pending' });
    } else {
      sendJson(res, cache ? 404 : 202, { slug, status: cache ? 'missing' : 'pending' });
    }
    return;
  }
  if (url.pathname === '/api/image') {
    await handleImage(res, url);
    return;
  }
  if (url.pathname === '/api/ranked/state') {
    sendJson(res, 200, serializeRankedState());
    return;
  }
  if (url.pathname === '/api/ranked/champions') {
    const requestedTier = url.searchParams.get('tier');
    const tier = RANKED_TIERS.includes(requestedTier) ? requestedTier : 'emerald_plus';
    const entries = rankedCache?.tiers?.[tier] || rankedRefreshState.draftTiers?.[tier] || null;
    const champions = rankedCache?.champions || rankedRefreshState.draftChampions || [];
    const infoBySlug = new Map(champions.map((champion) => [champion.slug, champion]));
    const enriched = (entries || []).map((entry) => {
      const info = infoBySlug.get(entry.slug);
      return {
        slug: entry.slug,
        name: entry.name,
        image: entry.image,
        position: entry.position,
        mainPosition: info?.mainPosition || entry.position,
        winRate: entry.winRate,
        pickRate: entry.pickRate,
        banRate: entry.banRate,
        roleRate: entry.roleRate,
        tier: entry.tier,
        rank: entry.rank,
        rankPrev: entry.rankPrev,
        id: info?.id || entry.slug,
        title: info?.title || '',
        searchText: info?.searchText || [entry.slug, entry.name].filter(Boolean).join(' ').toLowerCase()
      };
    });
    sendJson(res, 200, { ok: true, tier, entries: enriched, championCount: champions.length });
    return;
  }
  const rankedBuildMatch = url.pathname.match(/^\/api\/ranked\/champions\/([a-z0-9-]+)\/build$/);
  if (rankedBuildMatch) {
    const slug = rankedBuildMatch[1];
    const position = resolveRankedPosition(url, slug);
    const key = position ? `${slug}|${position}` : slug;
    const data = rankedCache?.buildsBySlug?.[key] || rankedRefreshState.draftBuilds[key];
    const error = rankedCache?.errors?.[key] || rankedRefreshState.draftErrors[key];
    if (data) {
      sendJson(res, 200, data);
    } else if (error) {
      sendJson(res, 404, { slug, position, status: 'error', error });
    } else if (rankedRefreshState.refreshing) {
      sendJson(res, 202, { slug, position, status: 'pending' });
    } else {
      sendJson(res, rankedCache ? 404 : 202, { slug, position, status: rankedCache ? 'missing' : 'pending' });
    }
    return;
  }
  const rankedItemsMatch = url.pathname.match(/^\/api\/ranked\/champions\/([a-z0-9-]+)\/items$/);
  if (rankedItemsMatch) {
    const slug = rankedItemsMatch[1];
    const position = resolveRankedPosition(url, slug);
    const key = position ? `${slug}|${position}` : slug;
    const data = rankedCache?.itemBuildsBySlug?.[key] || rankedRefreshState.draftItemBuilds[key];
    const error = rankedCache?.itemErrors?.[key] || rankedRefreshState.draftItemErrors[key];
    if (data) {
      sendJson(res, 200, data);
    } else if (error) {
      sendJson(res, 404, { slug, position, status: 'error', error });
    } else if (rankedRefreshState.refreshing) {
      sendJson(res, 202, { slug, position, status: 'pending' });
    } else {
      sendJson(res, rankedCache ? 404 : 202, { slug, position, status: rankedCache ? 'missing' : 'pending' });
    }
    return;
  }
  if (url.pathname === '/api/opgg') {
    await handleOpgg(req, res, url);
    return;
  }
  if (url.pathname === '/api/ddragon/champions') {
    await handleDDragon(res);
    return;
  }
  await handleStatic(res, url.pathname);
});

async function bootstrap() {
  await loadCache();
  scheduleNextRefresh();
  if (!cache) {
    startRefresh('startup');
  }
  const rankedLoaded = await loadRankedCache();
  if (!rankedLoaded) {
    (refreshPromise || Promise.resolve()).finally(() => {
      startRankedRefresh('startup');
    });
  }
}

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  bootPromise = bootstrap();
});
