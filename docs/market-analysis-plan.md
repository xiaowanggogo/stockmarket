# 市场分析模块 — 架构分析与详细设计方案

> 目标：在现有「A 股行情查看器」前端中新增一个独立的「市场分析」模块，包含
> - **主图 1：世界地图**（国家点击染色 + 词条叠加 + 斜条交叉图案）
> - **主图 1 副图：详情 / 编辑面板**（国家档案 + 可编辑/可扩展词条、受影响国家多选标签、颜色、勾选/全选）
> - **主图 2：知识图谱**（元素含义、元素关系、影响与传导；参考 FinDKG / TRACE，先预埋 demo）
>
> 当前阶段：**仅方案分析**，本文为详细设计，不含实现代码。

## 〇、已确认的关键决策（用户拍板）
| # | 决策点 | 结论 |
|---|---|---|
| 1 | 世界地图 GeoJSON | **英文名 GeoJSON + 中文名映射表**（维护 `geoName ↔ 中文名` 映射，点击取英文名再映射展示） |
| 2 | 数据来源策略 | **首版用本地可编辑知识库**（用户填写 + 种子），不做实时抓取；真实数据作为后续 M4 可插拔适配层 |
| 3 | 存储选型 | **SQLite** |
| 4 | 地图信息 / 知识图谱存储 | **分开存储**：地图侧 `market_analysis.db`、图谱侧 `market_kg.db`，两套 service/router 独立 |
| 5 | 知识图谱存储模型 | **参考 FinDKG（动态 KG：实体-关系带时间戳/版本/来源/置信度）+ TRACE（时序规则锚定的可解释证据链）** |
| 6 | 知识图谱显示 | **简约、克制、留白**，柔和配色，不喧宾夺主 |

---

## 一、现有架构分析

### 1.1 技术栈
- 前端：**Next.js 14（App Router）+ React 18 + TypeScript + ECharts 5.5.1**
- 后端：**FastAPI**（纯 JSON API，挂在 `/api` 下）
- 数据层：`market_data/` Python 包（akshare 封装 + SQLite 缓存），前后端共用
- 同源代理：`next.config.mjs` 把 `/api/*` 反向代理到 `127.0.0.1:8000`，前端无需处理 CORS

### 1.2 前端关键结构（已读）
| 文件 | 作用 |
|---|---|
| `app/page.tsx` | 行情主页面（单页），状态管理 + 两行 2:1 布局 + `.splitter` 高度拖拽 |
| `app/layout.tsx` | 根布局（极简，暂无全局导航） |
| `components/EChart.tsx` | **通用 ECharts 容器**：动态 `import("echarts")`（避免 SSR 触碰 window）、`group` 联动、`ResizeObserver` 防空白、**可扩展事件绑定** |
| `components/PriceChart.tsx` | 主图（K 线 + 布林/九转/支撑压力/跳空），`option` 用 `useMemo` 构建 |
| `components/SubChart.tsx` | 子图，用 **builder 注册表**（`SUB_BUILDERS`）按指标名产出 series，新增指标纯前端 |
| `components/InfoPanel.tsx` | 公司信息面板（键值行渲染范式，可直接复用为「详情面板」原型） |
| `lib/api.ts` | `fetch('/api/...')` 封装 |
| `lib/types.ts` | 前端类型定义（需新增模块类型） |
| `lib/indicators.ts` | 技术指标计算（前端算） |

### 1.3 后端关键结构（已读）
- `app.py`：`include_router(..., prefix="/api")`，`/health` 探活
- `routers/stock.py`、`routers/quote.py`、`routers/watchlist.py`：REST 风格路由
- `services/`：`market.py`（行情/信息）、`stock_universe.py`（股票宇宙）
- `config.py`：`backend_data_dir = web/backend/data`，SQLite/缓存文件都放这里
- 现有 DB：`web/backend/data/market_data.db`（行情缓存）

### 1.4 可直接复用的能力（降低改造成本）
1. **`EChart.tsx` 容器**：动态 import、ResizeObserver 防空白、group 联动都已就绪。只需新增「事件绑定」与「地图注册」支持即可用于地图与图谱。
2. **`/api` 同源代理**：新增任意 `/api/analysis/*` 路由，前端零配置即可调用。
3. **两行 2:1 布局 + `.splitter` 拖拽**：主图 1（地图）+ 副图（详情）可直接套用现有 `.main-row` 结构。
4. **`InfoPanel.tsx` 键值行范式**：详情面板的可直接借鉴。
5. **`config.backend_data_dir`**：新模块的持久化数据库放在同一 `data/` 目录，符合现有约定。

---

## 二、可行性结论

**结论：完全可以新增该模块，且改动是自洽、低侵入的。**

| 维度 | 评估 |
|---|---|
| 前端路由 | Next.js App Router 原生支持多路由 → 新增 `app/market/page.tsx`，在 `layout.tsx` 加一个全局导航即可，不影响现有行情页 |
| 世界地图 | ECharts `series.type:'map'` + `echarts.registerMap('world', geoJson)`；点击染色用 `chart.on('click')` 取 `params.name` → 设 `itemStyle.color`。**唯一前提**：ECharts 5 不再内置世界地图 GeoJSON，需自带一份 GeoJSON 资源（见 §九 待定决策） |
| 斜条交叉图案 | ECharts `itemStyle.color` 支持 `echarts.graphic.Pattern`（由离屏 canvas 生成斜条纹）。多词条重叠时动态合成图案，可行 |
| 知识图谱 | ECharts `series.type:'graph'`（节点+边+category+力导向/环形布局），**零新依赖**，天然适合 FinDKG/TRACE 式实体-关系图 |
| 数据持久化 | 新增 FastAPI router + service，SQLite 存于 `backend/data/`，与现有模式一致 |
| 编辑能力 | 纯前端表单 + 后端 CRUD 即可，无额外技术风险 |
| 性能 | 世界地图约 200+ 国家面，ECharts 渲染无压力；图谱节点数百级也可 |

**主要注意点**：① 需自带世界 GeoJSON（建议中文 `name`，便于和中文国家档案对应）；② 真实「全球信息」采集成本高、且你环境曾有上游被墙先例，**建议先用本地可编辑知识库（用户填写）**，真实数据作为后续可插拔适配层；③ 点击染色 + 斜条图案是较精细的前端工作，需预留工作量。

---

## 三、总体方案

### 3.1 路由与导航
- 新增 `app/market/page.tsx`（市场分析页）。
- 在 `app/layout.tsx` 注入一个轻量 `<Nav>`（行情 / 市场分析），两页共享。或用 `app/(root)/layout.tsx` 分组。推荐前者（改动最小）。

### 3.2 新增文件清单
```
web/frontend/
  app/market/page.tsx            # 市场分析页（状态 + 布局）
  app/market/market.css          # 本模块样式（或并入 globals.css）
  components/WorldMapChart.tsx   # 主图1：世界地图（封装 ECharts）
  components/ImpactDetailPanel.tsx # 主图1 副图：Tab(档案/词条/动态)
  components/NewsFeed.tsx        # 副图「动态」主页：相关国家最新新闻列表
  components/KnowledgeGraphChart.tsx # 主图2：知识图谱
  lib/analysisTypes.ts           # 国家档案 / 词条 / 图谱 / 新闻 类型
  lib/analysisApi.ts             # /api/analysis/* 与 /api/news 封装
  public/world.geojson           # 世界地图 GeoJSON 资源（英文 name）
web/backend/
  routers/analysis.py            # 地图侧：国家档案 + 词条 CRUD
  services/analysis_store.py     # 地图侧 SQLite 持久化 + 种子（market_analysis.db，含 news_cache 表）
  routers/kg.py                  # 图谱侧：节点/边/证据链 CRUD
  services/kg_store.py           # 图谱侧 SQLite 持久化 + 种子（market_kg.db，参考 FinDKG/TRACE）
  routers/news.py                # 新闻：按国家/相关地区聚合免费 RSS，归一化+缓存
  services/news_feed.py          # 免费新闻抓取：多路路由 + 故障切换（failover）+ 源健康度熔断 + stale 缓存兜底
  data/feeds.json                # 免费 RSS 订阅源配置（含 priority/region/timeout_ms/weight 路由字段，可换可达源）
  data/market_analysis.db        # 地图信息库（国家档案 + 词条 + news_cache）
  data/market_kg.db              # 知识图谱库（与地图信息分离存储）
```
> 前端 `EChart.tsx` 建议小改：增加 `onEvents?: Record<string,(p:any)=>void>`（在 `onReady` 里 `chart.on`）与 `mapName?`/`mapJson?`（构建前 `echarts.registerMap`）。或直接在新组件里各自 `import("echarts")`（沿用现有动态 import 范式），避免污染通用组件——**推荐后者**。

### 3.3 布局（复用现有范式）
```
┌───────────────────────── 顶部导航（行情 | 市场分析）─────────────────────────┐
├──────────────────────── 主图1 行（2:1，可拖拽 .splitter）─────────────────────┤
│  世界地图 (WorldMapChart, 2/3)        │  详情/编辑面板 (ImpactDetailPanel, 1/3) │
├──────────────────────── .splitter ───────────────────────────────────────────┤
├──────────────────────── 主图2 行（知识图谱，可独立高度）──────────────────────┤
│  知识图谱 (KnowledgeGraphChart, 全宽 或 2:1 + 节点详情侧栏)                      │
└─────────────────────────────────────────────────────────────────────────────┘
```
词条勾选/全选控制条放在地图行上方或左侧工具条。

---

## 四、主图 1：世界地图

### 4.1 技术选型
- 用 ECharts `series.type:'map'`，`map:'world'`。
- **陆地白 / 海洋蓝** 的实现：海洋本质是国界之外的空白区域，因此把图表容器背景设为蓝色（`geo` 或外层 div 背景 `#1f4e79` 或浅蓝），国家面默认 `itemStyle.color:'#ffffff'`（白），描边浅灰。选中国红、受影响国标签色、重叠斜条。
- 地图资源：浏览器首次加载时 `fetch('/world.geojson')` → `echarts.registerMap('world', json)`，再 `setOption`。GeoJSON 的 `name` 为**英文名**（如 `China`）。
- **英文名 ↔ 中文名映射**：维护一份 `countryNameMap`（如 `China→中国`、`United States→美国`），集中放在 `lib/analysisTypes.ts` 或后端常量。用途：① 点击 `params.name` 拿到英文名 → 映射成中文用于详情面板与档案存储；② 染色/词条 `affected.country` 统一存中文（用户视角），渲染时再映射回英文名匹配地图面。这样地图资源与展示语言解耦，后续换地图源不影响业务数据。

### 4.2 交互
- 点击国家：`chart.on('click', p => countryNameMap[p.name] ?? p.name)` → 拿到**中文名** → 设为「当前选中国」→ 染红；地图面染色时再反查回英文名。
- tooltip：悬停显示该国档案摘要（资源/政局/经济一句话），用中文名展示。
- 滚轮缩放/平移：`dataZoom` 或 `roam:true`（地图自带 roam 平移缩放，比 K 线 dataZoom 更自然）。

### 4.3 染色与词条叠加（核心）
**数据模型（前端态 → 后端持久化）**
```ts
interface ImpactEntry {            // 词条
  id: string;
  title: string;                  // 如「半导体出口管制」
  description: string;            // 详细描述（可扩展）
  category: string;               // 分类：资源/政局/科技/贸易/事件…
  enabled: boolean;               // 当前是否勾选生效
  affected: { country: string; color: string }[]; // 受影响国家 + 该词条标签色
}
interface CountryProfile {        // 国家档案
  name: string;                   // 与 GeoJSON name 对齐
  resources: string;              // 影响市场的资源
  politics: string;               // 政局/战争
  economy: string;                // 经济情况
  living: string;                 // 人民生活水平
  imports: string;                // 进口较多且影响市场的
  exports: string;                // 出口较多且影响市场的
  tech: string;                   // 优势科技/产业
  globalImpact: string;           // 影响全球市场的产业
  news: string;                   // 最新新闻
}
```

**染色规则（按启用词条渲染地图）**
1. 基础：所有国白色，海洋蓝。
2. 当前选中国：`#ef4444`（红）。
3. 每个 `enabled` 词条的 `affected` 国家集合，按该词条 `color` 染色。
4. **多词条重叠**：该国被 N 个启用词条覆盖 → 用 `echarts.graphic.Pattern` 生成**斜条交叉图案**，条纹颜色取自这些词条的标签色（例如两色则 45° 双色斜条；多色则循环配色斜条）。
   - 实现：`makeHatch(colors: string[])` 离屏 canvas 画对角线条纹 → `new echarts.graphic.Pattern(canvas,'repeat')` → 作为该国 `itemStyle.color`。
   - 兜底：若颜色过多难以分辨，可降级为中性网格色 + tooltip 列出所有覆盖词条。
5. 工具条提供「全选 / 全不选 / 勾选单个词条」开关，切换即重算整图染色（纯前端 `setOption`，无需回后端）。

### 4.4 后端存储（地图侧，独立库 `market_analysis.db`）
- **与知识图谱存储分离**（决策 4）：地图信息单独放 `web/backend/data/market_analysis.db`，由 `services/analysis_store.py` 管理。
- 表结构：
  - `country_profile(name TEXT PK, resources, politics, economy, living, imports, exports, tech, global_impact, news, updated_at)` —— 国家档案，**`name` 统一存中文名**（与 GeoJSON 英文名通过映射隔离）。
  - `impact_entry(id TEXT PK, title, description, category, enabled INTEGER, created_at, updated_at)` —— 词条。
  - `entry_country(entry_id, country, color)` —— 词条→受影响国家(中文名)+标签色，一对多。
  - `country_name_map(geo_name TEXT PK, cn_name TEXT)` —— 英文名↔中文名映射表（与 GeoJSON 解耦）。
- 提供 CRUD：国家档案列表/单国增改、词条增删改、受影国家关联维护。
- 种子：预置若干国家档案 + 映射若干国 + 2~3 条示例词条（如「中东局势→油价→化工」「芯片管制→半导体」），让首屏即有内容。

---

## 五、主图 1 副图：详情 / 编辑面板

复用 `InfoPanel` 键值行范式，扩展为可编辑：
- **选中国家档案区**：展示 `CountryProfile` 各字段（资源/政局/经济/生活/进出口/科技/全球影响/新闻），每行可点「编辑」就地改（textarea/input），保存 → `PUT /api/analysis/country`。
- **词条区**（与地图联动）：
  - 列表展示**所有启用/全部词条**，每条带 ☑ 勾选框、色块、标题。
  - 「全选」「全不选」按钮。
  - 点击某词条 → 在地图上高亮其受影响国家（或聚焦该国）。
  - 「＋ 新增词条」：弹表单填 标题/描述/分类 + **受影响国家多选**（下拉多选，建议用国家名列表或地图点选）+ **每个国家选一个颜色**。
  - 词条可编辑/删除。
- **联动**：在地图点选国家 → 面板自动过滤出「覆盖该国的词条」，便于从「地理」到「要素」的双向钻取。

---

## 五（附）、副图「动态 / 新闻」主页方案（前端 + 后端 + 免费抓取）

### 定位
在副图（详情/编辑面板）新增一个「**动态**」主页（Tab，默认选中，体现"主页"感），展示与「**当前选中国 + 启用词条覆盖的相关国家/地区**」相关的最新动态与新闻，帮助用户判断当地事件是否构成影响市场的卡脖子要素。这是决策 2「本地知识库」之外、把真实信息引入的**免费实时适配层**（仅新闻，不抓宏观数据）。

### 前端方案
- 副图改为 Tab：`档案` | `词条` | `动态`（动态为新增主页，默认选中）。
- 新增组件 `NewsFeed.tsx`：
  - Props：`country`（选中中文名）、`related`（启用词条覆盖的国家中文名集合）。
  - 调用 `GET /api/news?country=中国&related=美国,日本`（后端已按国家/关键词聚合 + TTL 缓存）。
  - 渲染：可滚动列表，每条 = 来源徽标 + 相对发布时间 + 标题(外链新窗口) + 1~2 行摘要 + 国家/地区标签 chips（高亮命中国家）。
  - 顶部工具条：「刷新」（超过 TTL 才真正回源，否则读缓存）、国家筛选下拉（全部 / 选中国 / 各相关国）。
  - 状态：加载中骨架、空态（确无相关新闻）、**离线态**（全源熔断，展示 `news_cache` 最近缓存并标注"离线·显示最近缓存（时间）"，**不红屏**）、错误态（友好提示）。
  - 与地图联动：切国家 / 勾选词条 → `related` 变化 → 重新拉取动态，自动聚焦相关地区新闻。
- 视觉：沿用 §6.3.1 简约风（近白底、克制色彩），与副图其余部分一致。

### 后端数据方案
- 新增 `routers/news.py`：`GET /api/news?country=&related=`（related 逗号分隔）。
- 新增 `services/news_feed.py`：**多路路由 + 故障切换 + 源健康度熔断 + 归一化 + 缓存编排**。
- 存储：在**地图侧库** `market_analysis.db` 新增两张表：
  - `news_cache(id PK, country, title, url, source, summary, published, fetched_at)`，按 `(country, url)` 去重；TTL 默认 30 分钟（配置可调）；全源熔断时的 stale 兜底来源。
  - `feeds_status(source_id PK, state, last_success, last_error, success_count, error_count, avg_ms, p90_ms, updated_at)`：记录每源实时健康度与熔断状态，支撑故障切换与 `GET /api/news/health` 观测。
- 新闻归属地图侧（与国家档案同源），**不进** `market_kg.db`。
- 国家标注：全局源按「国家关键词命中」打标（中英文名都匹配，复用 `country_name_map`）；区域源按 feed 预置 `country` 打标。
- 配置：`web/backend/data/feeds.json`（免费 RSS 源清单，可随时替换为可达源）。

### 免费新闻抓取方案（完全免费：无付费 API、无需付费 key）

#### 多路路由 + 故障切换（Failover）机制（核心）
- **路由表**：`feeds.json` 中每个源配 `priority`（优先级）、`region`（国家/区域命中标签，空=全局）、`enabled`、`timeout_ms`、`weight`。对同一查询（国家/关键词），后端解析出**一组候选源**（命中 region + 全部全局源），并按路由策略排序。
- **路由策略（可配，默认 `healthy-priority`）**：
  - `priority`：先按 `priority` 升序走高质量源；
  - `healthy-first`：叠加源健康度（见下），被墙/慢源自动降权到队尾；
  - `round-robin`：在健康源间轮询，避免单一源被限频。
- **故障切换流程**（单次 `/api/news` 请求内）：
  1. 取排序后的候选源列表，逐源尝试；
  2. 某源超时 / 报错 / 返回空 → 立即 **failover** 到下一个健康源，**不阻塞用户、不抛整页错**；
  3. 第一个成功解析到新闻的源即返回，并标记该源本次成功（更新健康度）；
  4. 全部候选源失败 → 进入**兜底层**（见下）。
- **源健康度 / 熔断（自动）**：`services/news_feed.py` 维护内存态 + `feeds_status` 表（建在 `market_analysis.db`），记录每源 `last_success / last_error / success_count / error_count / avg_ms / p90_ms / state(open|half_open|closed)`；连续失败达阈值（可配，默认 3 次）触发**熔断**，cooldown 期内该源直接跳过不再请求，冷却后发一次探测请求，成功则恢复、失败则续期熔断。→ 被墙源自动退场，健康源自动上位，无需人工换源。
- **兜底（stale 缓存）**：全部源都挂时，**不返回空**，而是回 `news_cache` 中该国家**最近一次成功抓取的结果**，并打标 `stale:true`；前端展示"离线·显示最近缓存（时间）"提示。全量失败也不影响地图/词条功能（动态只是副图一个 Tab）。
- **观测**：`GET /api/news/health` 返回各源状态/延迟/熔断情况，便于排查哪条路不通。

主路径（**无需注册、零费用**）：
1. **Google News RSS**（★ 路由优先级最高）：`https://news.google.com/rss/search?q={国家名/关键词}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`（中文）或 `&hl=en-US`（英文）。可按任意国家/关键词即查即抓，免费、无 key、覆盖全球。
2. **Bing News RSS**（同组路由的次级源）：`https://www.bing.com/news/search?q={关键词}&format=rss` —— Google 不可达时由故障切换自动接管。
3. **媒体直连 RSS**（按 `region` 路由的独立源）：BBC World、Al Jazeera、DW English、France24、NHK World、CGTN；中文可达源：新浪财经 RSS、东方财富新闻 RSS、证券时报等（注意你环境 push2 曾被墙，RSS 端点可能不同，需实测可达性，配在 `feeds.json` 即可参与路由）。
- 辅助（已依赖、免费）：`akshare` 的新闻函数（如 `stock_news_em`、`news_economic_baidu`）作为**中文市场/宏观新闻的独立路由源**，零额外成本。
- 抓取与解析：后端用 `requests`/`urllib` 拉 XML，`feedparser`（pip 免费）或标准库 `xml.etree` 解析，归一化为 `{title, url, source, summary, published}`。
- 礼貌与稳定：
  - **TTL 缓存**，避免频繁回源；同一 feed 约 30 分钟一次。
  - 尊重 `Last-Modified`/`ETag`（feedparser 提供）做条件请求。
  - 多路路由 + 故障切换已实现逐源容错，用户正常无感；仅当全源熔断才走 stale 缓存。
- 为什么"完全免费"成立：以上均为公开 RSS / 聚合 RSS / 已依赖库，无任何付费 API、无需付费 key；若不愿注册，连免费-tier keyed API（NewsAPI/GNews）都不需要。

### 风险与注意
- **可达性**：你网络环境部分上游被墙，Google News / 部分外媒 RSS 可能不稳 → 已由**多路路由 + 故障切换 + 源健康度熔断**自动应对（被墙源熔断退场、健康源上位，无需人工换源）；`feeds.json` 仍保留手动增删/调优先级能力。首次部署建议实测并保留 2~3 个可达源作为路由候选，确保至少有一个主路径通。
- **语言**：中文源给中文新闻、英文源给英文；前端按源展示，不强制翻译（避免引入付费翻译 API）。
- **合规**：仅展示标题 + 摘要 + 原文链接，不全文转载；尊重各源版权与 robots。

---

## 六、主图 2：知识图谱

### 6.1 定位与参考
- **FinDKG (Dynamic Knowledge Graphs w/ LLMs for Detecting Global Trends in Financial Markets)**：用 LLM 从非结构化文本抽取实体与关系，构建**动态**知识图谱，再在图上做趋势检测。要点：实体类型（国家/商品/行业/公司/事件/指标）、关系（影响/依赖/导致）、时序更新。
- **TRACE (Temporal Rule-Anchored Chain-of-Evidence on KGs for Interpretable Stock Movement Prediction)**：在 KG 上做**时序规则挖掘**，产出可解释的「证据链」解释股价变动。要点：关系带时间权重、可回溯传导路径。
- 本模块取其**建模思想**（实体-关系-传导-可解释），不要求首版就上 LLM/规则引擎。

### 6.2 数据模型
```ts
interface KGNode {                // 元素/实体
  id: string;
  name: string;
  category: 'country'|'commodity'|'industry'|'company'|'event'|'indicator';
  influence?: number;            // 影响力（决定节点大小）
  desc?: string;
}
interface KGEdge {                // 关系/传导
  source: string; target: string;
  relation: 'affects'|'depends_on'|'exports'|'imports'|'causes'|'chokepoint_for';
  weight?: number;               // 传导强度（边宽）
  temporal?: string;             // 时序/触发条件（TRACE 式证据锚点）
  note?: string;                 // 解释文本
}
```

### 6.3 可视化（ECharts `graph`）
- `series.type:'graph'`，`layout:'force'`（或 `circular` 便于看清传导环）。
- `categories` 按节点类型配色（国家/商品/行业/事件各一色）。
- 边：`lineStyle.width = weight`，`color` 按 relation 类型；`curveness` 让双向边不重叠。
- tooltip：点击节点显示含义；点击边显示「A 通过 <relation> 影响 B，强度 w，依据 note」。
- 可与主图 1 联动：点击地图国家 → 图谱聚焦该国家节点并高亮其出/入边（传导路径）。

### 6.3.1 视觉规范（简约，决策 6）
- **背景**：近白 `#fbfcfe`，无边框、无重网格；整体留白，不抢行情页的视觉权重。
- **配色**：类别用低饱和柔和色（如 国家=#7aa2c4、商品=#c4a77a、行业=#8ab89a、事件=#c48a8a、指标=#a99bc4），避免高对比原色。
- **节点**：圆角标签、字号小（11–12px）、非选中态半透明（opacity 0.85）；选中/聚焦态才实色加粗。
- **边**：浅灰半透明（`rgba(120,130,140,0.25)`），`curveness≈0.15` 让双向边分离；hover 高亮当前边及其两端节点，其余淡出。
- **布局**：`force` 布局但 `repulsion` 调小（温和扩散）、`edgeLength` 适中，避免节点乱飞；或 `circular` 用于看清传导环。
- **tooltip**：克制——只显示「A 通过 <关系> 影响 B｜强度 w｜依据 note」，不堆字段。
- **动效**：`animationDurationUpdate` 适度（~600ms），缩放/拖拽平滑，无炫技。

### 6.4 预埋 demo（首版即可做）
种子一张小型图，演示「元素含义 + 关系 + 传导」：
- 国家：中东、美国、中国
- 商品：原油、半导体
- 行业：化工、航运、A股半导体板块
- 事件：地缘冲突、出口管制、美联储加息
- 边示例：`中东 --chokepoint_for--> 原油 --affects--> 化工/航运 --affects--> A股相关板块`；`美国 --exports管制--> 半导体 --affects--> 中国半导体产业`；`美联储加息 --affects--> 全球流动性 --affects--> 新兴市场`。
- 这张 demo 同时可作为主图 1 词条的「底层数据」雏形。

### 6.5 演进路线（后续，非首版）
- **P2**：主图 1 词条 ↔ 图谱节点打通——国家档案/词条自动成为图谱节点与事件边。
- **P3（FinDKG 式）**：接入新闻/公告文本，用 LLM 抽取实体关系，动态更新图谱。
- **P4（TRACE 式）**：在图谱上做时序规则挖掘，对「某国要素 → 某A股板块」产出可解释证据链与预警。

### 6.6 知识图谱存储模型（参考 FinDKG / TRACE，独立库 `market_kg.db`）
> 与地图信息**分离存储**（决策 4）。图谱库由 `services/kg_store.py` 管理，表结构直接体现两篇论文的核心思想：

- **FinDKG（动态知识图谱）** → 实体与关系都是**带时间、来源、置信度的动态事实**：
  - `kg_node(id TEXT PK, name TEXT, type TEXT, influence REAL, desc TEXT, created_at, updated_at)`
  - `kg_edge(id TEXT PK, source TEXT, target TEXT, relation TEXT, weight REAL, note TEXT, confidence REAL, source_text TEXT, valid_from TEXT, valid_to TEXT, version INT, created_at)`
    - `source_text`：该关系抽取自的原始文本片段（LLM 抽取可追溯）；
    - `confidence`：抽取/推断置信度；
    - `valid_from/valid_to` + `version`：关系的时间效力区间与版本，支撑「动态」更新与回滚。
- **TRACE（时序规则锚定的可解释证据链）** → 把「传导路径」显式存为可解释链：
  - `kg_chain(id TEXT PK, title TEXT, path TEXT /* JSON：[{node, relation, node, temporal, confidence}…] */, conclusion TEXT, confidence REAL, note TEXT, created_at)`
    - `path` 即一条**带时序锚点的证据链**（如 中东→[chokepoint_for, 2024Q4]→原油→[affects]→化工→[affects]→A股化工板块）；
    - `conclusion`：该链支撑的结论（如「化工板块短期承压」），实现 TRACE 的「可解释预测」。
- 提供 CRUD：`/api/kg/nodes`、`/api/kg/edges`、`/api/kg/chains` 的增删改查；首版种子即 §6.4 的 demo 图（含 1~2 条示例 `kg_chain` 证据链），让图谱一打开就同时体现「元素含义 + 关系 + 传导 + 可解释结论」。
- 演进：P3 用 LLM 抽取写入 `kg_edge`（填 `source_text/confidence/valid_from`）；P4 在 `kg_chain` 上做时序规则挖掘自动生成证据链。

---

## 七、后端改造要点（地图 / 图谱分离）
**地图侧（决策 4 独立库）：**
- `routers/analysis.py`：`GET /api/analysis/countries`、`GET/PUT /api/analysis/country/{name}`、`GET/POST/PUT/DELETE /api/analysis/entries`、`GET/PUT /api/analysis/entry/{id}/countries`、`GET/PUT /api/analysis/name-map`。
- `services/analysis_store.py`：SQLite 库 `web/backend/data/market_analysis.db`，表 `country_profile` / `impact_entry` / `entry_country` / `country_name_map`，首次启动建表 + 种子。

**图谱侧（决策 4/5 独立库，参考 FinDKG/TRACE）：**
- `routers/kg.py`：`GET/POST/PUT/DELETE /api/kg/nodes`、`/api/kg/edges`、`/api/kg/chains`。
- `services/kg_store.py`：SQLite 库 `web/backend/data/market_kg.db`，表 `kg_node` / `kg_edge` / `kg_chain`（schema 见 §6.6），首次启动建表 + demo 种子。

**注册与约定：**
- 在 `app.py` 注册 `analysis.router` 与 `kg.router`，均 `prefix="/api"`。
- 复用 `config.backend_data_dir`，两个库都放 `web/backend/data/`。
- 两库、两 service、两 router 互不依赖，可独立演进（图谱后续接 LLM 抽取管线不影响地图侧）。

**新闻（免费适配层）**：
- `app.py` 另注册 `news.router`（`prefix="/api"`）；`feeds.json` 放 `backend_data_dir`；`news_cache` 与 `feeds_status` 两表均建在 `market_analysis.db`（与国家档案同源）。
- `services/news_feed.py` 实现**多路路由 + 故障切换**：候选源按 `feeds.json` 的 `priority/region/weight` + 实时健康度排序，逐源 failover，全源熔断时回退 `news_cache` 旧数据（标 `stale`）。
- 端点：`GET /api/news?country=&related=`、`GET /api/news/health`（各源状态/延迟/熔断观测）、`GET /api/news/feeds`（查看/重载路由表）。
- 新闻抓取失败不影响地图/图谱功能（动态只是副图一个 Tab）。

---

## 八、实施里程碑建议
| 里程碑 | 内容 | 关键交付 |
|---|---|---|
| **M1** | 路由+导航+布局+世界地图渲染+点击染红 | `market/page.tsx`、世界 GeoJSON、点击选中 |
| **M2** | 词条数据模型 + 编辑面板 + 叠加染色 + 斜条图案 + 副图「动态/新闻」主页 | 后端 CRUD、ImpactDetailPanel(Tab)、NewsFeed、免费 RSS 聚合+缓存 |
| **M3** | 知识图谱 demo | KnowledgeGraphChart + 种子图 + 与地图联动 |
| **M4（可选）** | 真实数据适配层（新闻/World Bank 等） | 可插拔采集器，替换/补充本地知识库 |

---

## 九、风险与决策状态
1. **世界 GeoJSON 来源**：✅ 已定 —— **英文名 GeoJSON + 中文名映射表**（`country_name_map`），地图资源与展示语言解耦。
2. **数据来源策略**：✅ 已定 —— 首版**本地可编辑知识库**（用户填写+种子），真实数据作为 M4 可插拔适配层（你环境曾有上游被墙先例，故不首版抓取）。
3. **存储选型**：✅ 已定 —— **SQLite**。
4. **地图 / 图谱存储分离**：✅ 已定 —— 两套独立库 `market_analysis.db` / `market_kg.db`、两套 service/router。
5. **知识图谱存储模型**：✅ 已定 —— 参考 FinDKG（动态、带来源/置信度/时间效力）+ TRACE（时序锚定可解释证据链 `kg_chain`），schema 见 §6.6。
6. **知识图谱显示**：✅ 已定 —— 简约克制（§6.3.1 视觉规范）。

**仍待实现时注意的风险（非决策项）：**
- **斜条图案上限**：重叠 3 色以上时斜条可读性取舍（图案 vs 中性网格+tooltip）。建议先支持 2~3 色清晰图案，超量降级。
- **GeoJSON 完整性**：确保自带 GeoJSON 覆盖你想分析的主要国家（小国/争议边界以数据源为准，不追求政治精确）。
- **映射维护成本**：新增国家时同步维护 `country_name_map`，避免点击/染色对不上。

---

## 十、与现有模块的关系
- 本模块是**独立新页面**，不改动行情页任何逻辑；仅 `layout.tsx` 加导航、后端加一个 router。
- 后续若想把「某国要素 → 某A股」做闭环，可在知识图谱节点上挂 A 股代码，点击跳回行情页 `app/page.tsx?code=`（预留接口即可）。
