# LOL Meta Hub（海克斯大乱斗 + 排位）

英雄联盟数据查询站：抓取 OP.GG 的数据，提供中文界面 + 搜索 + 筛选。两个模式：

- **海克斯大乱斗**（ARAM Mayhem）：英雄梯度、增幅装置排行、出装推荐（源：`op.gg/zh-cn/lol/modes/aram-mayhem`）
- **排位**（ranked）：英雄×分路梯度榜（按 16 个段位筛选）、每英雄主分路的符文+出装（源：`op.gg/zh-cn/lol/champions?type=ranked`）

- 本地运行：`node server.js`（需 Node 18+，默认端口 3000，或设 `PORT` 环境变量）
- Docker 运行：`docker compose up -d --build`

## 技术要点（接手前必读）

- **零 npm 依赖**：后端是单文件 `server.js`，只用 Node 内置模块（http / fs / fetch）；前端是原生 HTML/CSS/JS，无构建步骤。
- **数据来源是 OP.GG 页面**：OP.GG 是 Next.js 站点，数据藏在 `self.__next_f.push([...])` 的 SSR flight 数据流里。解析逻辑（`parseChampionsFromFlight` / `parseAugmentsFromFlight` 等）是按文本扫描 + 括号配对（`findBalancedEnd`）从 flight 流里抠 JSON，**不是**标准 DOM 解析。如果 OP.GG 改版导致数据失效，优先检查这些函数和 `MODE_PREFIX`（当前 `/zh-cn/lol/modes/aram-mayhem`）。
- **英雄中文名**来自 Riot Data Dragon（`getDDragonChampions`，zh_CN）。注意 zh_CN 的 ddragon 数据里 `name` 字段是**称号**（如金克丝的 name 是"暴走萝莉"）、`title` 才是**本名**（"金克丝"），本项目沿用这一结构：列表显示的是称号，搜索文本里称号和本名都能搜到。
- **外号（昵称）**在 `server.js` 的 `ALIASES` 常量里手工维护，key 是 OP.GG 的 slug。补充外号时注意：称号或本名已包含的叫法（如"蜘蛛"⊂"蜘蛛女皇"、"天使"⊂"正义天使"）不必再加，搜索是子串匹配。**改 ALIASES 后必须触发一次全量刷新才会生效**（外号在 `mergeChampions` 时合并进缓存；`/api/refresh?force=1`，或等每日 4 点自动刷新，约 4~15 分钟跑完）。
- **图片走本站代理** `/api/image?url=...`，白名单 `IMAGE_HOSTS`（opgg-static / ddragon / communitydragon），新增图片域名要改这个白名单。
- OP.GG 路径白名单 `isAllowedOpggPath`，防止代理被滥用。
- **移动端视图**（2026-08-31）：≤980px 宽度下，英雄列表与详情互斥显示。未选英雄时只见列表，选中后切到详情视图（顶部出现「← 返回」按钮，点击清空选中回到列表）。通过 `body.mobile-detail-open` class 切换，桌面端不受影响。

## 文件结构

```
server.js            # 全部后端：HTTP 服务、抓取、解析、缓存、定时刷新
public/index.html    # 页面骨架
public/app.js        # 前端逻辑（渲染英雄列表 / 海克斯 / 装备 / 符文 Tab）
public/styles.css    # 样式（含移动端响应式）
Dockerfile           # node:22-alpine，把 package.json + server.js + public 打进镜像
docker-compose.yml   # 服务名 lol-meta-hub，端口 8080->3000，挂载 /data
deploy.sh            # 一键部署（服务器地址等敏感信息见 DEPLOY.local.md，不入库）
```

## 数据流与缓存

1. 启动时读缓存文件 `CACHE_FILE`（容器内 `/data/lol-meta-hub-cache.json`，约 15MB）；没有缓存则立即触发一次全量抓取。
2. 全量抓取：先抓 OP.GG 模式首页拿英雄列表（约 173 个），再逐个抓每个英雄的 `/augments` 和 `/items` 页面（串行，`MAX_CONCURRENCY=1`，带重试和随机延迟，全程约 3~4 分钟）。
3. 抓取过程中新数据先放 `refreshState.draft*`，前端能边抓边看；全部完成后原子写缓存（tmp + rename）并切换 `cache`。
4. 每天北京时间 **04:00**（`REFRESH_HOUR=4`，依赖容器 TZ=Asia/Shanghai）自动刷新一次。
5. 手动刷新：页面上「刷新页面数据」按钮，或 `curl 'http://localhost:8080/api/refresh?force=1'`。

## API

| 路径 | 说明 |
| --- | --- |
| `GET /api/health` | 健康检查 |
| `GET /api/state` | 大乱斗服务状态（是否在刷新、进度、上次/下次刷新时间） |
| `GET /api/champions` | 大乱斗全部英雄（含梯度 tier、排名 rank、中文名、搜索文本） |
| `GET /api/champions/:slug/augments` | 大乱斗该英雄的海克斯增幅（slug 如 `jinx`），刷新中返回 202 pending |
| `GET /api/champions/:slug/items` | 大乱斗该英雄的出装推荐，刷新中返回 202 pending |
| `GET /api/ranked/state` | 排位服务状态（phase: tiers/builds） |
| `GET /api/ranked/champions?tier=all` | 排位榜单（tier 可选 16 个段位 slug，默认 all），条目含分路/胜率/梯度/克制 |
| `GET /api/ranked/champions/:slug/build` | 排位该英雄符文页（`?position=TOP` 可选分路，缺省主分路） |
| `GET /api/ranked/champions/:slug/items` | 排位该英雄出装（`?position=` 同上） |
| `GET /api/refresh?force=1` | 触发大乱斗刷新；`&mode=ranked` 触发排位刷新 |
| `GET /api/image?url=` | 图片代理（仅白名单域名） |
| `GET /api/opgg?path=` | OP.GG 页面代理（仅白名单路径） |
| `GET /api/ddragon/champions` | 透传 Data Dragon 英雄+装备数据 |

## 部署

服务器地址、SSH 凭据、数据目录路径等敏感信息在本地文件 `DEPLOY.local.md`（不入 git）。

简版：

```bash
./deploy.sh
```

脚本做四件事：rsync 同步代码 → `docker compose build` → `docker compose up -d` → 健康检查。

- **代码是打进镜像的，不是挂载**：改了任何文件都必须重建镜像才生效（deploy.sh 已处理）。只有 `/data` 是持久卷。
- 服务器数据目录含两个缓存：`lol-meta-hub-cache.json`（大乱斗，~15MB）与 `lol-meta-hub-ranked-cache.json`（排位，~10MB）。重建容器不丢。

## 环境变量

见 docker-compose.yml：`PORT`、`CACHE_FILE`、`REFRESH_HOUR`（每日刷新小时）、`MAX_CONCURRENCY`、`MAX_RETRIES`、`REQUEST_DELAY`、`RANKED_TIERS`、`RANKED_DETAIL_TIER`、`RANKED_DETAIL_LIMIT`。调低并发/加延迟是为了别把 OP.GG 打挂或被封。

## 排位模式实现要点

全部走**纯 GET + SSR 解析**（无需 Server Action ID）：

1. **榜单**：`GET /zh-cn/lol/champions?type=ranked&tier={tier}`。SSR HTML 的 `self.__next_f.push` flight 流里内嵌 `"data":[...]`，每条含 `key/name/image_url/positionName/positionWinRate/PickRate/BanRate/RoleRate/positionTierData{tier,rank,rank_prev}/positionCounters`。16 个段位（`RANKED_TIERS` 常量）各抓一次，共约 260 条/段位（英雄×分路组合）。tier 值 0~5，前端显示 T{tier+1}。
2. **列表唯一化**：前端在"全部分路"时每英雄只显示主分路（roleRate 最高）一条，按 (tier, rank) 排序；选具体分路则显示该分路全部英雄并显示真实排名。
3. **详情**：抓取**全部英雄×分路**组合（缓存键 `slug|position`，约 320 组×3 请求），API `/api/ranked/champions/:slug/{build,items}?position=TOP`：
   - 符文：`GET /zh-cn/lol/champions/{slug}/build/{position}?region=global&type=ranked&tier=all`，解析 flight 里 `"data":{...}`：`rune_pages`、`single_rune_builds`（按主系分组的 5 棵天赋树）、`pageActives`、HTML 表格 `SummonerSpells Table`。
   - 出装：`GET /zh-cn/lol/champions/{slug}/items/{position}?...`，SSR HTML 表格，复用大乱斗的 `parseItemsFromHtml`。
   - 技能加点：`GET /zh-cn/lol/champions/{slug}/skills/{position}?...`，解析 SSR HTML。
4. **注意事项**：
   - 排位 win/pick 率存在 0~1 和 0~100 两种量纲，前端 `formatRate` 统一处理（≤1 视为小数）。
   - 大乱斗和排位共用 `/api/image` 图片代理与 `ALIASES` 外号表。
   - 定时刷新：每日 4 点大乱斗刷完后自动串接排位刷新；全量约 15~20 分钟。
   - 默认段位是翡翠+（emerald_plus）。

## 历史

- 2026-08-28：大幅扩充 `ALIASES` 外号表。
- 2026-08-29：上线**排位模式**，含符文树/召唤师技能/技能加点。
- 2026-08-31：项目改名 `aram-mayhem` → `lol-meta-hub`；新增移动端视图切换（列表/详情互斥显示，详情顶部加返回按钮）。
