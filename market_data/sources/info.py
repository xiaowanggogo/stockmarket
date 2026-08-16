"""股票及公司信息数据源适配器（多源冗余合并）。

数据来源（全部故障隔离，任一失败不影响整体返回）：
  - 东财 push2 (stock/get)   : 实时价/市值/PE/PB/股息率（主源，覆盖最全，但部分网络不可达）
  - 东财 emweb HSF10         : 板块/行业/H股 + 股本结构（×现价推算市值兜底，独立于 push2）
  - 新浪 hq.sinajs.cn        : 实时价/名称（独立 host，push2 不可达时的关键兜底）
  - 腾讯 qt.gtimg.cn         : 实时价/PE/PB/总市值/流通市值（独立 host，二级兜底，直给市值）
  - 百度 valuation           : 市盈率(TTM)历史序列 + 相对估值百分位
  - 东财分红派息(datacenter) : 近12月每股分红 / 现价 推算 TTM 股息率（独立于 push2）
  - 雪球 spot_xq             : 价格/市值/估值（需 XQ_A_TOKEN，优先级最高）
  - 分析师 institute         : 目标价 / 最新评级 / 评级日期
  - 英为财情 Investing.com   : 目标价/评级（可选，需 INVESTING_API_KEY + INVESTING_PAIR_ID）

设计要点：每个字段按「雪球 > 东财push2 > 腾讯/新浪/百度/emweb/东财分红」顺序取第一个非空值，
因此即使 push2 不可达，现价/市值/PE/PB/股息率 仍能从腾讯/东财股本/东财分红兜底填充。
字段缺失返回 None（前端显示「—」）；确实无免费源可取的字段已从 schema 移除。
"""
import os
import re

import pandas as pd
import requests

_EMWEB_BASE = "https://emweb.securities.eastmoney.com/PC_HSF10"
_PUSH2_BASE = "https://push2.eastmoney.com/api/qt/stock/get"
_SINA_BASE = "https://hq.sinajs.cn/list="
_TENCENT_BASE = "https://qt.gtimg.cn/q="
_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def _get_json(url, params, retries=2):
    """带重试的 GET JSON（东财偶发重置连接）。返回 dict，失败返回 {}。"""
    last = None
    for _ in range(retries + 1):
        try:
            r = requests.get(url, params=params, timeout=10, headers=_UA)
            return r.json()
        except Exception as e:  # noqa: BLE001
            last = e
    return {}


def _to_float(v):
    """安全转 float，支持东财常见的 'X亿'/'X万'/'X万亿' 中文单位字符串与千分位逗号。

    无法转换（含非数字、NaN）返回 None。
    """
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, str):
        s = v.strip()
        if s == "" or s in ("-", "--", "None"):
            return None
        s = s.replace(",", "")  # 去千分位
        factor = 1.0
        if s.endswith("万亿"):
            factor, s = 1e12, s[:-2]
        elif s.endswith("亿"):
            factor, s = 1e8, s[:-1]
        elif s.endswith("万"):
            factor, s = 1e4, s[:-1]
        try:
            f = float(s)
        except ValueError:
            return None
        val = f * factor
        return val if val == val else None
    try:
        f = float(v)
        return f if f == f else None  # 过滤 NaN
    except (ValueError, TypeError):
        return None


def _first(*vals):
    """返回第一个非 None 且非空字符串的值。"""
    for v in vals:
        if v is None:
            continue
        if isinstance(v, str) and v.strip() == "":
            continue
        return v
    return None


def _sane(v, lo, hi):
    """合理性校验：v 落在 [lo, hi] 内才返回，否则 None（防第三方字段错位/脏值）。"""
    f = _to_float(v)
    if f is None or f != f:  # NaN
        return None
    return f if lo <= f <= hi else None


def _cap_unit(v):
    """腾讯市值单位不确定：>1e11 视为已是「元」，否则视为「万元」×1e4。"""
    f = _to_float(v)
    if f is None:
        return None
    return f if f > 1e11 else f * 1e4


def _try_keys(d, keys):
    """从 dict 按候选键顺序取第一个可转为 float 的非空值。"""
    if not isinstance(d, dict):
        return None
    for k in keys:
        if k in d and d[k] not in (None, "", "-", "--"):
            val = _to_float(d[k])
            if val is not None:
                return val
    return None


def _xq_symbol(code, exchange):
    """构造雪球 symbol：交易所前缀大写 + 6 位代码。"""
    return f"{exchange.upper()}{code}"


def _fetch_xq_spot(code, exchange):
    """雪球主源：价格/市值/市盈率/市净率/股息率。需 XQ_A_TOKEN，缺省返回 {}."""
    token = os.environ.get("XQ_A_TOKEN")
    if not token:
        return {}
    import akshare as ak

    try:
        df = ak.stock_individual_spot_xq(symbol=_xq_symbol(code, exchange), token=token, timeout=10)
        if df is None or df.empty:
            return {}
        row = df.iloc[0].to_dict()
        return {
            "current_price": _to_float(row.get("当前价")),
            "market_cap": _to_float(row.get("总市值")),
            "circ_market_cap": _to_float(row.get("流通市值")),
            "pe_dynamic": _to_float(row.get("市盈率(动态)")),
            "pe_ttm": _to_float(row.get("市盈率(TTM)")),
            "pb": _to_float(row.get("市净率")),
            "dividend_yield_ttm": _to_float(row.get("股息率(TTM)")),
        }
    except Exception:
        return {}


def _fetch_em_push2(code, exchange):
    """东财 push2：实时价/市值/行业 + 估值指标（主源）。

    字段（标准 eastmoney quote 映射）：
      f43 最新价(元) | f116 总市值(元) | f117 流通市值(元) | f127 行业
      f9  市盈率(动态) | f23 市净率 | f162 市盈率(TTM)
      f163 市盈率(静态) | f164 股息率(TTM,%) | f165 股息率(静态,%)
    """
    market = "1" if exchange.lower() == "sh" else "0"
    out = {
        "industry": "", "price": None, "total_mv": None, "circ_mv": None,
        "pe_dynamic": None, "pb": None, "pe_ttm": None, "div_ttm": None,
    }
    try:
        j = _get_json(
            _PUSH2_BASE,
            {"secid": f"{market}.{code}", "ut": "fa5fd1943c7b386f172d6893dbfba10b",
             "fltt": "2", "fields": "f43,f116,f117,f127,f9,f23,f162,f164"},
        )
        d = j.get("data") or {}
        out["industry"] = d.get("f127") or ""
        out["price"] = _to_float(d.get("f43")) or None
        out["total_mv"] = _to_float(d.get("f116")) or None
        out["circ_mv"] = _to_float(d.get("f117")) or None
        out["pe_dynamic"] = _sane(d.get("f9"), -1000, 1000)
        out["pb"] = _sane(d.get("f23"), 0, 100)
        out["pe_ttm"] = _sane(d.get("f162"), -1000, 1000)
        out["div_ttm"] = _sane(d.get("f164"), 0, 100)
    except Exception:
        pass
    return out


def _fetch_sina(code, exchange):
    """新浪实时行情（独立 host）：名称 + 现价。需 Referer 头，GBK 解码。"""
    out = {"name": "", "price": None}
    try:
        r = requests.get(
            f"{_SINA_BASE}{exchange}{code}",
            headers={**_UA, "Referer": "https://finance.sina.com.cn"},
            timeout=8,
        )
        txt = r.content.decode("gbk", errors="ignore")
        m = re.search(r'hq_str_\w+="([^"]+)"', txt)
        if m:
            parts = m.group(1).split(",")
            if len(parts) > 3:
                out["name"] = parts[0]
                out["price"] = _to_float(parts[3])
    except Exception:
        pass
    return out


def _fetch_tencent(code, exchange):
    """腾讯实时行情（独立 host，qt.gtimg.cn）：名称/现价/PE(TTM)/PE(动态)/PB/总市值/流通市值。

    作为 push2 不可达时的关键兜底。GBK 解码。
    腾讯行情字段索引（社区公认映射，版本间偶有 ±2 差异）：
      [1]名字 [3]现价 [39]市盈率(TTM) [40]市盈率(动态) [41]市净率
      [45]/[47]总市值(万元) [46]/[48]流通市值(万元)
    市值索引存在歧义，故对 (45,46) 与 (47,48) 两候选对做合理性校验，取落在 A股
    合理市值区间者，错位索引会被过滤为 None 而非脏值。
    """
    out = {"name": "", "price": None, "pe_ttm": None, "pe_dynamic": None,
           "pb": None, "total_mv": None, "circ_mv": None}
    try:
        r = requests.get(f"{_TENCENT_BASE}{exchange}{code}", headers=_UA, timeout=8)
        txt = r.content.decode("gbk", errors="ignore")
        m = re.search(r'v_\w+="([^"]+)"', txt)
        if not m:
            return out
        p = m.group(1).split("~")
        if len(p) <= 48:
            return out
        out["name"] = p[1]
        out["price"] = _to_float(p[3])
        # 估值字段经严格 sane 校验，错位索引会被过滤为 None 而非脏值
        out["pe_ttm"] = _sane(p[39], -1000, 1000)
        out["pe_dynamic"] = _sane(p[40], -1000, 1000)
        out["pb"] = _sane(p[41], 0, 100)
        # 市值：两候选对（万→元），取合理者
        for mv_i, cmv_i in ((45, 46), (47, 48)):
            mv = _cap_unit(p[mv_i])
            cmv = _cap_unit(p[cmv_i])
            if mv and 1e10 <= mv <= 1e13 and cmv and 1e9 <= cmv <= 1e13:
                out["total_mv"] = mv
                out["circ_mv"] = cmv
                break
    except Exception:
        pass
    return out


def _fetch_em_capital(code, exchange):
    """东财 HSF10 股本结构：总股本/流通股（股，单位自适配），用于 ×现价 兜底市值。

    返回 {total_share, out_share}（股）。emweb 与 HSF10 同 host，独立于被挡的 push2。
    """
    out = {"total_share": None, "out_share": None}
    secu = f"{exchange.upper()}{code}"
    try:
        j = _get_json(f"{_EMWEB_BASE}/CapitalStockStructure/PageAjax", {"code": secu})
        d = j.get("data") if isinstance(j, dict) and "data" in j else j
        if not isinstance(d, dict):
            return out

        def _to_shares(v):
            f = _to_float(v)
            if f is None:
                return None
            # A股总股本数量级：1e8~1e12 为「股」；1e4~1e8 视为「万股」×1e4
            if 1e8 <= f <= 1e12:
                return f
            if 1e4 <= f < 1e8:
                return f * 1e4
            return None

        out["total_share"] = _to_shares(_try_keys(d, ["zltg", "TOTALSHARE", "ZongGuBen", "总股本"]))
        out["out_share"] = _to_shares(_try_keys(d, ["ltgs", "OUTSHARE", "LiuTongGu", "流通股"]))
    except Exception:
        pass
    return out


def _fetch_dividend_yield(code, price):
    """东财分红派息历史（datacenter-web，独立于 push2）→ 近12个月每股现金分红 / 现价 推算 TTM 股息率(%)。

    price 不可用时返回 None。无任何分红记录或解析失败返回 None。
    """
    if not price or price <= 0:
        return None
    import akshare as ak

    try:
        df = ak.stock_fhps_detail_em(symbol=code)
        if df is None or df.empty:
            return None
        df = df.copy()
        df["_ex"] = pd.to_datetime(df.get("除权除息日"), errors="coerce")
        df["_dps"] = pd.to_numeric(df.get("现金分红-现金分红比例"), errors="coerce")
        cutoff = pd.Timestamp.now() - pd.Timedelta(days=365)
        recent = df[(df["_ex"] >= cutoff) & df["_ex"].notna() & df["_dps"].notna()]
        if "方案进度" in df.columns:
            recent = recent[recent["方案进度"].astype(str).str.contains("实施", na=False)]
        dps_sum = float(recent["_dps"].sum())
        if dps_sum > 0:
            yld = dps_sum / price * 100
            return _sane(yld, 0, 30)
    except Exception:
        pass
    return None


def _fetch_em_hsf10(code, exchange):
    """东财 HSF10：板块（合并）+ 行业层级 + H 股线索 + 股本（推算市值兜底）。

    返回 {boards_text, industry_board, hk_code, hk_name, total_share, out_share}
    total_share/out_share 为东财个股总股本/流通股（股），用于 × 现价 推算总/流通市值，
    这样即使 push2 不可达，市值也能从 emweb(正常) + 新浪/腾讯现价 兜底得出。
    """
    out = {"boards_text": "", "industry_board": "", "hk_code": None, "hk_name": None,
           "total_share": None, "out_share": None}
    secu = f"{exchange.upper()}{code}"
    try:
        j = _get_json(f"{_EMWEB_BASE}/CoreConception/PageAjax", {"code": secu})
        ssbk = j.get("ssbk") or []
        names = [b.get("BOARD_NAME") for b in ssbk if b.get("BOARD_NAME")]
        if names:
            out["boards_text"] = "、".join(names)
    except Exception:
        pass

    try:
        j2 = _get_json(f"{_EMWEB_BASE}/CompanySurvey/PageAjax", {"code": secu})
        jb = (j2.get("jbzl") or [{}])[0]
        em2016 = jb.get("EM2016") or ""
        if em2016 and not out["industry_board"]:
            out["industry_board"] = em2016.split("-")[0]
        hk = jb.get("STR_CODEH")
        if hk:
            out["hk_code"] = str(hk).lstrip("0") or hk
            out["hk_name"] = jb.get("STR_NAMEH")
        # 股本候选键（东财不同页面键名不一，逐一尝试）
        out["total_share"] = _try_keys(
            jb, ["TOTALSHARE", "ZongGuBen", "总股本", "TOTAL_SHARE"])
        out["out_share"] = _try_keys(
            jb, ["OUTSHARE", "LiuTongGu", "流通股", "OUT_SHARE"])
    except Exception:
        pass

    return out


def _fetch_baidu_pe_ttm(code):
    """百度：市盈率(TTM)历史序列，返回 (latest_value, full_series)。"""
    import akshare as ak

    try:
        df = ak.stock_zh_valuation_baidu(symbol=code, indicator="市盈率(TTM)", period="近一年")
        if df is not None and not df.empty:
            series = pd.to_numeric(df["value"], errors="coerce").dropna()
            series = series[series > 0]
            if not series.empty:
                return float(series.iloc[-1]), series
    except Exception:
        pass
    return None, None


def _fetch_analyst(code):
    """分析师：目标价 / 最新评级 / 评级日期。返回 {target_price, latest_rating, rating_date}。"""
    import akshare as ak

    out = {"target_price": None, "latest_rating": None, "rating_date": None, "name": None}
    try:
        df = ak.stock_institute_recommend_detail(symbol=code)
        if df is None or df.empty:
            return out
        out["name"] = df.iloc[0].get("股票名称") or None
        df = df.copy()
        df["_date"] = pd.to_datetime(df["评级日期"], errors="coerce")
        df = df.sort_values("_date", ascending=False, na_position="last")

        latest = df.iloc[0]
        out["latest_rating"] = latest.get("最新评级") or None
        out["rating_date"] = str(latest.get("评级日期")) if pd.notna(latest.get("评级日期")) else None

        with_target = df[df["目标价"].notna()]
        if not with_target.empty:
            out["target_price"] = _to_float(with_target.iloc[0]["目标价"])
    except Exception:
        pass
    return out


def _fetch_investing(code, exchange, name):
    """英为财情(Investing.com) 可选源：分析师目标价/评级。

    需环境变量 INVESTING_API_KEY（cn.investing.com/developers 免费个人版）+ INVESTING_PAIR_ID
    （该股票在 investing.com 的标的 ID，可从个股页 URL 取得）。无 key 或任何失败均返回 {}。
    """
    key = os.environ.get("INVESTING_API_KEY")
    pair_id = os.environ.get("INVESTING_PAIR_ID")
    if not (key and pair_id):
        return {}
    try:
        headers = {"X-API-KEY": key, "Accept": "application/json",
                   "User-Agent": _UA["User-Agent"]}
        j = _get_json(
            f"https://api.investing.com/api/financialdata/{pair_id}/consensus",
            {}, retries=1,
        )
        # 不同版本返回结构不一，做容错提取
        target = _first(
            j.get("targetPrice"), (j.get("data") or {}).get("targetPrice")
        )
        rating = _first(
            j.get("rating"), (j.get("data") or {}).get("rating")
        )
        if target is None and rating is None:
            return {}
        return {"target_price": _to_float(target), "latest_rating": str(rating) if rating else None}
    except Exception:
        return {}


def _fetch_gtn_hk(hk_code):
    """A+H 股的港股实时价格（东财 push2）。best-effort。"""
    if not hk_code:
        return None
    try:
        j = _get_json(
            _PUSH2_BASE,
            {"secid": f"116.{hk_code}", "ut": "fa5fd1943c7b386f172d6893dbfba10b",
             "fields": "f43,f57,f58"},
        )
        d = j.get("data") or {}
        return _to_float(d.get("f43"))
    except Exception:
        return None


def _contributed(d, keys):
    """判断某源是否返回了任一有效字段（用于标注 data_sources）。"""
    return any(d.get(k) is not None for k in keys)


def fetch_info(code, exchange="sh"):
    """获取股票及公司信息，返回单行 DataFrame。

    code     : 纯 6 位代码（如 '600519'）
    exchange : 'sh' / 'sz' / 'bj'
    """
    sources = []

    # 1. 雪球主源（需 token）
    xq = _fetch_xq_spot(code, exchange)
    if _contributed(xq, ["price", "market_cap", "pe_ttm"]):
        sources.append("雪球")

    # 2. 东财 push2（主源）
    push2 = _fetch_em_push2(code, exchange)
    if _contributed(push2, ["price", "total_mv", "pe_ttm"]):
        sources.append("东财")

    # 3. 新浪（独立 host 兜底）
    sina = _fetch_sina(code, exchange)
    if _contributed(sina, ["price"]):
        sources.append("新浪")

    # 4. 腾讯（独立 host 兜底）
    tencent = _fetch_tencent(code, exchange)
    if _contributed(tencent, ["price", "pe_ttm", "pb", "total_mv"]):
        sources.append("腾讯")

    # 5. 东财 HSF10：板块/行业/H股
    hsf10 = _fetch_em_hsf10(code, exchange)
    if _contributed(hsf10, ["industry_board", "boards_text"]):
        sources.append("东财HSF10")

    # 5b. 东财 HSF10 股本结构（×现价 兜底市值，独立于 push2）
    capital = _fetch_em_capital(code, exchange)
    if _contributed(capital, ["total_share", "out_share"]):
        sources.append("东财股本")

    # 6. 百度 PE(TTM) + 相对估值百分位
    baidu_pe, pe_series = _fetch_baidu_pe_ttm(code)
    if baidu_pe is not None:
        sources.append("百度")
    relative_val = None
    if baidu_pe is not None and pe_series is not None and len(pe_series) > 10:
        relative_val = round(float((pe_series <= baidu_pe).sum() / len(pe_series) * 100), 1)

    # 7. 分析师：目标价/评级/日期
    analyst = _fetch_analyst(code)
    if _contributed(analyst, ["target_price", "latest_rating"]):
        sources.append("分析师")

    # 8. 英为财情（可选）
    investing = _fetch_investing(code, exchange, analyst.get("name"))
    if _contributed(investing, ["target_price", "latest_rating"]):
        sources.append("英为财情")

    # 9. 恒生 GTN 港股补充价格
    hk_price = _fetch_gtn_hk(hsf10["hk_code"]) if hsf10["hk_code"] else None

    # ---- 合并：按优先级填充 ----
    name = _first(sina.get("name"), tencent.get("name"),
                  analyst.get("name"), xq.get("name")) or code

    price = _first(xq.get("current_price"), push2.get("price"), sina.get("price"), tencent.get("price"))

    # 市值：雪球 > push2 > 腾讯(直给) > emweb 股本×现价（均带合理性校验）
    em_mv = capital.get("total_share") and price and capital["total_share"] * price
    em_cmv = capital.get("out_share") and price and capital["out_share"] * price
    if em_mv is not None and not (1e10 <= em_mv <= 1e13):
        em_mv = None
    if em_cmv is not None and not (1e9 <= em_cmv <= 1e13):
        em_cmv = None
    market_cap = _first(xq.get("market_cap"), push2.get("total_mv"), tencent.get("total_mv"), em_mv)
    circ_market_cap = _first(xq.get("circ_market_cap"), push2.get("circ_mv"), tencent.get("circ_mv"), em_cmv)

    # 估值：雪球 > push2 > 百度/腾讯/新浪
    pe_ttm = _first(xq.get("pe_ttm"), push2.get("pe_ttm"), baidu_pe, tencent.get("pe_ttm"))
    pe_dynamic = _first(xq.get("pe_dynamic"), push2.get("pe_dynamic"), tencent.get("pe_dynamic"))
    pb = _first(xq.get("pb"), push2.get("pb"), tencent.get("pb"))

    # 股息率(TTM)：雪球 > push2 > 东财分红历史推算
    div_yield = _fetch_dividend_yield(code, price)
    if div_yield is not None:
        sources.append("东财分红")
    dividend_yield_ttm = _first(xq.get("dividend_yield_ttm"), push2.get("div_ttm"), div_yield)

    industry_board = _first(hsf10["industry_board"], push2.get("industry"))

    # 分析师 / 英为财情：英为财情作为补充（仅当分析师缺时启用）
    target_price = _first(analyst["target_price"], investing.get("target_price"))
    latest_rating = _first(analyst["latest_rating"], investing.get("latest_rating"))
    rating_date = analyst["rating_date"]

    # 非行业板块
    concept_boards = ""
    if hsf10["boards_text"]:
        non_industry = [b for b in hsf10["boards_text"].split("、") if b and b != industry_board]
        concept_boards = "、".join(non_industry)

    return pd.DataFrame(
        [
            {
                "name": name,
                "code": code,
                "current_price": price,
                "market_cap": market_cap,
                "circ_market_cap": circ_market_cap,
                "pe_dynamic": pe_dynamic,
                "pe_ttm": pe_ttm,
                "pb": pb,
                "dividend_yield_ttm": dividend_yield_ttm,
                "relative_valuation": relative_val,
                "industry_board": industry_board,
                "concept_boards": concept_boards,
                "boards": hsf10["boards_text"],
                "target_price": target_price,
                "latest_rating": latest_rating,
                "rating_date": rating_date,
                "hk_code": hsf10["hk_code"],
                "hk_name": hsf10["hk_name"],
                "hk_price": hk_price,
                "data_sources": "、".join(sources),
            }
        ]
    )
