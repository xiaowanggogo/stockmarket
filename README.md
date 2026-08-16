# 📈 stockmarket — A 股行情查看与分析工具

一个开箱即用的 A 股看盘工具：输入股票代码即可查看 **K 线主图 + 多种技术指标子图 + 实时分时 + 公司基本面信息**。
后端基于 FastAPI 提供 JSON 接口，前端基于 Next.js + ECharts 做可视化，数据通过 [`market_data`](./market_data) Python 包从多个公开数据源获取并做本地缓存与故障切换。

> 💡 **本文档由 [WorkBuddy](https://workbuddy.ai)（你的 AI 全栈开发助手）撰写并维护**——从需求拆解、多源数据接入、前端可视化到一键启动脚本，全程 AI 驱动交付。你也可以用自然语言让 WorkBuddy 继续扩展它（加指标、改布局、接新数据源等）。

---

## 一、整体架构

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   前端  Next.js :3000     │  /api/* │   后端  FastAPI :8000      │
│   ECharts 可视化 + 交互    │ ──────▶ │   纯 JSON API（/api 前缀）  │
│   (web/frontend)          │  同源代理 │   (web/backend)            │
└─────────────────────────┘         └────────────┬─────────────┘
                                                  │ 调用
                                                  ▼
                                    ┌─────────────────────────────┐
                                    │  market_data 数据包（仓库根）  │
                                    │  日线 / 分时 / 公司信息        │
                                    │  + 多源故障切换 + SQLite 缓存  │
                                    └────────────┬────────────────┘
                                                  │ HTTPS
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                         腾讯 / 东方财富      新浪 / 百度        雪球 / 英为财情（可选）
                         / 东财分红派息       / 分析师            （需 token / key）
```

浏览器只访问同源的 `/api/*`，由 Next.js 在服务器端反向代理到后端，天然规避跨域；后端地址可用环境变量 `BACKEND_URL` 覆盖。

---

## 二、功能模块

| 模块 | 说明 | 入口 |
| --- | --- | --- |
| **K 线主图** | 日线 OHLC + 成交量，支持前/后复权、缩放、拖动，主图可叠加布林线/支撑压力等 | 前端 `components/PriceChart.tsx` |
| **技术指标子图** | MA / MACD / RSI / KDJ / BOLL 等，全部在**前端计算**（`lib/indicators.ts`），后端零改动即可扩展 | 前端 `components/SubChart.tsx` |
| **实时分时** | 最近一个交易日的 1/5/15/30/60 分钟走势 | 前端 `components/IntradayChart.tsx` + 后端 `/api/quote/status` |
| **公司信息面板** | 现价、总/流通市值、PE(TTM/动态)、PB、股息率、相对估值分位、行业、所属板块、目标价/评级、港股参考 | 前端 `components/InfoPanel.tsx` + 后端 `/api/stock/info` |
| **股票搜索** | 按代码 / 名称 / 全拼 / 拼音首字母模糊搜索，自动补全 | 后端 `/api/stock/search` |
| **数据层 `market_data`** | 统一封装三大能力，可独立作为 Python 库调用 | `market_data/__init__.py` |

---

## 三、外部数据源（按功能）

### 1. 历史日线（`stock_data`）
故障切换顺序：**腾讯证券 → 东方财富 → 新浪财经**。任一可用即采用；结果写入本地 SQLite 避免重复请求。

### 2. 分时数据（`stock_status`）
故障切换顺序：**东方财富（`stock_zh_a_hist_min_em`，含成交额）→ 新浪（`stock_zh_a_minute`，无成交额）**。

### 3. 公司信息（`stock_info`）— 多源冗余合并
每个字段按「**雪球 → 东财 push2 → 腾讯 / 新浪 / 百度 / 东财 HSF10 / 东财分红派息**」取第一个非空值，因此即使某个源在你的网络不可达，大多数字段仍能从其他源兜底填充。

| 数据源 | 提供内容 | 备注 |
| --- | --- | --- |
| 雪球 `stock_individual_spot_xq` | 价格/市值/估值（最全） | 需 `XQ_A_TOKEN`，优先级最高 |
| 东财 push2 `stock/get` | 实时价/市值/PE/PB/股息率 | 主源，但部分网络环境下整体不可达 |
| 东财 emweb HSF10 | 板块/行业/H股 + 股本结构（×现价推算市值兜底） | 独立于 push2 |
| 新浪 `hq.sinajs.cn` | 实时价 / 名称 | 独立 host，push2 不可达时的关键兜底 |
| 腾讯 `qt.gtimg.cn` | 实时价 / PE / PB / 总市值 / 流通市值 | 独立 host，直给市值 |
| 百度 valuation | 市盈率(TTM) 历史序列 + 相对估值百分位 | — |
| 东财分红派息 `datacenter-web` | 近 12 月每股分红 ÷ 现价 推算 TTM 股息率 | 独立于 push2 |
| 分析师 `stock_institute_recommend_detail` | 目标价 / 最新评级 / 评级日期 | 仅被覆盖的个股有值 |
| 英为财情 Investing.com | 目标价 / 评级（补充） | 可选，需 `INVESTING_API_KEY` + `INVESTING_PAIR_ID` |

> 接口底部「数据来源」小字会列出本次实际成功命中的源，方便排查某个源是否在你网络下不通。

---

## 四、项目结构

```
stockmarket/
├── start.ps1                 # Windows 一键启动（后端+前端+浏览器）
├── requirements.txt          # Python 依赖：akshare, pandas
├── market_data/              # 数据层 Python 包（前后端共用）
│   ├── __init__.py           # 对外接口：stock_data / stock_status / stock_info
│   ├── config.py             # 列顺序、源切换顺序、数据目录等常量
│   ├── stock_data.py         # 日线（SQLite 缓存 + 故障切换）
│   ├── stock_status.py       # 分时
│   ├── stock_info.py         # 公司信息入口
│   ├── sources/              # 各数据源适配器
│   │   ├── tencent.py eastmoney.py sina.py minute.py
│   │   └── info.py           # 公司信息多源冗余合并
│   ├── storage/sqlite_store.py  # 本地行情缓存
│   └── core/                 # 日志、归一化工具
├── web/
│   ├── backend/              # FastAPI 服务
│   │   ├── app.py            # 应用入口（/health 探活）
│   │   ├── routers/          # stock.py（搜索/信息）、quote.py（行情/分时）
│   │   ├── services/         # market.py（封装 market_data）、stock_universe.py（股票池缓存）
│   │   └── data/             # 运行期生成：market_data.db、market_data.log、stocks.json
│   └── frontend/             # Next.js 前端
│       ├── app/              # page.tsx（主页面）、globals.css
│       ├── components/       # PriceChart / SubChart / IntradayChart / InfoPanel / StockSearch / EChart
│       ├── lib/              # api.ts、types.ts、indicators.ts（指标计算）
│       ├── next.config.mjs   # /api 反向代理到后端
│       └── package.json
└── data/                     # 作为 Python 库单独调用时的默认缓存目录（web 服务改用 web/backend/data）
```

---

## 五、环境要求

- **Python** ≥ 3.10（已验证 3.10 / 3.13）
- **Node.js** ≥ 18（已验证 22.x）
- 安装 Python 依赖：`pip install -r requirements.txt`（含 `akshare`、`pandas`）
- 安装前端依赖：`cd web/frontend && npm install`
- 联网（从上面列出的数据源拉取行情）

---

## 六、配置项

所有配置通过**环境变量**传入（进程启动时设置，无需配置文件）：

| 变量 | 作用 | 默认值 | 必填 |
| --- | --- | --- | --- |
| `XQ_A_TOKEN` | 雪球 token，启用雪球作为公司信息主源（更全的估值/股息率） | 无（缺省则跳过雪球） | 否 |
| `INVESTING_API_KEY` | 英为财情 open API key（补充目标价/评级） | 无（缺省则跳过） | 否 |
| `INVESTING_PAIR_ID` | 英为财情上该股票对应的 pair id | 无 | 否（与 key 同用） |
| `BACKEND_URL` | 前端反代指向的后端地址 | `http://127.0.0.1:8000` | 否 |

PowerShell 临时设置示例：
```powershell
$env:XQ_A_TOKEN = "你的雪球token"
```

> 不设置任何可选变量也能正常运行——只是公司信息会回落到东财/腾讯/新浪/百度/分红派息等免费源。

---

## 七、使用方法

### 方式 A：一键启动（Windows）
在项目根目录运行 PowerShell：
```powershell
.\start.ps1
```
脚本会：释放被占用的 8000/3000 端口 → 启动后端 → 等待就绪 → 启动前端 → 打开浏览器 `http://localhost:3000`。
关闭弹出的两个服务窗口即可停止。

### 方式 B：手动启动
```bash
# 1) 后端（终端 1）
cd stockmarket
python -m uvicorn web.backend.app:app --port 8000

# 2) 前端（终端 2）
cd stockmarket/web/frontend
npm run dev
```
打开 `http://localhost:3000`，搜索框输入代码（如 `600519` 或 `贵州茅台`）即可。

### 方式 C：作为 Python 库调用
```python
from market_data import stock_data, stock_status, stock_info

# 日线（前复权）
df = stock_data("600519", "20230101", "20231231", adjust="qfq")

# 分时（最近交易日 1 分钟）
df = stock_status("600519", period="1", adjust="qfq")

# 公司信息
info = stock_info("600519")
print(info["name"], info["current_price"], info["pe_ttm"])
```

---

## 八、后端 API 一览

所有接口挂在 `/api` 下，返回 JSON。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 探活（返回股票池数量） |
| GET | `/api/quote/history?code=&start=&end=&adjust=` | 历史日线 |
| GET | `/api/quote/status?code=&period=&adjust=` | 最近交易日分时 |
| GET | `/api/stock/info?code=` | 公司信息 |
| GET | `/api/stock/search?q=&limit=` | 股票模糊搜索 |
| GET | `/api/stock/resolve?code=` | 代码解析名称 |
| GET | `/api/stock/list?offset=&limit=` | 分页列出股票池 |
| POST | `/api/stock/universe/refresh` | 强制刷新全量股票列表缓存 |

---

## 九、数据存储位置

| 数据 | 路径 | 说明 |
| --- | --- | --- |
| 行情 SQLite 缓存 | `web/backend/data/market_data.db` | 日线/分时被查询后写入，减少重复上游请求 |
| 行情诊断日志 | `web/backend/data/market_data.log` | 各源调用与故障切换记录 |
| 股票池缓存 | `web/backend/data/stocks.json` | 全量 A 股代码/名称/拼音，首次启动抓取并缓存（< 3000 条视为不完整会重建） |
| 临时缓存 | 仓库根 `data/`、`_q.json` | 作为 Python 库单独调用时生成；已被 `.gitignore` 忽略，不入库 |

以上 `web/backend/data/` 均由服务运行期自动生成，已加入 `.gitignore`。

---

## 十、常见问题

- **某些公司信息字段显示「—」**：说明所有可用源都未返回该字段。可看面板底部「数据来源」确认哪些源命中；配置 `XQ_A_TOKEN` 通常能补上更全的估值/股息率。
- **端口被占用**：用 `start.ps1` 会自动释放；或手动结束占用 8000 / 3000 的进程后重启。
- **前端打开空白**：优先看浏览器 DevTools Console 红色报错；可 `Ctrl+Shift+R` 强刷，或删除 `web/frontend/.next` 后重启 dev。
- **股票搜不到**：首次启动会自动抓取全量列表；也可用 `POST /api/stock/universe/refresh` 强制刷新。

---

## 十一、技术栈

- 后端：Python · FastAPI · uvicorn · akshare · pandas · SQLite
- 前端：Next.js 14 · React 18 · TypeScript · ECharts 5
- 数据：腾讯证券 / 东方财富 / 新浪财经 / 百度 / 雪球 / 英为财情（多源冗余）

---

🤖 *Maintained with [WorkBuddy](https://workbuddy.ai) — 用自然语言即可让 AI 助手继续扩展本项目。*
