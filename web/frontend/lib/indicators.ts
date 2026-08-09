// 技术指标计算器（前端计算，后端只回传原始 OHLCV，保证后端稳定可扩展）。
// 后续新增指标：在 indicators.ts 增加函数，并在 components/SubChart.tsx 的 SUB_BUILDERS 注册即可。

export function ma(values: (number | null)[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) {
      out.push(null);
      continue;
    }
    sum += v;
    count++;
    if (i >= n) {
      const dropped = values[i - n];
      if (dropped != null) {
        sum -= dropped;
        count--;
      }
    }
    out.push(count >= n ? +(sum / count).toFixed(3) : null);
  }
  return out;
}

export function ema(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) {
      out.push(prev);
      continue;
    }
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export interface MacdResult {
  dif: number[];
  dea: number[];
  hist: number[];
}

export function macd(closes: (number | null)[]): MacdResult {
  const clean = closes.map((v) => (v == null || Number.isNaN(v as number) ? 0 : (v as number)));
  const ema12 = ema(clean, 12);
  const ema26 = ema(clean, 26);
  const dif = ema12.map((v, i) => +(v - ema26[i]).toFixed(4));
  const dea = ema(dif, 9);
  const hist = dif.map((v, i) => +((v - dea[i]) * 2).toFixed(4));
  return { dif, dea, hist };
}

// 滚动总体标准差（窗口 n），用于布林带。
export function stddev(values: (number | null)[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < n - 1) {
      out.push(null);
      continue;
    }
    const win: number[] = [];
    for (let j = i - n + 1; j <= i; j++) {
      const v = values[j];
      if (v == null || Number.isNaN(v)) {
        win.length = 0;
        break;
      }
      win.push(v);
    }
    if (!win.length) {
      out.push(null);
      continue;
    }
    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length;
    out.push(+(Math.sqrt(variance)).toFixed(4));
  }
  return out;
}

// 布林带：中轨 MA(n)，上下轨 ±k*std(n)。
export interface BollResult {
  mid: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}
export function boll(closes: (number | null)[], n = 20, k = 2): BollResult {
  const mid = ma(closes, n);
  const sd = stddev(closes, n);
  const upper = closes.map((_, i) =>
    mid[i] != null && sd[i] != null ? +(mid[i]! + k * sd[i]!).toFixed(3) : null
  );
  const lower = closes.map((_, i) =>
    mid[i] != null && sd[i] != null ? +(mid[i]! - k * sd[i]!).toFixed(3) : null
  );
  return { mid, upper, lower };
}

// RSI（Wilder 平滑），默认 14 日。
export function rsi(closes: (number | null)[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev == null || cur == null) {
      out[i] = out[i - 1];
      continue;
    }
    const ch = cur - prev;
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    if (i <= n) {
      avgGain = (avgGain * (i - 1) + gain) / i;
      avgLoss = (avgLoss * (i - 1) + loss) / i;
      if (i === n) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out[i] = +(rs >= 100 ? 100 : 100 - 100 / (1 + rs)).toFixed(2);
      }
    } else {
      avgGain = (avgGain * (n - 1) + gain) / n;
      avgLoss = (avgLoss * (n - 1) + loss) / n;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out[i] = +(rs >= 100 ? 100 : 100 - 100 / (1 + rs)).toFixed(2);
    }
  }
  return out;
}

// KDJ（随机指标），默认 9/3/3。
export interface KdjResult {
  K: (number | null)[];
  D: (number | null)[];
  J: (number | null)[];
}
export function kdj(
  highs: (number | null)[],
  lows: (number | null)[],
  closes: (number | null)[],
  n = 9,
  m1 = 3,
  m2 = 3
): KdjResult {
  const K: (number | null)[] = [];
  const D: (number | null)[] = [];
  const J: (number | null)[] = [];
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) {
      K.push(null);
      D.push(null);
      J.push(null);
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      if (highs[j] != null) hh = Math.max(hh, highs[j]!);
      if (lows[j] != null) ll = Math.min(ll, lows[j]!);
    }
    const c = closes[i];
    if (hh === -Infinity || ll === Infinity || hh === ll || c == null) {
      K.push(null);
      D.push(null);
      J.push(null);
      continue;
    }
    const rsv = ((c - ll) / (hh - ll)) * 100;
    const k = ((m1 - 1) / m1) * prevK + (1 / m1) * rsv;
    const d = ((m2 - 1) / m2) * prevD + (1 / m2) * k;
    const j = 3 * k - 2 * d;
    K.push(+k.toFixed(2));
    D.push(+d.toFixed(2));
    J.push(+j.toFixed(2));
    prevK = k;
    prevD = d;
  }
  return { K, D, J };
}
