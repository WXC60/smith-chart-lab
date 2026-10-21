// app.js — 界面、步骤编排与圆图叠加绘制（经典脚本，file:// 直接可用）
const S = window.Smith;

/* ================= 画布与标定 ================= */
const CAL = { cx: 1000.125, cy: 1000.125, rx: 857.955, ry: 865.909 };
const SRC = 2000, CV = 1200, K = CV / SRC;
const COL = {
  load: '#dc2626', gamma: '#ea580c', swr: '#059669', rot: '#2563eb',
  read: '#7c3aed', aux: '#0e7490', ink: '#111827'
};
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
const chartImg = new Image();
chartImg.src = 'assets/smith-chart.png';

let ACTIVE = false;
const toPx = (u, v) => [(CAL.cx + u * CAL.rx) * K, (CAL.cy - v * CAL.ry) * K];
const gAngle = (g) => (Math.atan2(g.im, g.re) * 180) / Math.PI;
const mod = (a, n) => ((a % n) + n) % n;
const fmt = S.fmt, fmtZ = S.fmtZ, fmtGamma = S.fmtGamma;
const fmtLambda = (m) => (Number.isFinite(m) ? (m >= 1 ? (m >= 10 ? m.toFixed(2) + ' m' : m.toFixed(4) + ' m') : (m * 1000).toFixed(1) + ' mm') : '—');

/* ================= 绘图基元 ================= */
const FONT_STACK = '"Microsoft YaHei UI", "Segoe UI", "Noto Sans SC", sans-serif';

function parseMath(str) {
  const out = [];
  let buf = '', i = 0;
  const flush = function () { if (buf) { out.push({ text: buf, kind: 0 }); buf = ''; } };
  while (i < str.length) {
    const ch = str[i];
    if ((ch === '_' || ch === '^') && str[i + 1] === '{') {
      const close = str.indexOf('}', i + 2);
      if (close > i) { flush(); out.push({ text: str.slice(i + 2, close), kind: ch === '_' ? 1 : -1 }); i = close + 1; continue; }
    }
    buf += ch; i++;
  }
  flush();
  return out;
}

function mathHTML(str) {
  return String(str == null ? '' : str)
    .replace(/_\{([^}]*)\}/g, '<sub>$1</sub>')
    .replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>');
}

function haloText(x, y, text, opt) {
  const o = opt || {};
  const size = o.size || 15;
  const weight = o.weight || 600;
  const fontOf = function (fs) { return weight + ' ' + fs.toFixed(1) + 'px ' + FONT_STACK; };
  const segs = parseMath(String(text));
  const scale = 0.68;
  const widths = [];
  let total = 0;
  for (const sg of segs) {
    const fs = sg.kind ? size * scale : size;
    ctx.font = fontOf(fs);
    const w = ctx.measureText(sg.text).width;
    widths.push(w); total += w;
  }
  let startX = x;
  if (o.align === 'center') startX = x - total / 2;
  else if (o.align === 'right') startX = x - total;
  ctx.textAlign = 'left';
  ctx.textBaseline = o.baseline || 'middle';
  let dx = 0;
  for (let k = 0; k < segs.length; k++) {
    const sg = segs[k];
    const fs = sg.kind ? size * scale : size;
    const dy = sg.kind === 1 ? size * 0.26 : sg.kind === -1 ? -size * 0.36 : 0;
    ctx.font = fontOf(fs);
    if (o.halo !== false) {
      ctx.lineWidth = Math.max(3, size * 0.3);
      ctx.strokeStyle = 'rgba(255,255,255,0.93)';
      ctx.strokeText(sg.text, startX + dx, y + dy);
    }
    ctx.fillStyle = o.color || COL.ink;
    ctx.fillText(sg.text, startX + dx, y + dy);
    dx += widths[k];
  }
}

function stroke(pts, opt) {
  const o = opt || {};
  if (!pts.length) return;
  ctx.save();
  if (o.clip !== false) {
    ctx.beginPath();
    ctx.ellipse(CAL.cx * K, CAL.cy * K, CAL.rx * K, CAL.ry * K, 0, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.strokeStyle = o.color || COL.rot;
  ctx.lineWidth = o.width || 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(o.dash || []);
  if (o.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 9; }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  if (o.arrow) {
    const p1 = pts[pts.length - 2], p2 = pts[pts.length - 1];
    const a = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]), L = 12;
    ctx.beginPath();
    ctx.moveTo(p2[0], p2[1]);
    ctx.lineTo(p2[0] - L * Math.cos(a - 0.45), p2[1] - L * Math.sin(a - 0.45));
    ctx.lineTo(p2[0] - L * Math.cos(a + 0.45), p2[1] - L * Math.sin(a + 0.45));
    ctx.closePath();
    ctx.fillStyle = o.color;
    ctx.fill();
  }
  ctx.restore();
}
function circlePoints(cu, cv, r, n) {
  const N = n || 280, out = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    out.push(toPx(cu + r * Math.cos(t), cv + r * Math.sin(t)));
  }
  return out;
}
function arcPoints(radius, a0, a1, steps) {
  const N = steps || 100, out = [];
  for (let i = 0; i <= N; i++) {
    const a = ((a0 + ((a1 - a0) * i) / N) * Math.PI) / 180;
    out.push(toPx(radius * Math.cos(a), radius * Math.sin(a)));
  }
  return out;
}
function makeHelper() {
  const A = () => ACTIVE;
  const w = (base) => (A() ? base * 1.8 : base);
  return {
    dot: function (u, v, opt) {
      const o = opt || {};
      const color = o.color || COL.load, size = o.size || 6;
      const p = toPx(u, v);
      ctx.save();
      if (A()) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
      ctx.beginPath();
      ctx.arc(p[0], p[1], w(size / 1.2), 0, Math.PI * 2);
      ctx.fillStyle = o.hollow ? 'rgba(255,255,255,0.92)' : color;
      ctx.strokeStyle = color;
      ctx.lineWidth = w(2.2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (o.label) haloText(p[0] + (o.dx === undefined ? 10 : o.dx), p[1] + (o.dy === undefined ? -12 : o.dy), o.label, { color: color, size: 14 });
      if (o.badge) {
        ctx.beginPath();
        ctx.arc(p[0] - 16, p[1] - 16, 10, 0, Math.PI * 2);
        ctx.fillStyle = o.stepColor || '#1d4ed8';
        ctx.fill();
        haloText(p[0] - 16, p[1] - 16, o.badge, { color: '#fff', size: 12, align: 'center', halo: false });
      }
    },
    ray: function (g, opt) {
      const o = opt || {};
      stroke([toPx(0, 0), toPx(g.re, g.im)], { color: o.color || COL.gamma, width: w(o.width || 1.8), dash: o.dash || [6, 5], clip: o.clip !== false, glow: A() });
      if (o.label) {
        const p = toPx(g.re * 0.55, g.im * 0.55);
        haloText(p[0] + 8, p[1] - 8, o.label, { color: o.color || COL.gamma, size: 13 });
      }
    },
    line: function (ptsUV, opt) {
      const o = opt || {};
      stroke(ptsUV.map(function (p) { return toPx(p[0], p[1]); }), { color: o.color || COL.rot, width: w(o.width || 2), dash: o.dash, arrow: o.arrow, clip: o.clip !== false, glow: A() });
    },
    circle: function (cu, cv, r, opt) {
      const o = opt || {};
      stroke(circlePoints(cu, cv, r), { color: o.color || COL.swr, width: w(o.width || 2), dash: o.dash || [8, 5], clip: o.clip !== false, glow: A() });
      if (o.label) {
        const a = ((o.labelAngle === undefined ? 45 : o.labelAngle) * Math.PI) / 180;
        const p = toPx(cu + r * Math.cos(a), cv + r * Math.sin(a));
        haloText(p[0] + 6, p[1] - 8, o.label, { color: o.color || COL.swr, size: 13 });
      }
    },
    arc: function (radius, a0, a1, opt) {
      const o = opt || {};
      stroke(arcPoints(radius, a0, a1), { color: o.color || COL.rot, width: w(o.width || 2.2), dash: o.dash, arrow: o.arrow !== false, clip: o.clip !== false, glow: A() });
      if (o.label) {
        const a = ((a0 + (a1 - a0) * (o.labelAt === undefined ? 0.5 : o.labelAt)) * Math.PI) / 180;
        const rr = o.labelRadius || radius;
        const p = toPx(rr * Math.cos(a), rr * Math.sin(a));
        haloText(p[0] + 8, p[1] - 10, o.label, { color: o.color || COL.rot, size: 13 });
      }
    },
    scaleTick: function (reading, opt) {
      const o = opt || {};
      const rr = mod(reading, 0.5);
      const a = ((180 - rr * 720) * Math.PI) / 180;
      stroke([toPx(1.012 * Math.cos(a), 1.012 * Math.sin(a)), toPx(1.058 * Math.cos(a), 1.058 * Math.sin(a))], { color: o.color || COL.read, width: w(2.4), clip: false, glow: A() });
      const p = toPx(1.082 * Math.cos(a), 1.082 * Math.sin(a));
      const right = Math.cos(a) >= 0;
      haloText(p[0] + (right ? 4 : -4), p[1], o.label || '', { color: o.color || COL.read, size: 12.5, align: right ? 'left' : 'right' });
    },
    fillHalf: function (which, color, alpha) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(CAL.cx * K, CAL.cy * K, CAL.rx * K, CAL.ry * K, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = alpha === undefined ? 0.08 : alpha;
      ctx.fillStyle = color;
      const cyPx = CAL.cy * K, ryPx = CAL.ry * K;
      if (which === 'top') ctx.fillRect(0, cyPx - ryPx, CV, ryPx);
      else ctx.fillRect(0, cyPx, CV, ryPx);
      ctx.restore();
    },
    boxText: function (u, v, text, opt) {
      const o = opt || {};
      const p = toPx(u, v);
      const x = p[0] + (o.dx || 0), y = p[1] + (o.dy || 0);
      const fs = o.size || 12.5;
      ctx.save();
      ctx.font = (o.weight || 700) + ' ' + fs + 'px ' + FONT_STACK;
      const w = ctx.measureText(text).width;
      let bx = x;
      if (o.align === 'center') bx = x - w / 2;
      else if (o.align === 'right') bx = x - w;
      const padX = 4, padY = 2.5, h = fs + padY * 2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx - padX, y - h / 2, w + padX * 2, h, 3);
      else ctx.rect(bx - padX, y - h / 2, w + padX * 2, h);
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fill();
      haloText(x, y, text, { color: o.color, size: fs, align: o.align, halo: false });
      ctx.restore();
    },
    text: function (u, v, text, opt) {
      const o = opt || {};
      const p = toPx(u, v);
      haloText(p[0] + (o.dx || 0), p[1] + (o.dy || 0), text, { color: o.color || COL.ink, size: o.size || 13.5, align: o.align || 'left' });
    },
    badge: function (u, v, text, color) {
      const p = toPx(u, v);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 11, 0, Math.PI * 2);
      ctx.fillStyle = color || '#1d4ed8';
      ctx.fill();
      haloText(p[0], p[1], text, { color: '#fff', size: 12.5, align: 'center', halo: false });
    }
  };
}

/* ================= 状态 ================= */
const state = { mode: 'load', params: {}, built: null, stepIndex: 0, opacity: 0.92 };

/* ================= 模式与表单 ================= */
const MODES = {
  load: {
    label: '① 负载分析', hint: '课件基本功能：已知 Z_{0}、Z_{L} 求反射系数 Γ、驻波比 ρ、导纳 y_{L}，并标出等反射系数圆。',
    fields: [
      { key: 'z0', label: '特性阻抗 Z_{0}', unit: 'Ω', def: 50, step: 1, min: 0.1 },
      { key: 'zlRe', label: '负载实部 Re(Z_{L})', unit: 'Ω', def: 85, step: 1 },
      { key: 'zlIm', label: '负载虚部 Im(Z_{L})', unit: 'Ω', def: 30, step: 1 },
      { key: 'fGHz', label: '频率 f', unit: 'GHz', def: 2.4, step: 0.1, min: 0.001 }
    ]
  },
  line: {
    label: '② 输入阻抗（沿线）', hint: '课件步骤：归一化 z_{L} → 标 A 点 → 画等反射系数圆 → 向电源（顺时针）或向负载（逆时针）转 l/λ → 读 C 点 → 反归一。',
    fields: [
      { key: 'z0', label: '特性阻抗 Z_{0}', unit: 'Ω', def: 50, step: 1, min: 0.1 },
      { key: 'zlRe', label: '负载实部 Re(Z_{L})', unit: 'Ω', def: 0, step: 1 },
      { key: 'zlIm', label: '负载虚部 Im(Z_{L})', unit: 'Ω', def: 0, step: 1 },
      { key: 'lengthMode', label: '线长输入方式', type: 'select', options: [['lambda', '以波长倍数 l/λ'], ['meters', '以实际长度（米）']], def: 'lambda' },
      { key: 'lLambda', label: '线长 l', unit: 'λ', def: 0.1, step: 0.01, showIf: function (p) { return p.lengthMode !== 'meters'; } },
      { key: 'lMeters', label: '线长 l', unit: 'm', def: 0.03, step: 0.01, showIf: function (p) { return p.lengthMode === 'meters'; } },
      { key: 'direction', label: '旋转方向', type: 'select', options: [['gen', '向电源（顺时针）'], ['load', '向负载（逆时针）']], def: 'gen' },
      { key: 'fGHz', label: '频率 f', unit: 'GHz', def: 1, step: 0.1, min: 0.001 }
    ]
  },
  reverse: {
    label: '③ 负载阻抗（由 ρ、d_{min}）', hint: '课件步骤：找 E 点（电压波节，Γ=−|Γ|）→ 以 O 为圆心、OE 为半径画圆 → OE 向负载转 d_{min}/λ 得 F → OF 与圆交 G → 读 z_{L} → 反归一。',
    fields: [
      { key: 'z0', label: '特性阻抗 Z_{0}', unit: 'Ω', def: 50, step: 1, min: 0.1 },
      { key: 'source', label: '已知量', type: 'select', options: [['rho', '驻波比 ρ'], ['vv', 'V_{max} 与 V_{min}']], def: 'rho' },
      { key: 'rho', label: '驻波比 ρ', unit: '', def: 3, step: 0.1, min: 1.001, showIf: function (p) { return p.source !== 'vv'; } },
      { key: 'vmax', label: '电压最大值 V_{max}', unit: 'V', def: 2.5, step: 0.1, showIf: function (p) { return p.source === 'vv'; } },
      { key: 'vmin', label: '电压最小值 V_{min}', unit: 'V', def: 1, step: 0.1, showIf: function (p) { return p.source === 'vv'; } },
      { key: 'waveSource', label: '波长来源', type: 'select', options: [['f', '频率 f'], ['delta', '相邻最小值间距 Δ（λ=2Δ）']], def: 'f' },
      { key: 'deltaMeters', label: '相邻最小值间距 Δ', unit: 'm', def: 0.2, step: 0.01, showIf: function (p) { return p.waveSource === 'delta'; } },
      { key: 'dminMode', label: 'd_{min} 输入方式', type: 'select', options: [['lambda', '以波长倍数 d_{min}/λ'], ['meters', '以实际距离（米）']], def: 'meters' },
      { key: 'dminLambda', label: 'd_{min}', unit: 'λ', def: 0.125, step: 0.001, showIf: function (p) { return p.dminMode !== 'meters'; } },
      { key: 'dminMeters', label: 'd_{min}', unit: 'm', def: 0.05, step: 0.001, showIf: function (p) { return p.dminMode === 'meters'; } },
      { key: 'fGHz', label: '频率 f', unit: 'GHz', def: 0.75, step: 0.01, min: 0.001, showIf: function (p) { return p.waveSource !== 'delta'; } }
    ]
  },
  match: {
    label: '④ 并联单支节匹配', hint: '课件步骤：归一化 z_{L} → 画等反射系数圆 → 对称点得 y_{L} → 向电源转到单位电导圆 g=1 两交点 → 求 d（θ/4π）→ 看单位外圆求支节长度 l。',
    fields: [
      { key: 'z0', label: '特性阻抗 Z_{0}', unit: 'Ω', def: 50, step: 1, min: 0.1 },
      { key: 'zlRe', label: '负载实部 Re(Z_{L})', unit: 'Ω', def: 100, step: 1, min: 0.0001 },
      { key: 'zlIm', label: '负载虚部 Im(Z_{L})', unit: 'Ω', def: 50, step: 1 },
      { key: 'fGHz', label: '频率 f', unit: 'GHz', def: 2.4, step: 0.1, min: 0.001 },
      { key: 'stubType', label: '支节类型', type: 'select', options: [['short', '短路支节'], ['open', '开路支节']], def: 'short' },
      { key: 'solutionIndex', label: '选用解', type: 'select', options: [['0', '解 1（离负载最近）'], ['1', '解 2（次近）']], def: '0' }
    ]
  },
  admittance: {
    label: '⑤ 导纳计算（转 180°）', hint: '课件基本功能：已知 Z_{L} 求 y_{L}（转 180°）；也可再顺时针转 l/λ 求输入导纳 y_{in}。注意导纳读法三对调：短路↔开路、V_{max}↔V_{min}、上下半区性质对调。',
    fields: [
      { key: 'z0', label: '特性阻抗 Z_{0}', unit: 'Ω', def: 50, step: 1, min: 0.1 },
      { key: 'zlRe', label: '负载实部 Re(Z_{L})', unit: 'Ω', def: 100, step: 1 },
      { key: 'zlIm', label: '负载虚部 Im(Z_{L})', unit: 'Ω', def: 50, step: 1 },
      { key: 'lengthMode', label: '线长输入方式', type: 'select', options: [['lambda', '以波长倍数 l/λ'], ['meters', '以实际长度（米）']], def: 'lambda' },
      { key: 'lLambda', label: '线长 l', unit: 'λ', def: 0.15, step: 0.01, showIf: function (p) { return p.lengthMode !== 'meters'; } },
      { key: 'lMeters', label: '线长 l', unit: 'm', def: 0.045, step: 0.01, showIf: function (p) { return p.lengthMode === 'meters'; } },
      { key: 'fGHz', label: '频率 f', unit: 'GHz', def: 1, step: 0.1, min: 0.001 }
    ]
  },
  yinv: {
    label: '⑥ 输入导纳反推 Z_L',
    hint: '课件基本功能的反向：已知输入导纳 Y_{in}（S）和距负载的线长 l/λ，求负载 Z_{L}。先把 Y_{in} 归一化，再沿等反射系数圆向负载（逆时针）转 l/λ，最后取倒数、反归一。',
    fields: [
      { key: 'z0', label: '特性阻抗 Z_{0}', unit: 'Ω', def: 50, step: 1, min: 0.1 },
      { key: 'yinRe', label: '输入导纳实部 Re(Y_{in})', unit: 'S', def: 0.025, step: 0.001 },
      { key: 'yinIm', label: '输入导纳虚部 Im(Y_{in})', unit: 'S', def: -0.015, step: 0.001 },
      { key: 'lengthMode', label: '线长输入方式', type: 'select', options: [['lambda', '以波长倍数 l/λ'], ['meters', '以实际长度（米）']], def: 'lambda' },
      { key: 'lLambda', label: '线长 l', unit: 'λ', def: 0.15, step: 0.01, showIf: function (p) { return p.lengthMode !== 'meters'; } },
      { key: 'lMeters', label: '线长 l', unit: 'm', def: 0.045, step: 0.01, showIf: function (p) { return p.lengthMode === 'meters'; } },
      { key: 'fGHz', label: '频率 f', unit: 'GHz', def: 1, step: 0.1, min: 0.001, showIf: function (p) { return p.lengthMode === 'meters'; } }
    ]
  },
  length: {
    label: '⑦ 求 l/λ（由 y_L、y_in）',
    hint: '课件练习 4.1.4–4.1.6：已知负载归一化导纳 y_{L} 和目标 y_{in}，沿等反射系数圆向电源（顺时针）转，求所需的 l/λ。目标可选“完整 y_{in}”或“Re(y_{in})=1（求 b_{in}）”。',
    fields: [
      { key: 'ylRe', label: '负载归一化电导 g_{L}', unit: '', def: 0, step: 0.01 },
      { key: 'ylIm', label: '负载归一化电纳 b_{L}', unit: '', def: 0, step: 0.01 },
      { key: 'targetMode', label: '目标类型', type: 'select', options: [['exact', '完整目标 y_{in}'], ['g1', 'Re(y_{in}) = 1（求 b_{in}）']], def: 'exact' },
      { key: 'ytRe', label: '目标 Re(y_{in})', unit: '', def: 0, step: 0.01, showIf: function (p) { return p.targetMode !== 'g1'; } },
      { key: 'ytIm', label: '目标 Im(y_{in})', unit: '', def: -0.3, step: 0.01, showIf: function (p) { return p.targetMode !== 'g1'; } }
    ]
  },
  anatomy: {
    label: '⑧ 圆图详解',
    hint: '逐类标注教材圆图：三个特殊点（左短 P_sc · 中间匹配 · 右开 P_oc）、实轴及 K/ρ 刻度、上下 ±j 区、等 r/等 x 圆簇、|Γ|=1、驻波比、波长/相角刻度与导纳读法。点「下一步」逐层显示，图下方给出图外图例。',
    fields: []
  }
};

const PRESETS = [
  { id: 'ex41', label: '例4.1 短路线 0.1λ', mode: 'line', step: 5, params: { z0: 50, zlRe: 0, zlIm: 0, lengthMode: 'lambda', lLambda: 0.1, lMeters: 0.03, fGHz: 1 } },
  { id: 'ex42', label: '例4.2 求驻波比', mode: 'load', step: 3, params: { z0: 50, zlRe: 85, zlIm: 30, fGHz: 2.4 } },
  { id: 'ex43', label: '例4.3 沿线 25m', mode: 'line', step: 5, params: { z0: 100, zlRe: 100, zlIm: -200, lengthMode: 'meters', lLambda: 0.8333, lMeters: 25, fGHz: 0.01 } },
  { id: 'ex44', label: '例4.4 ρ=3 求 Z_{L}', mode: 'reverse', step: 4, params: { z0: 50, rho: 3, dminMode: 'meters', dminLambda: 0.125, dminMeters: 0.05, fGHz: 0.75 } },
  { id: 'match', label: '匹配示例 100+j50', mode: 'match', step: 5, params: { z0: 50, zlRe: 100, zlIm: 50, fGHz: 2.4, stubType: 'short', solutionIndex: '0' } },
  { id: 'ex46', label: '例4.6 导纳 0.15λ', mode: 'admittance', step: 5, params: { z0: 50, zlRe: 100, zlIm: 50, lengthMode: 'lambda', lLambda: 0.15, lMeters: 0.045, fGHz: 1 } },
  { id: 'ex16', label: '课件例 25+j25 · 0.2λ', mode: 'line', step: 5, params: { z0: 50, zlRe: 25, zlIm: 25, lengthMode: 'lambda', lLambda: 0.2, lMeters: 0.06, direction: 'gen', fGHz: 1 } },
  { id: 'course-swr', label: '课件例 ρ=3 · Δ=20cm', mode: 'reverse', step: 4, params: { z0: 50, source: 'rho', rho: 3, vmax: 2.5, vmin: 1, waveSource: 'delta', deltaMeters: 0.2, dminMode: 'meters', dminLambda: 0.125, dminMeters: 0.05, fGHz: 0.75 } },
  { id: 'course-vv', label: '课件例 Vmax/Vmin · dmin=0.15λ', mode: 'reverse', step: 5, params: { z0: 600, source: 'vv', rho: 5, vmax: 200, vmin: 40, waveSource: 'f', deltaMeters: 0.2, dminMode: 'lambda', dminLambda: 0.15, dminMeters: 0.06, fGHz: 1 } },
  { id: 'course-match', label: '课件例1 25+j75 匹配', mode: 'match', step: 6, params: { z0: 50, zlRe: 25, zlIm: 75, fGHz: 1, stubType: 'short', solutionIndex: '0' } },
  { id: 'course-match2', label: '课件例 75+j40 匹配', mode: 'match', step: 6, params: { z0: 100, zlRe: 75, zlIm: 40, fGHz: 1, stubType: 'short', solutionIndex: '0' } },
  { id: 'ex411', label: '4.1.1 Zin/Yin', mode: 'line', step: 5, params: { z0: 100, zlRe: 80, zlIm: -60, lengthMode: 'lambda', lLambda: 0.2, lMeters: 0.06, direction: 'gen', fGHz: 1 } },
  { id: 'ex412', label: '4.1.2 由 Yin 求 ZL', mode: 'yinv', step: 4, params: { z0: 50, yinRe: 0.025, yinIm: -0.015, lengthMode: 'lambda', lLambda: 0.15, lMeters: 0.045, fGHz: 1 } },
  { id: 'ex413', label: '4.1.3 Γ(0.35λ) 与 VSWR', mode: 'line', step: 5, params: { z0: 50, zlRe: 80, zlIm: -20, lengthMode: 'lambda', lLambda: 0.35, lMeters: 0.105, direction: 'gen', fGHz: 1 } },
  { id: 'ex414', label: '4.1.4 yL=0 求 l/λ', mode: 'length', step: 3, params: { ylRe: 0, ylIm: 0, targetMode: 'exact', ytRe: 0, ytIm: -0.3 } },
  { id: 'ex415', label: '4.1.5 求 l/λ 与 b_in', mode: 'length', step: 3, params: { ylRe: 1.9231, ylIm: 0.3846, targetMode: 'g1', ytRe: 1, ytIm: 0 } },
  { id: 'ex416', label: '4.1.6 开路 求 l/λ', mode: 'length', step: 3, params: { ylRe: 0, ylIm: 0, targetMode: 'exact', ytRe: 0, ytIm: -0.2 } },
  { id: 'ex43q', label: '4.3 综合题 70−j20 · 0.6λ', mode: 'line', step: 5, params: { z0: 50, zlRe: 70, zlIm: -20, lengthMode: 'lambda', lLambda: 0.6, lMeters: 0.18, direction: 'gen', fGHz: 1 } },
];

function renderModeTabs() {
  const el = document.getElementById('modeTabs');
  el.innerHTML = '';
  for (const id in MODES) {
    const m = MODES[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mode-tab' + (id === state.mode ? ' active' : '');
    b.innerHTML = mathHTML(m.label);
    b.onclick = (function (modeId) {
      return function () {
        state.mode = modeId; state.params = {}; state.built = null; state.stepIndex = 0;
        renderAll(); buildAndRender(0);
      };
    })(id);
    el.appendChild(b);
  }
}
function renderForm() {
  const form = document.getElementById('paramForm');
  const m = MODES[state.mode];
  form.innerHTML = '';
  for (const f of m.fields) {
    const row = document.createElement('div');
    row.className = 'field';
    row.dataset.key = f.key;
    const label = document.createElement('label');
    label.innerHTML = mathHTML(f.label) + (f.unit ? '（' + f.unit + '）' : '');
    row.appendChild(label);
    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      for (const pair of f.options) {
        const o = document.createElement('option');
        o.value = pair[0]; o.textContent = pair[1];
        input.appendChild(o);
      }
    } else {
      input = document.createElement('input');
      input.type = 'number';
      input.step = f.step || 'any';
      if (f.min !== undefined) input.min = f.min;
    }
    input.id = 'f_' + f.key;
    input.value = state.params[f.key] !== undefined ? state.params[f.key] : f.def;
    row.appendChild(input);
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = f.unit || '';
    row.appendChild(unit);
    form.appendChild(row);
  }
  syncFieldVisibility();
  document.getElementById('modeHint').innerHTML = mathHTML(m.hint);
  const isRefMode = state.mode === 'anatomy';
  const presetBlock = document.querySelector('.preset-block');
  const actionBlock = document.querySelector('.actions');
  if (presetBlock) presetBlock.classList.toggle('hidden', isRefMode);
  if (actionBlock) actionBlock.classList.toggle('hidden', isRefMode);
}
function syncFieldVisibility() {
  const m = MODES[state.mode];
  const p = readForm();
  for (const f of m.fields) {
    if (!f.showIf) continue;
    const row = document.querySelector('.field[data-key="' + f.key + '"]');
    if (row) row.classList.toggle('hidden', !f.showIf(p));
  }
}
function readForm() {
  const m = MODES[state.mode];
  const p = {};
  for (const f of m.fields) {
    const el = document.getElementById('f_' + f.key);
    if (!el) continue;
    p[f.key] = f.type === 'select' ? el.value : Number(el.value);
  }
  return p;
}
function renderPresets() {
  const el = document.getElementById('presets');
  el.innerHTML = '';
  for (const pre of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'preset'; b.textContent = pre.label;
    b.onclick = (function (item) {
      return function () {
        state.mode = item.mode; state.params = Object.assign({}, item.params); state.stepIndex = 0;
        renderAll(); buildAndRender(item.step || 0);
      };
    })(pre);
    el.appendChild(b);
  }
}
function renderAll() { renderModeTabs(); renderForm(); renderPresets(); }

/* ================= 步骤面板 ================= */
function renderSteps() {
  const list = document.getElementById('stepList');
  list.innerHTML = '';
  const b = state.built;
  if (!b) return;
  b.steps.forEach(function (s, i) {
    const li = document.createElement('li');
    li.className = 'step-item' + (i === state.stepIndex ? ' active' : '') + (i < state.stepIndex ? ' done' : '');
    li.dataset.n = i + 1;
    const title = document.createElement('div');
    title.className = 'step-title';
    title.innerHTML = '<span class="num">' + (i + 1) + '</span><span>' + mathHTML(s.title) + '</span>';
    li.appendChild(title);
    const body = document.createElement('div');
    body.className = 'step-body';
    body.innerHTML = mathHTML(s.body || '');
    if (s.formulas) {
      for (const f of s.formulas) {
        const d = document.createElement('div');
        d.className = 'formula' + (f.result ? ' result' : '');
        d.innerHTML = mathHTML(f.expr || '') + (f.value ? '  →  <b>' + mathHTML(f.value) + '</b>' : '');
        body.appendChild(d);
      }
    }
    li.appendChild(body);
    list.appendChild(li);
  });
  document.getElementById('stepCounter').textContent = (state.stepIndex + 1) + ' / ' + b.steps.length;
  document.getElementById('prevStep').disabled = state.stepIndex === 0;
  document.getElementById('nextStep').disabled = state.stepIndex >= b.steps.length - 1;
  const active = list.querySelector('.step-item.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}
function renderResults() {
  const el = document.getElementById('results');
  el.innerHTML = '';
  const b = state.built;
  if (!b) return;
  for (const c of b.summary) {
    const d = document.createElement('div');
    d.className = 'result-card' + (c.accent ? ' accent' : '');
    d.innerHTML = '<div class="k">' + mathHTML(c.k) + '</div><div class="v">' + mathHTML(c.v) + '</div>' + (c.s ? '<div class="s">' + mathHTML(c.s) + '</div>' : '');
    el.appendChild(d);
  }
}
function renderLegend() {
  const el = document.getElementById('legend');
  el.innerHTML = '';
  const b = state.built;
  if (!b) return;
  for (const l of b.legend || []) {
    const d = document.createElement('span');
    d.className = 'item';
    d.innerHTML = '<span class="swatch" style="background:' + l.color + '"></span>' + mathHTML(l.label);
    el.appendChild(d);
  }
}

/* ================= 画布渲染 ================= */
function renderReference() {
  const el = document.getElementById('reference');
  if (!el) return;
  const b = state.built;
  if (!b || !b.reference || !b.reference.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  let html = '<div class="ref-title">图外图例 · 曲线与刻度的含义（教材图 4.6）</div><div class="ref-grid">';
  for (const item of b.reference) {
    html += '<div class="ref-item"><span class="ref-dot" style="background:' + item.color + '"></span>' +
      '<div><div class="ref-name">' + mathHTML(item.name) + '</div><div class="ref-desc">' + mathHTML(item.desc) + '</div></div></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderCanvas() {
  if (!chartImg.complete || !chartImg.naturalWidth) return;
  ctx.clearRect(0, 0, CV, CV);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CV, CV);
  ctx.globalAlpha = state.opacity;
  ctx.drawImage(chartImg, 0, 0, CV, CV);
  ctx.globalAlpha = 1;
  const b = state.built;
  if (!b) return;
  for (let i = 0; i <= state.stepIndex && i < b.steps.length; i++) {
    ACTIVE = i === state.stepIndex;
    const h = makeHelper();
    try { b.steps[i].draw(h); } catch (e) { console.error('draw step', i, e); }
  }
  ACTIVE = false;
  haloText(22, 26, '教材图 4.6 · Smith 圆图', { color: 'rgba(30,58,95,0.5)', size: 13, weight: 600 });
}

/* ================= 主流程 ================= */
function buildAndRender(stepIndex) {
  const p = readForm();
  state.params = Object.assign({}, p);
  const built = builders[state.mode](p);
  state.built = built;
  state.stepIndex = Math.max(0, Math.min(stepIndex || 0, built.steps.length - 1));
  renderSteps(); renderResults(); renderLegend(); renderReference(); renderCanvas();
}
function setStep(i) {
  if (!state.built) return;
  const n = Math.max(0, Math.min(i, state.built.steps.length - 1));
  if (n === state.stepIndex) return;
  state.stepIndex = n;
  renderSteps(); renderCanvas();
}


/* ================= 四种分析模式 ================= */
const builders = {};

builders.load = function (p) {
  const z = S.normalizeZ(p.zlRe, p.zlIm, p.z0);
  const g = S.zToGamma(z.r, z.x);
  const mag = S.cabs(g), ang = gAngle(g);
  const rho = S.vswr(mag), Kc = mag >= 1 ? 0 : 1 / rho;
  const rl = S.returnLossDb(mag), ml = S.mismatchLossDb(mag);
  const lam = S.wavelengthM(p.fGHz);
  const y = S.admittanceOfZ(z.r, z.x);
  const zlStr = fmtZ(z.r, z.x), gStr = fmtGamma(g);
  const summary = [
    { k: '归一化阻抗 z_{L}', v: zlStr, s: 'Z_{L} = ' + fmtZ(p.zlRe, p.zlIm) + ' Ω', accent: true },
    { k: '反射系数 Γ', v: gStr, s: '|Γ| = ' + fmt(mag, 3) },
    { k: '驻波比 VSWR', v: fmt(rho, 2), s: '行波系数 K = ' + fmt(Kc, 3) },
    { k: '回波损耗', v: fmt(rl, 2) + ' dB', s: '失配损耗 ' + fmt(ml, 2) + ' dB' },
    { k: '自由空间波长 λ', v: fmtLambda(lam), s: 'f = ' + p.fGHz + ' GHz' },
    { k: '归一化导纳 y', v: fmtZ(y.re, y.im), s: '与 z 关于圆心对称' }
  ];
  const steps = [
    {
      title: '归一化负载阻抗',
      body: '把负载阻抗除以特性阻抗 Z_{0}，得到圆图上可直接定位的归一化阻抗 <b>z_{L} = r + jx</b>。',
      formulas: [{ expr: 'z_{L} = Z_{L} / Z_{0} = (' + fmt(p.zlRe) + (p.zlIm >= 0 ? ' + j' : ' − j') + Math.abs(p.zlIm).toFixed(2) + ') / ' + fmt(p.z0), value: zlStr }],
      draw: function (h) {
        h.ray(g, { color: COL.gamma, dash: [6, 5] });
        h.dot(g.re, g.im, { color: COL.load, label: 'A  z_{L} = ' + zlStr, dx: 12, dy: -14 });
        h.badge(g.re, g.im, '1');
      }
    },
    {
      title: '定位反射系数点 A',
      body: '圆图上每一点同时代表一个归一化阻抗与一个反射系数。由 <b>Γ = (z−1)/(z+1)</b> 算出 Γ，A 点就是它的位置。',
      formulas: [
        { expr: 'Γ = (z_{L} − 1) / (z_{L} + 1)', value: gStr },
        { expr: '|Γ| = √(Γr² + Γi²)', value: fmt(mag, 3) },
        { expr: '∠Γ = arctan(Γi/Γr)', value: fmt(ang, 1) + '°' }
      ],
      draw: function (h) {
        h.dot(g.re, g.im, { color: COL.load, label: 'A', dx: 12, dy: -14 });
        h.arc(0.22, 0, ang, { color: COL.gamma, dash: [4, 4], arrow: false, label: '∠Γ = ' + fmt(ang, 1) + '°', labelAt: 0.6, labelRadius: 0.30 });
        h.badge(-0.32, 0.30, '2');
      }
    },
    {
      title: '画等反射系数圆（等驻波比圆）',
      body: '以圆心 O 为中心、|Γ| 为半径画圆。沿该圆移动时 |Γ| 不变，所以它同时是<b>等驻波比圆</b>。',
      formulas: [{ expr: '圆心 = (0, 0)', value: '半径 = |Γ| = ' + fmt(mag, 3) }],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6], label: '等驻波比圆', labelAngle: 55 });
        h.dot(g.re, g.im, { color: COL.load, label: 'A', dx: 12, dy: -14 });
        h.badge(0, mag + 0.06, '3', COL.swr);
      }
    },
    {
      title: '读出驻波比 ρ 与行波系数 K',
      body: '等驻波比圆与正实轴的交点处，归一化电阻恰等于 ρ；与负实轴的交点处恰等于 1/ρ。',
      formulas: [
        { expr: 'ρ = (1 + |Γ|) / (1 − |Γ|)', value: fmt(rho, 2) },
        { expr: 'K = 1/ρ = (1 − |Γ|) / (1 + |Γ|)', value: fmt(Kc, 3) }
      ],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        h.dot(mag, 0, { color: COL.swr, label: 'ρ = ' + fmt(rho, 2), dx: 12, dy: 18 });
        h.dot(-mag, 0, { color: COL.aux, label: 'K = ' + fmt(Kc, 3), dx: -12, dy: 18, hollow: true });
        h.line([[0, 0], [mag, 0]], { color: COL.swr, dash: [3, 4], width: 1.4 });
        h.badge(0.5 * mag, 0, '4', COL.swr);
      }
    },
    {
      title: '派生量：回波损耗与导纳点',
      body: '回波损耗、失配损耗只需 |Γ|。把 A 点绕圆心转 180° 就得到归一化导纳点 <b>y = 1/z</b>。',
      formulas: [
        { expr: 'RL = −20·lg|Γ|', value: fmt(rl, 2) + ' dB' },
        { expr: '失配损耗 = −10·lg(1 − |Γ|²)', value: fmt(ml, 2) + ' dB' },
        { expr: 'y = 1/z', value: fmtZ(y.re, y.im) }
      ],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        h.dot(g.re, g.im, { color: COL.load, label: 'A', dx: 12, dy: -14 });
        h.dot(-g.re, -g.im, { color: COL.read, label: 'y = ' + fmtZ(y.re, y.im), dx: 12, dy: -14, hollow: true });
        h.line([[g.re, g.im], [-g.re, -g.im]], { color: COL.read, dash: [3, 5], width: 1.4 });
        h.badge(0, 0, '5', COL.read);
      }
    }
  ];
  return {
    steps: steps, summary: summary,
    legend: [
      { color: COL.load, label: '负载点 A（阻抗）' },
      { color: COL.swr, label: '等反射系数 / 等驻波比圆' },
      { color: COL.read, label: '导纳点（转 180°）' },
      { color: COL.aux, label: '行波系数读数点' }
    ]
  };
};

builders.line = function (p) {
  const lam = S.wavelengthM(p.fGHz);
  const lOver = p.lengthMode === 'meters' ? (lam > 0 ? p.lMeters / lam : NaN) : p.lLambda;
  const z = S.normalizeZ(p.zlRe, p.zlIm, p.z0);
  const g = S.zToGamma(z.r, z.x);
  const mag = S.cabs(g), ang = gAngle(g);
  const towardLoad = p.direction === 'load';
  const gIn = S.rotateTowardGenerator(g, towardLoad ? -lOver : lOver);
  const zi = S.gammaToZ(gIn);
  const yi = S.admittanceOfZ(zi.re, zi.im);
  const yL = S.admittanceOfZ(z.r, z.x);
  const dMin = mod((ang + 180) / 720, 0.5);
  const dMax = mod(ang / 720, 0.5);
  const lB = S.waveLengthScale(g);
  const lC = mod(lB + (towardLoad ? -lOver : lOver), 0.5);
  const turns = Math.floor(lOver / 0.5);
  const remLambda = mod(lOver, 0.5);
  const dAng = (towardLoad ? 720 : -720) * remLambda;
  const rho = S.vswr(mag);
  const zinStr = fmtZ(zi.re, zi.im);
  const zinOhm = fmtZ(zi.re * p.z0, zi.im * p.z0) + ' Ω';
  const summary = [
    { k: '归一化输入阻抗 z_{in}', v: zinStr, s: 'Z_{in} = ' + zinOhm, accent: true },
    { k: '负载反射系数 Γ_{L}', v: fmtGamma(g), s: '∠Γ_{L} = ' + fmt(ang, 1) + '°' },
    { k: '负载导纳 Y_{L}', v: fmtZ(yL.re, yL.im), s: 'Y_{L} = ' + fmt(yL.re / p.z0, 4) + (yL.im >= 0 ? ' + j' : ' − j') + Math.abs(yL.im / p.z0).toFixed(4) + ' S' },
    { k: '首个 V_{min} / V_{max}', v: 'd_{min}=' + fmt(dMin, 4) + 'λ', s: 'd_{max}=' + fmt(dMax, 4) + 'λ' + (Number.isFinite(lam) ? '；≈' + fmt(dMin * lam, 4) + ' m / ' + fmt(dMax * lam, 4) + ' m' : '') },
    { k: '输入反射系数 Γ_{in}', v: fmtGamma(gIn), s: '|Γ| 不变 = ' + fmt(mag, 3) },
    { k: '线长 l/λ', v: fmt(lOver, 4) + ' λ', s: (p.direction === 'load' ? '向负载（逆时针）' : '向电源（顺时针）') + (Number.isFinite(lam) ? '；l = ' + fmt(p.lengthMode === 'meters' ? p.lMeters : lOver * lam, 4) + ' m' : '') },
    { k: '驻波比 VSWR', v: fmt(rho, 2), s: '沿线处处相同' },
    { k: '输入导纳 y_{in}', v: fmtZ(yi.re, yi.im), s: '与输入阻抗关于圆心对称' },
    { k: '输入导纳 Y_{in}', v: fmt(yi.re / p.z0, 4) + (yi.im >= 0 ? ' + j' : ' − j') + Math.abs(yi.im / p.z0).toFixed(4) + ' S', s: 'Y_{in} = y_{in}/Z_{0}' },
    { k: '波长 λ', v: fmtLambda(lam), s: 'f = ' + p.fGHz + ' GHz' }
  ];
  const steps = [
    {
      title: '归一化负载阻抗',
      body: '先把负载归一化为 z_{L}，在圆图上定位 A 点（与模式①相同）。',
      formulas: [
        { expr: 'z_{L} = Z_{L} / Z_{0}', value: fmtZ(z.r, z.x) },
        { expr: 'Γ_{L} = (z_{L} − 1)/(z_{L} + 1)', value: fmtGamma(g) }
      ],
      draw: function (h) {
        h.ray(g, { color: COL.gamma, dash: [6, 5] });
        h.dot(g.re, g.im, { color: COL.load, label: 'A（负载）', dx: 12, dy: -14 });
        h.badge(g.re, g.im, '1');
      }
    },
    {
      title: '画等反射系数圆',
      body: '无耗线上 |Γ| 恒定，沿线移动的轨迹就是以 O 为圆心、|Γ| 为半径的圆。',
      formulas: [{ expr: '圆心 (0,0)', value: '半径 = ' + fmt(mag, 3) }],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6], label: '等反射系数圆', labelAngle: 50 });
        h.badge(0, mag + 0.06, '2', COL.swr);
      }
    },
    {
      title: '找 B 点并读出波长刻度',
      body: '延长射线 OA 与单位圆（r = 0 圆）交于 B；圆图外圈“朝信号源波长刻度”在 B 处的读数即为 l_{B}/λ。',
      formulas: [
        { expr: 'φ_L = ∠Γ_{L}', value: fmt(ang, 1) + '°' },
        { expr: 'l_{B}/λ = (π − φ_L)/(4π)', value: fmt(lB, 4) + ' λ' }
      ],
      draw: function (h) {
        const a = (ang * Math.PI) / 180;
        const bx = Math.cos(a), by = Math.sin(a);
        h.line([[0, 0], [bx, by]], { color: COL.gamma, dash: [5, 4], width: 1.6 });
        h.dot(bx, by, { color: COL.read, label: 'B', dx: 8, dy: -12, hollow: true });
        h.scaleTick(lB, { color: COL.read, label: 'l_{B}/λ = ' + fmt(lB, 4) });
        h.badge(bx * 0.82, by * 0.82, '3', COL.read);
      }
    },
    {
      title: '顺时针转过 l/λ = ' + fmt(lOver, 4),
      body: '朝信号源方向＝圆图上顺时针。转过 l/λ 到达 C 点' + (turns > 0 ? '；本题需绕圆 ' + turns + ' 整圈（每圈 0.5λ）再转 ' + fmt(remLambda, 4) + 'λ' : '') + '。',
      formulas: [
        { expr: 'Γ_{in} = Γ_{L} · e^{−j4π l/λ}', value: fmtGamma(gIn) },
        { expr: '转角 = 4π·l/λ', value: fmt(4 * 180 * lOver, 1) + '°' }
      ],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        h.ray(g, { color: COL.gamma, dash: [5, 5], width: 1.4 });
        h.arc(mag, ang, ang + dAng, { color: COL.rot, label: '顺时针 ' + fmt(remLambda, 4) + 'λ', labelAt: 0.55 });
        if (turns > 0) h.circle(0, 0, mag, { color: COL.rot, dash: [2, 6], width: 1.2 });
        h.dot(gIn.re, gIn.im, { color: COL.rot, label: 'C（输入端）', dx: 12, dy: -14 });
        h.scaleTick(lC, { color: COL.rot, label: 'l_{C}/λ = ' + fmt(lC, 4) });
        h.badge(gIn.re * 0.8, gIn.im * 0.8, '4', COL.rot);
      }
    },
    {
      title: '读 C 点的归一化输入阻抗',
      body: 'C 点落在哪两条等 r、等 x 圆的交点上，就读出对应的 r、x；再乘回 Z_{0}。',
      formulas: [
        { expr: 'z_{in} = r + jx（C 点读数）', value: zinStr },
        { expr: 'Z_{in} = Z_{0} · z_{in}', value: zinOhm }
      ],
      draw: function (h) {
        h.dot(gIn.re, gIn.im, { color: COL.rot, label: 'C  z_{in} = ' + zinStr, dx: 12, dy: -14 });
        h.line([[gIn.re, 0], [gIn.re, gIn.im], [0, gIn.im]], { color: COL.rot, dash: [3, 4], width: 1.2, clip: false });
        h.badge(gIn.re, gIn.im, '5', COL.rot);
      }
    },
    {
      title: '输入导纳与校核',
      body: '把 C 点绕圆心转 180° 得输入导纳 y_{in}；|Γ| 与 VSWR 沿线不变，可用来校核读数。',
      formulas: [
        { expr: 'y_{in} = 1/z_{in}', value: fmtZ(yi.re, yi.im) },
        { expr: 'Γ_{in} = Γ_{L}·e^{−j4π l/λ}', value: fmtGamma(gIn) }
      ],
      draw: function (h) {
        h.dot(gIn.re, gIn.im, { color: COL.rot, label: 'C', dx: 12, dy: -14 });
        h.dot(-gIn.re, -gIn.im, { color: COL.read, label: 'y_{in} = ' + fmtZ(yi.re, yi.im), dx: 12, dy: -14, hollow: true });
        h.line([[gIn.re, gIn.im], [-gIn.re, -gIn.im]], { color: COL.read, dash: [3, 5], width: 1.3 });
        h.badge(0, 0, '6', COL.read);
      }
    }
  ];
  return {
    steps: steps, summary: summary,
    legend: [
      { color: COL.load, label: '负载点 A' },
      { color: COL.swr, label: '等反射系数圆' },
      { color: COL.rot, label: '顺时针旋转 → 输入点 C' },
      { color: COL.read, label: '波长刻度 / 导纳点' }
    ]
  };
};


builders.reverse = function (p) {
  const lam = p.waveSource === 'delta' ? 2 * p.deltaMeters : S.wavelengthM(p.fGHz);
  const rho = p.source === 'vv' ? (p.vmax / p.vmin) : p.rho;
  const dOver = p.dminMode === 'meters' ? (lam > 0 ? p.dminMeters / lam : NaN) : p.dminLambda;
  const mag = (rho - 1) / (rho + 1);
  const g = S.gammaFromRhoAndDmin(rho, dOver);
  const z = S.gammaToZ(g);
  const zStr = fmtZ(z.re, z.im);
  const rotDeg = 4 * 180 * dOver;
  const angG = gAngle(g);
  const lamSrc = p.waveSource === 'delta' ? 'Δ = ' + fmt(p.deltaMeters, 3) + ' m → λ = 2Δ' : 'f = ' + p.fGHz + ' GHz';
  const summary = [
    { k: '负载阻抗 Z_L', v: fmtZ(z.re * p.z0, z.im * p.z0) + ' Ω', s: 'z_L = ' + zStr, accent: true },
    { k: '负载反射系数 Γ_L', v: fmtGamma(g), s: '|Γ| = ' + fmt(mag, 3) },
    { k: '驻波比 ρ', v: fmt(rho, 3), s: p.source === 'vv' ? 'V_max/V_min' : '题给' },
    { k: 'd_min/λ', v: fmt(dOver, 4) + ' λ', s: Number.isFinite(lam) ? 'd_min = ' + fmt(p.dminMode === 'meters' ? p.dminMeters : dOver * lam, 4) + ' m' : '' },
    { k: '波长 λ', v: fmtLambda(lam), s: lamSrc }
  ];
  const steps = [
    {
      title: '找 E 点（电压最小点）',
      body: '课件方法：先在圆图上找 E 点。电压最小点对应负实轴上的 Γ = −|Γ|；由 ρ 先算 |Γ|，E 点就确定了。',
      formulas: [
        { expr: '|Γ| = (ρ − 1)/(ρ + 1)', value: fmt(mag, 4) },
        { expr: 'E 点：Γ = −|Γ|', value: fmtGamma({ re: -mag, im: 0 }) }
      ],
      draw: function (h) {
        h.dot(-mag, 0, { color: COL.aux, label: 'E（V_{min}）', dx: -14, dy: 22, size: 6 });
        h.dot(mag, 0, { color: COL.load, label: 'V_{max}', dx: 12, dy: 22, hollow: true, size: 5 });
        h.badge(-mag, 0, '1', COL.aux);
      }
    },
    {
      title: '以 O 为圆心、OE 为半径作小圆',
      body: '课件的第 (2) 步：以圆图中心 O 为圆心、OE = |Γ| 为半径作小圆，它就是等反射系数（等驻波比）圆。',
      formulas: [{ expr: '半径 = |Γ|', value: fmt(mag, 4) }],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6], label: '等反射系数圆', labelAngle: 55 });
        h.dot(-mag, 0, { color: COL.aux, label: 'E', dx: -12, dy: 20, size: 5 });
        h.badge(0, mag + 0.06, '2', COL.swr);
      }
    },
    {
      title: 'OE 向负载转 d_{min}/λ 得 F',
      body: '课件的第 (3) 步：把 OE 向负载方向（圆图上逆时针）转过 d_{min}/λ 的刻度，得到点 F。方向口诀：顺向源、逆向负载。',
      formulas: [
        { expr: '转角 = 4π·d_{min}/λ', value: fmt(rotDeg, 1) + '°' },
        { expr: 'd_{min}/λ', value: fmt(dOver, 4) + ' λ' }
      ],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        h.arc(mag, 180, 180 + rotDeg, { color: COL.rot, label: '逆时针 ' + fmt(dOver, 4) + 'λ', labelAt: 0.5 });
        const fa = ((180 + rotDeg) * Math.PI) / 180;
        h.line([[0, 0], [1.08 * Math.cos(fa), 1.08 * Math.sin(fa)]], { color: COL.rot, dash: [4, 4], width: 1.5, clip: false });
        h.dot(1.06 * Math.cos(fa), 1.06 * Math.sin(fa), { color: COL.rot, label: 'F', dx: 8, dy: -10, hollow: true, size: 5 });
        h.dot(-mag, 0, { color: COL.aux, label: 'E', dx: -12, dy: 20, size: 5 });
        h.badge(g.re * 0.75, g.im * 0.75, '3', COL.rot);
      }
    },
    {
      title: 'OF 与圆交于 G（负载点）',
      body: '课件的第 (4) 步：射线 OF 与小圆相交得到 G 点，G 就是归一化负载阻抗对应的反射系数点。',
      formulas: [{ expr: 'G 点：Γ_{L} = |Γ|∠φ_{L}', value: fmtGamma(g) }],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        h.line([[0, 0], [g.re, g.im]], { color: COL.rot, dash: [4, 4], width: 1.4 });
        h.dot(g.re, g.im, { color: COL.load, label: 'G（负载）', dx: 12, dy: -14 });
        h.badge(g.re, g.im, '4', COL.load);
      }
    },
    {
      title: '读 G 点得 z_{L}，反归一化',
      body: '课件第 (5)(6) 步：由 G 点所在的等 r、等 x 圆读出归一化负载阻抗，再乘以 Z_{0}。',
      formulas: [
        { expr: 'z_{L} = r + jx（G 点读数）', value: zStr },
        { expr: 'Z_{L} = Z_{0}·z_{L}', value: fmtZ(z.re * p.z0, z.im * p.z0) + ' Ω' }
      ],
      draw: function (h) {
        h.dot(g.re, g.im, { color: COL.load, label: 'G  z_{L} = ' + zStr, dx: 12, dy: -14 });
        h.line([[g.re, 0], [g.re, g.im], [0, g.im]], { color: COL.load, dash: [3, 4], width: 1.2, clip: false });
        h.badge(g.re, g.im, '5', COL.load);
      }
    },
    {
      title: '校核',
      body: '用求得的 z_{L} 反算 |Γ| 与 ρ，与题给值对照；G 点应正好落在 E 点旋转 d_{min}/λ 后的射线上。',
      formulas: [
        { expr: '|Γ| = |(z−1)/(z+1)|', value: fmt(mag, 4) },
        { expr: 'ρ = (1+|Γ|)/(1−|Γ|)', value: fmt(rho, 3) }
      ],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        h.dot(-mag, 0, { color: COL.aux, label: 'E', dx: -12, dy: 20, size: 5 });
        h.dot(g.re, g.im, { color: COL.load, label: 'G', dx: 12, dy: -14 });
        h.badge(0, 0, '6', COL.read);
      }
    }
  ];
  return {
    steps: steps, summary: summary,
    legend: [
      { color: COL.aux, label: 'E 点（V_{min}）' },
      { color: COL.swr, label: '等反射系数圆' },
      { color: COL.rot, label: '向负载转 d_{min}/λ' },
      { color: COL.load, label: 'G 点（负载）' }
    ]
  };
};

builders.match = function (p) {
  const lam = S.wavelengthM(p.fGHz);
  const res = S.stubMatch(p.z0, p.zlRe, p.zlIm, { stubType: p.stubType });
  const z = S.normalizeZ(p.zlRe, p.zlIm, p.z0);
  const g = S.zToGamma(z.r, z.x);
  const mag = S.cabs(g);
  const idx = Math.min(Number(p.solutionIndex) || 0, Math.max(0, res.solutions.length - 1));
  const sol = res.solutions[idx];
  if (!sol) {
    return {
      steps: [{ title: '无匹配解', body: '该负载无法用单支节并联匹配（常见于 |Γ| ≥ 1 或边界情况），请调整负载。', formulas: [], draw: function () {} }],
      summary: [{ k: '提示', v: '无解', s: '请检查负载阻抗' }],
      legend: []
    };
  }
  const D = sol.gammaD;
  const yL = S.admittanceOfZ(z.r, z.x);
  const b = sol.b;
  const stubLambda = sol.stubOverLambda;
  const theta = 4 * 180 * sol.dOverLambda;
  const readY = S.waveLengthScale({ re: -g.re, im: -g.im });
  const aG = gAngle(g);
  let dAng = gAngle(D) - aG;
  while (dAng > 0) dAng -= 360;
  const other = res.solutions[1 - idx];
  const summary = [
    { k: '支节位置 d', v: fmt(sol.dOverLambda, 4) + ' λ', s: 'θ = ' + fmt(theta, 1) + '°，d = θ/(4π)·λ' + (other ? '；另一解 ' + fmt(other.dOverLambda, 4) + 'λ' : ''), accent: true },
    { k: '支节长度 l', v: fmt(stubLambda, 4) + ' λ', s: Number.isFinite(lam) ? 'l = ' + fmt(stubLambda * lam, 4) + ' m' : '', accent: true },
    { k: '交点 B 导纳 y(B)', v: '1 ' + (b >= 0 ? '+ j' : '− j') + Math.abs(b).toFixed(3), s: '需抵消电纳 j' + fmt(-b, 3) },
    { k: '匹配后 VSWR', v: '1.00', s: 'Γ = 0，完全匹配' },
    { k: '负载', v: fmtZ(p.zlRe, p.zlIm) + ' Ω', s: p.stubType === 'short' ? '并联短路支节' : '并联开路支节' },
    { k: '波长 λ', v: fmtLambda(lam), s: 'f = ' + p.fGHz + ' GHz' }
  ];
  const steps = [
    {
      title: '(a) 负载归一化并标出 z_{L}',
      body: '课件第 (a) 步：先求归一化负载阻抗 z_{L} = Z_{L}/Z_{0}，在圆图上标出 A 点。',
      formulas: [{ expr: 'z_{L} = Z_{L}/Z_{0}', value: fmtZ(z.r, z.x) }],
      draw: function (h) {
        h.dot(g.re, g.im, { color: COL.load, label: 'A  z_{L} = ' + fmtZ(z.r, z.x), dx: 12, dy: -14 });
        h.ray(g, { color: COL.gamma, dash: [6, 5] });
        h.badge(g.re, g.im, '1', COL.load);
      }
    },
    {
      title: '(b) 画等反射系数圆',
      body: '课件第 (b) 步：以 O 为圆心、|Γ_{L}| 为半径画等反射系数圆。沿它旋转 |Γ| 不变。',
      formulas: [{ expr: '半径 |Γ_{L}|', value: fmt(mag, 3) }],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6], label: '等反射系数圆', labelAngle: 55 });
        h.badge(0, mag + 0.06, '2', COL.swr);
      }
    },
    {
      title: '(c) 由对称点得 y_{L}',
      body: '课件第 (c) 步：取 z_{L} 关于圆心的对称点，得到归一化导纳 y_{L} = 1/z_{L}。注意课件“导纳三对调”：短路点与开路点位置对调、V_{max} 与 V_{min} 线对调、上下半区性质对调。',
      formulas: [
        { expr: 'y_{L} = 1/z_{L}', value: fmtZ(yL.re, yL.im) },
        { expr: 'y_{L} 对应波长刻度（朝源）', value: fmt(readY, 4) + ' λ' }
      ],
      draw: function (h) {
        h.dot(g.re, g.im, { color: COL.load, label: 'A（阻抗）', dx: 12, dy: -14 });
        h.dot(-g.re, -g.im, { color: COL.read, label: 'A′（导纳） y_{L} = ' + fmtZ(yL.re, yL.im), dx: 12, dy: 16, hollow: true });
        h.line([[g.re, g.im], [-g.re, -g.im]], { color: COL.read, dash: [3, 5], width: 1.3 });
        h.badge(-g.re, -g.im, '3', COL.read);
      }
    },
    {
      title: '(d) 向电源转到单位电导圆 g=1',
      body: '课件第 (d) 步：把导纳沿等反射系数圆向电源方向（顺时针）旋转，直到与单位电导圆（匹配圆 g=1）相交，有两个交点 B₁、B₂（即两组解）。在图上认这个圆：按导纳刻度，它的圆心是 <b>(g=3, b=0)</b>，半径取图上 <b>g=1 点到 g=3 点</b>这段长度；圆过图心 g=1 与左端 g=∞。注意：同一个点按阻抗刻度读是 r=1/3，不是 r=3。',
      formulas: [
        { expr: '单位电导圆 g=1（导纳刻度）', value: '圆心 (g=3, b=0)；半径 = g=1→g=3 段' },
        { expr: '两个交点', value: 'y = 1 + jb 或 1 − jb' }
      ],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        h.circle(-0.5, 0, 0.5, { color: COL.read, dash: [6, 5], width: 2, label: '单位电导圆 g = 1', labelAngle: 118 });
        h.line([[0, 0], [-0.5, 0]], { color: COL.read, dash: [2, 3], width: 1.1 });
        h.dot(-0.5, 0, { color: COL.read, label: 'g=3（圆心）', dx: 8, dy: 18, size: 4.5 });
        for (let i = 0; i < res.solutions.length; i++) {
          const B = res.solutions[i].gammaD;
          h.dot(B.re, B.im, { color: COL.read, label: 'B' + (i + 1), dx: 8, dy: 16, hollow: true, size: 5 });
        }
        h.badge(-0.5, 0.35, '4', COL.read);
      }
    },
    {
      title: '(e) 读 B 点导纳并求 d',
      body: '课件第 (e) 步：读出交点导纳 y = 1 ± jb，并由旋转角 θ 求支节位置 d = (θ/4π)λ；d 也可取 d ± nλ/2，工程上常取靠近负载、较短的一组。',
      formulas: [
        { expr: 'B 点导纳 y(B)', value: '1 ' + (b >= 0 ? '+ j' : '− j') + Math.abs(b).toFixed(3) },
        { expr: '旋转角 θ = 4π·d/λ', value: fmt(theta, 1) + '°' },
        { expr: 'd = (θ/4π)·λ', value: fmt(sol.dOverLambda, 4) + ' λ（d ± nλ/2）' }
      ],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        h.circle(-0.5, 0, 0.5, { color: COL.read, dash: [6, 5], width: 1.6 });
        h.arc(mag, aG, aG + dAng, { color: COL.rot, label: 'θ = ' + fmt(theta, 1) + '°', labelAt: 0.55, arrow: true });
        h.dot(g.re, g.im, { color: COL.load, label: 'A', dx: 12, dy: -14 });
        h.dot(D.re, D.im, { color: COL.rot, label: 'B' + (idx + 1) + '  y = 1 + j' + fmt(b, 3), dx: 12, dy: -14 });
        h.badge(D.re, D.im, '5', COL.rot);
      }
    },
    {
      title: '(f) 看单位外圆求支节长度 l',
      body: p.stubType === 'short'
        ? '课件第 5 步：短路支节 y = −j·cot(2πl/λ)，要抵消 B 点电纳，可从短路点 P_{sc} 沿单位外圆顺时针转到工作点，读 l/λ。共有两组解，一般选长度较短的一组。'
        : '课件第 5 步：开路支节 y = j·tan(2πl/λ)，要抵消 B 点电纳，可从开路点 P_{oc} 沿单位外圆顺时针转到工作点，读 l/λ。共有两组解，一般选长度较短的一组。',
      formulas: [
        { expr: 'b_stub = −b', value: fmt(-b, 4) },
        { expr: p.stubType === 'short' ? 'l/λ = arccot(b)/(2π)' : 'l/λ = arctan(−b)/(2π)', value: fmt(stubLambda, 4) + ' λ' },
        { expr: '另一组解', value: other ? fmt(other.stubOverLambda, 4) + ' λ' : '—' }
      ],
      draw: function (h) {
        h.dot(D.re, D.im, { color: COL.rot, label: 'B' + (idx + 1), dx: 12, dy: -14 });
        const start = p.stubType === 'short' ? 0 : 180;
        const end = start - 720 * stubLambda;
        h.dot(Math.cos((start * Math.PI) / 180), Math.sin((start * Math.PI) / 180), {
          color: COL.aux, label: p.stubType === 'short' ? 'P_{sc}' : 'P_{oc}', dx: 8, dy: 16, hollow: true, size: 5
        });
        h.arc(1.0, start, end, { color: COL.aux, label: '顺时针 l/λ = ' + fmt(stubLambda, 4), labelAt: 0.5, labelRadius: 1.015 });
        const endRad = (end * Math.PI) / 180;
        h.dot(Math.cos(endRad), Math.sin(endRad), { color: COL.aux, label: 'y_{stub}', dx: 10, dy: -12, hollow: true, size: 5 });
        h.badge(D.re * 0.7, D.im * 0.7, '6', COL.aux);
      }
    },
    {
      title: '(g) 校核：匹配后 Γ = 0',
      body: '支节接入后总导纳为 1，即圆图圆心（匹配点），Γ = 0、VSWR = 1。',
      formulas: [
        { expr: 'y_{total} = 1 + jb + jb_stub', value: '1 + j0' },
        { expr: 'Γ_{total}', value: '0（圆心）' }
      ],
      draw: function (h) {
        h.dot(0, 0, { color: COL.swr, label: '匹配点 Γ = 0', dx: 12, dy: -16, size: 8 });
        h.circle(-0.5, 0, 0.5, { color: COL.read, dash: [6, 5], width: 1.2 });
        h.dot(D.re, D.im, { color: COL.rot, label: 'B' + (idx + 1), dx: 12, dy: -14, hollow: true });
        h.badge(0, 0, '7', COL.swr);
      }
    }
  ];
  return {
    steps: steps, summary: summary,
    legend: [
      { color: COL.load, label: '负载点 A' },
      { color: COL.read, label: '导纳点 A′ / 单位电导圆（圆心 g=3）' },
      { color: COL.swr, label: '等反射系数圆' },
      { color: COL.rot, label: '向电源旋转到 B' },
      { color: COL.aux, label: '支节长度（P_{sc}/P_{oc} 起转）' }
    ]
  };
};

builders.admittance = function (p) {
  const lam = S.wavelengthM(p.fGHz);
  const lOver = p.lengthMode === 'meters' ? (lam > 0 ? p.lMeters / lam : NaN) : p.lLambda;
  const z = S.normalizeZ(p.zlRe, p.zlIm, p.z0);
  const g = S.zToGamma(z.r, z.x);
  const mag = S.cabs(g), ang = gAngle(g);
  const yLg = { re: -g.re, im: -g.im };
  const yL = S.admittanceOfZ(z.r, z.x);
  const gIn = S.rotateTowardGenerator(g, lOver);
  const zi = S.gammaToZ(gIn);
  const yi = S.admittanceOfZ(zi.re, zi.im);
  const yIng = { re: -gIn.re, im: -gIn.im };
  const lB = S.waveLengthScale(g);
  const lC = mod(lB + lOver, 0.5);
  const rem = mod(lOver, 0.5);
  const turns = Math.floor(lOver / 0.5);
  const yLstr = fmtZ(yL.re, yL.im);
  const yiStr = fmtZ(yi.re, yi.im);
  const steps = [
    {
      title: '先在阻抗圆图上定位 z_{L}',
      body: '教材 4.1.4 的导纳圆图由阻抗圆图绕圆心转 180° 得到：形状、刻度、旋转方向都不变，只是每一点的含义由 z 变成 y（表 4.4）。先在阻抗圆图上标出 A 点。',
      formulas: [
        { expr: 'z_{L} = Z_{L}/Z_{0}', value: fmtZ(z.r, z.x) },
        { expr: 'Γ_{L} = (z_{L} − 1)/(z_{L} + 1)', value: fmtGamma(g) }
      ],
      draw: function (h) {
        h.dot(g.re, g.im, { color: COL.load, label: 'A  z_{L} = ' + fmtZ(z.r, z.x), dx: 12, dy: -14 });
        h.ray(g, { color: COL.gamma, dash: [6, 5] });
        h.badge(g.re, g.im, '1', COL.load);
      }
    },
    {
      title: '转 180° 得归一化导纳 y_{L}',
      body: '把 A 点绕圆心转 180° 得到导纳点 A′。教材式 (4.63)：Γ_{I} = −Γ；所以转 180° 就是阻抗圆图与导纳圆图的对应关系。',
      formulas: [
        { expr: 'y_{L} = 1/z_{L}', value: yLstr },
        { expr: 'Γ_{I} = −Γ', value: fmtGamma(yLg) }
      ],
      draw: function (h) {
        h.dot(g.re, g.im, { color: COL.load, label: 'A（阻抗）', dx: 12, dy: -14 });
        h.dot(yLg.re, yLg.im, { color: COL.read, label: 'A′（导纳） y_{L} = ' + yLstr, dx: 12, dy: 16, hollow: true });
        h.line([[g.re, g.im], [yLg.re, yLg.im]], { color: COL.read, dash: [3, 5], width: 1.3 });
        h.badge(yLg.re, yLg.im, '2', COL.read);
      }
    },
    {
      title: '画等反射系数圆',
      body: '导纳圆图上的等反射系数圆与阻抗圆图是同一个圆（|Γ| 不变），所以 d 的落点仍在这个圆上；导纳实部 g 随转动变化。',
      formulas: [{ expr: '半径 |Γ|', value: fmt(mag, 3) }],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6], label: '等反射系数圆', labelAngle: 55 });
        h.badge(0, mag + 0.06, '3', COL.swr);
      }
    },
    {
      title: '在导纳圆图上顺时针转 l/λ',
      body: '由 y_{L} 沿等反射系数圆顺时针（朝源）转 l/λ，得到输入导纳点。教材例 4.6 中 l/λ = 0.15，正是一圈 0.5λ 的一部分。',
      formulas: [
        { expr: 'y_{in} = y_{L}·e^{−j4π l/λ}', value: yiStr },
        { expr: 'l/λ', value: fmt(lOver, 4) + ' λ' },
        { expr: '顺时针转角', value: fmt(720 * rem, 1) + '°' + (turns > 0 ? '（另 ' + turns + ' 圈）' : '') }
      ],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        h.arc(mag, gAngle(yLg), gAngle(yLg) - 720 * rem, { color: COL.rot, label: '顺时针 ' + fmt(rem, 4) + 'λ', labelAt: 0.55 });
        h.dot(yIng.re, yIng.im, { color: COL.rot, label: 'y_{in} = ' + yiStr, dx: 12, dy: -14 });
        h.scaleTick(lC, { color: COL.rot, label: 'l_{C}/λ = ' + fmt(lC, 4) });
        h.badge(yIng.re * 0.8, yIng.im * 0.8, '4', COL.rot);
      }
    },
    {
      title: '读 g、b 并反归一化',
      body: '导纳圆图上读出归一化电导 g 与电纳 b，再除以 Z_{0} 得实际导纳 Y_{in} = y_{in}/Z_{0}（单位 S）；其倒数就是输入阻抗。',
      formulas: [
        { expr: 'y_{in} = g + jb', value: yiStr },
        { expr: 'Y_{in} = y_{in}/Z_{0}', value: fmt(yi.re / p.z0, 4) + ' ' + (yi.im >= 0 ? '+ j' : '− j') + Math.abs(yi.im / p.z0).toFixed(4) + ' S' },
        { expr: 'Z_{in} = 1/Y_{in}', value: fmtZ(zi.re * p.z0, zi.im * p.z0) + ' Ω' }
      ],
      draw: function (h) {
        h.dot(yIng.re, yIng.im, { color: COL.rot, label: 'y_{in} = ' + yiStr, dx: 12, dy: -14 });
        h.line([[yIng.re, 0], [yIng.re, yIng.im], [0, yIng.im]], { color: COL.rot, dash: [3, 4], width: 1.2, clip: false });
        h.badge(yIng.re, yIng.im, '5', COL.rot);
      }
    }
  ];
  const summary = [
    { k: '归一化导纳 y_{L}', v: yLstr, s: 'Y_{L} = y_{L}/Z_{0}', accent: true },
    { k: '归一化输入导纳 y_{in}', v: yiStr, s: '顺时针转 ' + fmt(lOver, 4) + 'λ', accent: true },
    { k: '输入导纳 Y_{in}', v: fmt(yi.re / p.z0, 4) + (yi.im >= 0 ? ' + j' : ' − j') + Math.abs(yi.im / p.z0).toFixed(4) + ' S', s: '单位：西 [S]' },
    { k: '输入阻抗 Z_{in}', v: fmtZ(zi.re * p.z0, zi.im * p.z0) + ' Ω', s: '与 Y_{in} 互为倒数' },
    { k: '线长 l/λ', v: fmt(lOver, 4) + ' λ', s: Number.isFinite(lam) ? 'l = ' + fmt(p.lengthMode === 'meters' ? p.lMeters : lOver * lam, 4) + ' m' : '' },
    { k: '波长 λ', v: fmtLambda(lam), s: 'f = ' + p.fGHz + ' GHz' }
  ];
  return {
    steps: steps, summary: summary,
    legend: [
      { color: COL.load, label: '负载阻抗点 A' },
      { color: COL.read, label: '导纳点 A′（转 180°）' },
      { color: COL.swr, label: '等反射系数圆' },
      { color: COL.rot, label: '顺时针转 l/λ' }
    ]
  };
};

builders.yinv = function (p) {
  const lam = S.wavelengthM(p.fGHz);
  const lOver = p.lengthMode === 'meters' ? (lam > 0 ? p.lMeters / lam : NaN) : p.lLambda;
  const yin = { re: p.yinRe * p.z0, im: p.yinIm * p.z0 };
  const Gin = S.cdiv({ re: 1 - yin.re, im: -yin.im }, { re: 1 + yin.re, im: yin.im });
  const GL = S.rotateTowardLoad(Gin, lOver);
  const zL = S.gammaToZ(GL);
  const yL = S.cdiv({ re: 1 - GL.re, im: -GL.im }, { re: 1 + GL.re, im: GL.im });
  const angIn = gAngle(Gin);
  const summary = [
    { k: '负载阻抗 Z_L', v: fmtZ(zL.re * p.z0, zL.im * p.z0) + ' Ω', s: 'z_L = ' + fmtZ(zL.re, zL.im), accent: true },
    { k: '负载导纳 Y_L', v: fmt(yL.re / p.z0, 4) + (yL.im >= 0 ? ' + j' : ' − j') + Math.abs(yL.im / p.z0).toFixed(4) + ' S', s: 'y_L = ' + fmtZ(yL.re, yL.im) },
    { k: '输入导纳 Y_in', v: fmt(p.yinRe, 4) + (p.yinIm >= 0 ? ' + j' : ' − j') + Math.abs(p.yinIm).toFixed(4) + ' S', s: 'y_in = ' + fmtZ(yin.re, yin.im) },
    { k: '线长 l/λ', v: fmt(lOver, 4) + ' λ', s: '向负载（逆时针）' },
    { k: '波长 λ', v: fmtLambda(lam), s: 'f = ' + p.fGHz + ' GHz' }
  ];
  const steps = [
    {
      title: '归一化输入导纳',
      body: '先把给定的输入导纳换算成归一化值 y_{in} = Y_{in}·Z_{0}；它在圆图上的点是 Γ_{in} = (1−y_{in})/(1+y_{in})，该点的阻抗读数就是 z_{in}=1/y_{in}。',
      formulas: [
        { expr: 'y_{in} = Y_{in}·Z_{0}', value: fmtZ(yin.re, yin.im) },
        { expr: 'Γ_{in} = (1−y_{in})/(1+y_{in})', value: fmtGamma(Gin) }
      ],
      draw: function (h) {
        h.dot(Gin.re, Gin.im, { color: COL.load, label: 'P_{in}（y_{in}）', dx: 12, dy: -14 });
        h.ray(Gin, { color: COL.gamma, dash: [6, 5] });
        h.badge(Gin.re, Gin.im, '1', COL.load);
      }
    },
    {
      title: '画等反射系数圆',
      body: '由负载到输入端的无耗线上 |Γ| 不变，所以 P_{in} 一定落在以 O 为圆心、|Γ_{in}| 为半径的圆上。',
      formulas: [{ expr: '半径 |Γ_{in}|', value: fmt(S.cabs(Gin), 3) }],
      draw: function (h) {
        h.circle(0, 0, S.cabs(Gin), { color: COL.swr, dash: [8, 6], label: '等反射系数圆', labelAngle: 55 });
        h.badge(0, S.cabs(Gin) + 0.06, '2', COL.swr);
      }
    },
    {
      title: '向负载（逆时针）转 l/λ',
      body: '已知的是输入端，要求负载端，所以从 P_{in} 向负载方向（圆图逆时针）转 l/λ，得到负载点 Γ_{L}。方向口诀：顺向源、逆向负载。',
      formulas: [
        { expr: 'Γ_{L} = Γ_{in}·e^{+j4π l/λ}', value: fmtGamma(GL) },
        { expr: '转角', value: fmt(720 * lOver, 1) + '°' }
      ],
      draw: function (h) {
        h.circle(0, 0, S.cabs(Gin), { color: COL.swr, dash: [8, 6] });
        h.arc(S.cabs(Gin), angIn, angIn + 720 * lOver, { color: COL.rot, label: '逆时针 ' + fmt(lOver, 4) + 'λ', labelAt: 0.5 });
        h.dot(GL.re, GL.im, { color: COL.rot, label: 'Γ_{L}（负载点）', dx: 12, dy: -14 });
        h.badge(GL.re, GL.im, '3', COL.rot);
      }
    },
    {
      title: '由负载点读 z_L 并取倒数',
      body: '负载点 Γ_{L} 的阻抗读数为 z_{L}；再反归一化得 Z_{L}=z_{L}·Z_{0}，同时可读出 y_{L}。',
      formulas: [
        { expr: 'z_{L} = (1+Γ_{L})/(1−Γ_{L})', value: fmtZ(zL.re, zL.im) },
        { expr: 'Z_{L} = Z_{0}·z_{L}', value: fmtZ(zL.re * p.z0, zL.im * p.z0) + ' Ω' },
        { expr: 'y_{L} = 1/z_{L}', value: fmtZ(yL.re, yL.im) }
      ],
      draw: function (h) {
        h.dot(GL.re, GL.im, { color: COL.rot, label: 'Γ_{L}  z_{L} = ' + fmtZ(zL.re, zL.im), dx: 12, dy: -14 });
        h.line([[GL.re, 0], [GL.re, GL.im], [0, GL.im]], { color: COL.rot, dash: [3, 4], width: 1.2, clip: false });
        h.badge(GL.re, GL.im, '4', COL.rot);
      }
    },
    {
      title: '校核',
      body: '把 Γ_{L} 再向电源（顺时针）转回 l/λ，应回到 P_{in}；由此重算的 Y_{in} 应与题给一致，即闭合校核。',
      formulas: [
        { expr: 'y_{in}（回算）', value: fmtZ(yin.re, yin.im) },
        { expr: 'Y_{in} = y_{in}/Z_{0}', value: fmt(p.yinRe, 4) + (p.yinIm >= 0 ? ' + j' : ' − j') + Math.abs(p.yinIm).toFixed(4) + ' S' }
      ],
      draw: function (h) {
        h.circle(0, 0, S.cabs(Gin), { color: COL.swr, dash: [8, 6] });
        h.dot(Gin.re, Gin.im, { color: COL.load, label: 'P_{in}', dx: 12, dy: -14 });
        h.dot(GL.re, GL.im, { color: COL.rot, label: 'Γ_{L}', dx: 12, dy: -14 });
        h.badge(0, 0, '5', COL.read);
      }
    }
  ];
  return {
    steps: steps, summary: summary,
    legend: [
      { color: COL.load, label: '输入点 P_{in}' },
      { color: COL.swr, label: '等反射系数圆' },
      { color: COL.rot, label: '向负载转 → 负载点' }
    ]
  };
};

builders.length = function (p) {
  const yL = { re: p.ylRe, im: p.ylIm };
  const GL = S.cdiv({ re: 1 - yL.re, im: -yL.im }, { re: 1 + yL.re, im: yL.im });
  const mag = S.cabs(GL);
  const angL = gAngle(GL);
  const mode = p.targetMode === 'g1' ? 'g1' : 'exact';
  const items = [];
  if (mode === 'exact') {
    const yt = { re: p.ytRe, im: p.ytIm };
    const Gt = S.cdiv({ re: 1 - yt.re, im: -yt.im }, { re: 1 + yt.re, im: yt.im });
    const reachable = Math.abs(S.cabs(Gt) - mag) < 1e-6;
    if (reachable) {
      let d = angL - gAngle(Gt);
      d = mod(d, 360);
      items.push({ y: yt, g: Gt, l: d / 720, ok: true });
    }
  } else {
    const u = -mag * mag;
    const vAbs = Math.sqrt(Math.max(0, mag * mag - u * u));
    const vs = vAbs === 0 ? [0] : [vAbs, -vAbs];
    for (const v of vs) {
      const Gt = { re: u, im: v };
      const yt = S.cdiv({ re: 1 - Gt.re, im: -Gt.im }, { re: 1 + Gt.re, im: Gt.im });
      let d = angL - gAngle(Gt);
      d = mod(d, 360);
      items.push({ y: yt, g: Gt, l: d / 720, ok: true });
    }
    items.sort(function (a, b) { return a.l - b.l; });
  }
  const summary = [];
  if (!items.length) {
    summary.push({ k: '提示', v: '无解', s: '目标 y_{in} 与 y_{L} 不在同一等反射系数圆上' });
  } else {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      summary.push({
        k: items.length > 1 ? '解 ' + (i + 1) + '：l/λ' : '所需 l/λ',
        v: fmt(it.l, 4) + ' λ',
        s: 'y_{in} = ' + fmtZ(it.y.re, it.y.im) + (mode === 'g1' ? '；b_{in} = ' + (it.y.im > 0 ? '−' : '') + Math.abs(it.y.im).toFixed(3) : ''),
        accent: i === 0
      });
    }
    summary.push({ k: '负载 y_L', v: fmtZ(yL.re, yL.im), s: '|Γ| = ' + fmt(mag, 3) });
  }
  const steps = [
    {
      title: '画负载导纳点',
      body: '已知负载归一化导纳 y_{L}，对应圆图上的点 Γ_{L} = (1−y_{L})/(1+y_{L})；负载点定下后，沿等反射系数圆旋转即可改变输入导纳。',
      formulas: [
        { expr: 'Γ_{L} = (1−y_{L})/(1+y_{L})', value: fmtGamma(GL) },
        { expr: 'y_{L}', value: fmtZ(yL.re, yL.im) }
      ],
      draw: function (h) {
        h.dot(GL.re, GL.im, { color: COL.load, label: 'L（y_{L}）', dx: 12, dy: -14 });
        h.badge(GL.re, GL.im, '1', COL.load);
      }
    },
    {
      title: '画等反射系数圆',
      body: '沿线移动 |Γ| 不变，所以目标的 y_{in} 必须落在以 O 为圆心、|Γ| 为半径的圆上。',
      formulas: [{ expr: '半径 |Γ|', value: fmt(mag, 3) }],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6], label: '等反射系数圆', labelAngle: 55 });
        h.badge(0, mag + 0.06, '2', COL.swr);
      }
    },
    {
      title: '找目标点并求 l/λ',
      body: mode === 'g1'
        ? '目标要求 Re(y_{in})=1，即与单位电导圆（匹配圆 g=1）的交点，一般有两个解。这个圆在图上：按导纳刻度圆心为 (g=3,b=0)，半径取图上 g=1→g=3 这段长度（Γ 半径 0.5）。注意同一个点按阻抗刻度是 r=1/3，不是 r=3。由 L 向电源（顺时针）转到目标点的角度 θ 给出 l/λ=θ/720。'
        : '把目标 y_{in} 换成圆图上的目标点，由 L 向电源（顺时针）转到该点的角度 θ 给出 l/λ=θ/720。',
      formulas: [
        { expr: mode === 'g1' ? '单位电导圆 g=1（导纳刻度）' : '目标点 Γ_{in} = (1−y_{in})/(1+y_{in})', value: mode === 'g1' ? '圆心 (g=3,b=0)；半径 = g=1→g=3 段' : (items[0] ? fmtGamma(items[0].g) : '—') },
        { expr: 'l/λ = θ/720°', value: items.map(function (it, i) { return '解' + (i + 1) + ' ' + fmt(it.l, 4) + 'λ'; }).join('；') }
      ],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        if (mode === 'g1') { h.circle(-0.5, 0, 0.5, { color: COL.read, dash: [6, 5], width: 1.8, label: '单位电导圆 g=1', labelAngle: 118 }); h.line([[0, 0], [-0.5, 0]], { color: COL.read, dash: [2, 3], width: 1.1 }); h.dot(-0.5, 0, { color: COL.read, label: 'g=3（圆心）', dx: 8, dy: 18, size: 4.5 }); }
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          h.arc(mag, angL, angL - 720 * it.l, { color: COL.rot, width: 1.8, dash: i ? [4, 4] : null, arrow: i === 0, label: i === 0 ? 'l/λ = ' + fmt(it.l, 4) : '', labelAt: 0.55 });
          h.dot(it.g.re, it.g.im, { color: COL.rot, label: 'T' + (i + 1), dx: 8, dy: -12, hollow: true, size: 5 });
        }
        h.dot(GL.re, GL.im, { color: COL.load, label: 'L', dx: 12, dy: -14 });
        h.badge(GL.re * 0.7, GL.im * 0.7, '3', COL.rot);
      }
    },
    {
      title: '读 y_{in}（及 b_{in}）',
      body: mode === 'g1'
        ? '两个交点对应两个支节位置；题目写 y_{in}=1−j b_{in} 时，取虚部为负的那个解。'
        : '读出目标点的归一化导纳 y_{in}，与题目要求对照。',
      formulas: items.map(function (it, i) {
        return { expr: '解 ' + (i + 1) + '：y_{in}', value: fmtZ(it.y.re, it.y.im) + (mode === 'g1' ? '（b_{in} = ' + (it.y.im >= 0 ? '+' : '−') + Math.abs(it.y.im).toFixed(3) + '）' : '') };
      }).concat(items.length ? [{ expr: 'l/λ', value: items.map(function (it, i) { return '解' + (i + 1) + ' ' + fmt(it.l, 4); }).join('；') }] : []),
      draw: function (h) {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          h.dot(it.g.re, it.g.im, { color: COL.rot, label: 'T' + (i + 1) + '  y = ' + fmtZ(it.y.re, it.y.im), dx: 10, dy: -12 });
        }
        h.badge(0, 0, '4', COL.read);
      }
    },
    {
      title: '校核',
      body: '把目标点按求得的 l/λ 反向（向负载）转回，应回到负载点 L；即验证 y_{in} 与 l/λ 的对应关系。',
      formulas: [{ expr: '|Γ_{L}| = |Γ_{in}|', value: fmt(mag, 3) + '（同一等反射系数圆）' }],
      draw: function (h) {
        h.circle(0, 0, mag, { color: COL.swr, dash: [8, 6] });
        h.dot(GL.re, GL.im, { color: COL.load, label: 'L', dx: 12, dy: -14 });
        for (let i = 0; i < items.length; i++) h.dot(items[i].g.re, items[i].g.im, { color: COL.rot, label: 'T' + (i + 1), dx: 8, dy: -12, hollow: true, size: 5 });
        h.badge(0, 0, '5', COL.read);
      }
    }
  ];
  return {
    steps: steps, summary: summary,
    legend: [
      { color: COL.load, label: '负载点 L（y_L）' },
      { color: COL.swr, label: '等反射系数圆' },
      { color: COL.read, label: '单位电导圆（圆心 g=3）' },
      { color: COL.rot, label: '向电源转到目标点' }
    ]
  };
};

builders.anatomy = function () {
  const rVals = [0.25, 0.5, 0.75, 1, 2];
  const xVals = [0.5, 1, 2, 4];
  const xLabel = [0.5, 1, 2, 4];
  const reference = [
    { color: COL.load, name: '实轴（x = 0）', desc: '纯电阻线，三个特殊点：左端短路 P_{sc}（Γ=−1，z=0，K=0）— 中间匹配（Γ=0，z=1，ρ=1）— 右端开路 P_{oc}（Γ=+1，z=∞，ρ→∞）。左半轴为电压波节点 V_{min}，读行波系数 K；右半轴为电压波腹点 V_{max}，读驻波比 ρ。K=1/ρ（书页 55）。' },
    { color: COL.gamma, name: '等 r 圆簇（阻抗系）', desc: '圆心 (r/(1+r), 0)，半径 1/(1+r)；印刷圆 r = 0, 0.25, 0.5, 0.75, 1, 2 …（越靠右越密）。同一圆上 r 不变，圆与实轴的两个交点给出该 r 对应的两个 Γ 实数点。' },
    { color: COL.rot, name: '等 x 圆簇（阻抗系）', desc: '圆心 (1, 1/x)，半径 1/|x|；上半平面为 +jX（感性），下半平面为 −jX（容性）；印刷值 ±0.5, ±1, ±2, ±4 …（上下对称）。' },
    { color: COL.swr, name: '单位圆 |Γ| = 1', desc: '全反射边界，圆内 |Γ| < 1 为无源负载区；圆外属有源/特殊情形，本工具默认不绘制。' },
    { color: COL.aux, name: '等驻波比圆（示例）', desc: '不印在图上，是以 O 为圆心的同心圆族，半径 = |Γ|；ρ = (1+|Γ|)/(1−|Γ|)。图中示例 |Γ| = 0.5 → ρ = 3。' },
    { color: COL.read, name: '波长刻度（外圈）', desc: '外圈电长度刻度：从短路点 0 起顺时针 0 → 0.1λ → … → 0.5λ，一整圈（360°）= 0.5λ = 1/2 波长；朝源读数增大，朝载另用一侧刻度；l/λ = (π − ∠Γ)/(4π)。' },
    { color: COL.read, name: '相角刻度（外圈）', desc: 'ANGLE OF REFLECTION COEFFICIENT：反射系数相角，0° ~ ±180°。' },
    { color: COL.ink, name: '径向标尺（图外）', desc: '教材图 4.6 下方 RADIALLY SCALED PARAMETERS：SWR、dBS、ATTN、RTN LOSS、REFL COEFF、TRANSM COEFF 等。把某个 |Γ| 半径投影到标尺上即可读值；本软件直接算数值，无需手投影。' },
    { color: COL.read, name: '导纳读法', desc: '同一点绕圆心转 180° 即得 y = 1/z（书 4.1.4、表 4.4）：r ↔ g、x ↔ b。印刷带双标注——上半带“+jX（感性）或 +jB（容性）”，下半带“−jX（容性）或 −jB（感性）”。' }
  ];
  const steps = [
    {
      title: '坐标系与三个特殊点：左短 · 中匹配 · 右开',
      body: '整张图是反射系数 Γ 的平面。三个特殊点一定要先记住：<b>左端</b> Γ=−1 是短路点 P_{sc}（z=0，K=0）；<b>圆心</b> Γ=0 是匹配点（z=1，ρ=1）；<b>右端</b> Γ=+1 是开路点 P_{oc}（z=∞，ρ→∞）。圆内 |Γ|<1 是无源负载区，圆周 |Γ|=1 是全反射边界。',
      formulas: [
        { expr: '左端 P_{sc}：Γ=−1，z=0，K=0', value: '左短（短路）' },
        { expr: '圆心：Γ=0，z=1，ρ=1', value: '中间（匹配）' },
        { expr: '右端 P_{oc}：Γ=+1，z=∞，ρ→∞', value: '右开（开路）' }
      ],
      draw: function (h) {
        h.circle(0, 0, 1, { color: COL.swr, dash: [], width: 3 });
        h.line([[-0.98, 0], [0.98, 0]], { color: 'rgba(17,24,39,0.35)', width: 1.4 });
        h.dot(-1, 0, { color: COL.aux, hollow: true, size: 8 });
        h.dot(1, 0, { color: COL.load, hollow: true, size: 8 });
        h.dot(0, 0, { color: COL.swr, size: 8 });
        h.boxText(-0.58, 0.22, '左端：短路 P_{sc}（Γ=−1，z=0）', { color: COL.aux, align: 'center', size: 13 });
        h.boxText(0.60, 0.22, '右端：开路 P_{oc}（Γ=+1，z=∞）', { color: COL.load, align: 'center', size: 13 });
        h.boxText(0, -0.22, '圆心：匹配点 Γ=0（z=1，ρ=1）', { color: COL.swr, align: 'center', size: 13.5 });
        h.text(0, 1.1, '|Γ| = 1 全反射边界（圆内 |Γ| < 1）', { color: COL.swr, align: 'center', size: 13 });
        h.badge(0, 0.9, '1', COL.swr);
      }
    },
    {
      title: '水平主轴：纯电阻（x = 0）',
      body: '实轴是 x = 0 的纯电阻线：从左端 r=0 到圆心 r=1，再到右端 r→∞，r 向右增大。这条轴同时是沿线电压的参考线：左半轴（圆心→P_{sc}）是电压波节点 V_{min}，右半轴（圆心→P_{oc}）是电压波腹点 V_{max}——下一步把它们的刻度（K、ρ）画在轴上。',
      formulas: [
        { expr: '实轴：x = 0，z = r', value: '左端 r=0，圆心 r=1，右端 r→∞' }
      ],
      draw: function (h) {
        h.line([[-0.99, 0], [0.99, 0]], { color: COL.load, width: 3.4 });
        h.text(0, 0.05, 'x = 0  纯电阻轴', { color: COL.load, align: 'center', dx: 0, dy: -16, size: 14 });
        h.text(0.86, 0, 'r 增大 →', { color: COL.load, align: 'right', dy: 22, size: 12.5 });
        h.badge(-0.55, 0.16, '2', COL.load);
      }
    },
    {
      title: '主轴刻度：左波节点（读 K）· 右波腹点（读 ρ）',
      body: '实轴左半段（圆心→P_{sc}）是电压波节点 V_{min} 的位置，轴上刻度读 <b>行波系数 K</b>；右半段（圆心→P_{oc}）是电压波腹点 V_{max} 的位置，轴上刻度读 <b>驻波比 ρ</b>。两段共用同一根实轴：左段 K 从圆心 1 减小到 P_{sc} 处 0，右段 ρ 从圆心 1 增大到 P_{oc} 处 ∞。',
      formulas: [
        { expr: '左半轴：V_{min}，读数 K = 1/ρ', value: '圆心 K=1 → P_{sc} 处 K=0' },
        { expr: '右半轴：V_{max}，读数 ρ', value: '圆心 ρ=1 → P_{oc} 处 ρ→∞' },
        { expr: 'K = (1−|Γ|)/(1+|Γ|)，ρ = (1+|Γ|)/(1−|Γ|)', value: '书页 55（4.1.2 特点）' }
      ],
      draw: function (h) {
        h.line([[0, 0], [-1, 0]], { color: COL.aux, width: 4.4 });
        h.line([[0, 0], [1, 0]], { color: COL.swr, width: 4.4 });
        h.dot(0, 0, { color: COL.ink, size: 4.5 });
        h.boxText(-0.52, 0.22, '← 左端短路 P_{sc}：V_{min}，读 K（K=0）', { color: COL.aux, align: 'center', size: 13 });
        h.boxText(0.55, 0.22, '右端开路 P_{oc}：V_{max}，读 ρ（ρ→∞）→', { color: COL.swr, align: 'center', size: 13 });
        const kTicks = [0.8, 0.5, 0.33, 0.2, 0];
        for (let i = 0; i < kTicks.length; i++) {
          const K = kTicks[i];
          const u = -(1 - K) / (1 + K);
          h.line([[u, -0.025], [u, 0.025]], { color: COL.aux, width: 2.2, clip: false });
          h.boxText(u, 0.02, 'K=' + fmt(K, 2), { color: COL.aux, align: 'center', dy: -17, size: 12.5 });
        }
        const rTicks = [1.5, 2, 3, 5, 10];
        for (let i = 0; i < rTicks.length; i++) {
          const rho = rTicks[i];
          const u = (rho - 1) / (rho + 1);
          h.line([[u, -0.025], [u, 0.025]], { color: COL.swr, width: 2.2, clip: false });
          h.boxText(u, -0.02, 'ρ=' + fmt(rho, 1), { color: COL.swr, align: 'center', dy: 18, size: 12.5 });
        }
        h.boxText(0.995, -0.02, 'ρ→∞', { color: COL.swr, align: 'right', dy: 18, size: 12.5 });
        h.boxText(0, 0.42, '圆心：匹配点 Γ=0（K = ρ = 1）', { color: COL.swr, align: 'center', size: 13 });
        h.badge(-0.16, 0.30, '3', COL.aux);
      }
    },
    {
      title: '上下半平面：+j 区与 −j 区',
      body: '上半平面是 +j 区（感性电抗 +jX），下半平面是 −j 区（容性电抗 −jX）——图上原始印刷带也如此标注：上半带“+jX 或 +jB”，下半带“−jX 或 −jB”。等 x 圆都以右端 P_{oc}(1,0) 为切点，|x| 越小越贴近实轴。',
      formulas: [
        { expr: '上半：+jX（感性）', value: '下半：−jX（容性）' },
        { expr: '导纳读法时', value: '上半带对应 +jB（容性），下半带对应 −jB（感性）' }
      ],
      draw: function (h) {
        h.fillHalf('top', '#f59e0b', 0.10);
        h.fillHalf('bottom', '#2563eb', 0.09);
        h.text(0, 0.62, '+j 区（感性）', { color: '#b45309', align: 'center', size: 20 });
        h.text(0, -0.62, '−j 区（容性）', { color: COL.rot, align: 'center', size: 20 });
        h.circle(1, 1, 1, { color: COL.rot, dash: [5, 4], width: 1.6 });
        h.circle(1, -1, 1, { color: COL.rot, dash: [5, 4], width: 1.6 });
        h.text(0.42, 0.62, 'x = +1', { color: COL.rot, dy: -8, size: 12 });
        h.text(0.42, -0.66, 'x = −1', { color: COL.rot, dy: 8, size: 12 });
        h.badge(0, 0.35, '4', COL.rot);
      }
    },
    {
      title: '等 r 圆簇（纯电阻圆）',
      body: '等 r 圆：圆心 (r/(1+r),0)、半径 1/(1+r)，所有圆都在右端 P_{oc} 相切，并都经过左端 P_{sc} 一侧。图上印刷 r = 0, 0.25, 0.5, 0.75, 1, 2 … 越靠右圆越密；同一圆上 r 不变。',
      formulas: [
        { expr: '圆心 = (r/(1+r), 0)', value: '半径 = 1/(1+r)' }
      ],
      draw: function (h) {
        h.circle(0, 0, 1, { color: COL.swr, dash: [2, 4], width: 1.2 });
        for (let i = 0; i < rVals.length; i++) {
          const r = rVals[i];
          const cu = r / (1 + r), rad = 1 / (1 + r);
          h.circle(cu, 0, rad, { color: COL.gamma, dash: [5, 3], width: 1.8 });
          const ang = (-150 * Math.PI) / 180;
          h.boxText(cu + rad * Math.cos(ang), rad * Math.sin(ang), 'r=' + r, { color: COL.gamma, align: 'center', size: 12.5 });
        }
        h.boxText(-0.64, -0.74, 'r=0（单位圆）', { color: COL.gamma, align: 'center', size: 12.5 });
        h.boxText(-0.88, -0.60, '等 r 圆簇（电阻圆）', { color: COL.gamma, size: 13.5 });
        h.badge(0.3, 0.32, '5', COL.gamma);
      }
    },
    {
      title: '等 x 圆簇（纯电抗圆）',
      body: '等 x 圆：圆心 (1, 1/x)、半径 1/|x|，以上下对称的方式相切于 P_{oc}。上半 +x（感性），下半 −x（容性）；|x| 越小圆越大、越贴近实轴。图上印刷 ±0.5, ±1, ±2, ±4 …。',
      formulas: [
        { expr: '圆心 = (1, 1/x)', value: '半径 = 1/|x|' },
        { expr: '上半：x > 0（+j）', value: '下半：x < 0（−j）' }
      ],
      draw: function (h) {
        for (let i = 0; i < xVals.length; i++) {
          const x = xVals[i];
          for (const sgn of [1, -1]) {
            h.circle(1, sgn * (1 / x), 1 / x, { color: COL.rot, dash: [5, 3], width: 1.6 });
          }
        }
        for (const x of xLabel) {
          for (const sgn of [1, -1]) {
            const u = (x * x - 1) / (x * x + 1);
            const v = (sgn * 2 * x) / (1 + x * x);
            h.boxText(u * 1.03, v * 1.03, 'x=' + (sgn > 0 ? '+' : '−') + x, {
              color: COL.rot, align: 'center', size: 12
            });
          }
        }
        h.boxText(-0.86, 0.62, '等 x 圆簇（电抗圆）', { color: COL.rot, size: 13.5 });
        h.badge(0.5, 0.5, '6', COL.rot);
      }
    },
    {
      title: '单位圆、驻波比圆与圆外刻度',
      body: '单位圆 |Γ|=1 是全反射边界。等驻波比圆是以 O 为圆心的同心圆族（图上不印），半径 |Γ|，ρ=(1+|Γ|)/(1−|Γ|)。圆图外圈给出朝源/朝载波长刻度（一圈 0.5λ）和反射系数相角刻度；图下方的径向标尺（SWR、dB、回波损耗等）用于把 |Γ| 半径投影读数。',
      formulas: [
        { expr: 'ρ = (1 + |Γ|)/(1 − |Γ|)', value: '示例 |Γ| = 0.5 → ρ = 3' },
        { expr: 'l/λ = (π − ∠Γ)/(4π)', value: '朝源刻度，转一圈 0.5λ' }
      ],
      draw: function (h) {
        h.circle(0, 0, 1, { color: COL.swr, dash: [], width: 2.4 });
        h.circle(0, 0, 0.5, { color: COL.aux, dash: [7, 5], width: 2, label: '|Γ| = 0.5（ρ = 3）', labelAngle: 40 });
        h.dot(0.5, 0, { color: COL.aux, label: 'ρ = 3', dx: 10, dy: 18, size: 5 });
        h.dot(-0.5, 0, { color: COL.aux, label: '1/ρ = 1/3', dx: -10, dy: 18, size: 5, hollow: true });
        h.arc(1.06, 168, 12, { clip: false, color: COL.read, width: 2.4, arrow: true, label: '朝源（顺时针）0 → 0.5λ', labelAt: 0.5, labelRadius: 1.11 });
        h.arc(1.06, 12, 168, { clip: false, color: COL.aux, width: 2.4, arrow: true, label: '朝载（逆时针）', labelAt: 0.5, labelRadius: 1.11 });
        h.text(0, -1.12, '外圈：波长刻度；外缘：反射系数相角 0°～±180°', { color: COL.read, align: 'center', size: 12.5 });
        h.badge(0, -0.5, '7', COL.aux);
      }
    },
    {
      title: '外圈电长度刻度：一圈 = 0.5λ',
      body: '圆图最外一圈刻度就是<b>电长度刻度</b>：从短路点（左端）的 0 开始，<b>顺时针</b>绕一整圈到 0.5λ，所以<b>一整圈（360°）代表 1/2 波长</b>，每 0.1λ 一个标号（0.1、0.2、0.3、0.4、0.5）。朝信号源移动时读数沿顺时针增大；朝负载移动时读另一侧的朝载刻度。',
      formulas: [
        { expr: '一整圈 360° = 0.5λ = 1/2 λ', value: '0 → 0.1λ → 0.2λ → 0.3λ → 0.4λ → 0.5λ' },
        { expr: 'l/λ = (π − ∠Γ)/(4π)', value: '由 Γ 的相角换算刻度（朝源）' }
      ],
      draw: function (h) {
        h.circle(0, 0, 1, { color: COL.swr, dash: [], width: 2 });
        h.circle(0, 0, 1.045, { color: COL.read, dash: [], width: 2.4, clip: false });
        for (let i = 0; i <= 20; i++) {
          const sVal = i * 0.025;
          const a = ((180 - sVal * 720) * Math.PI) / 180;
          const major = i % 4 === 0;
          const r1 = major ? 1.085 : 1.068;
          h.line([[1.045 * Math.cos(a), 1.045 * Math.sin(a)], [r1 * Math.cos(a), r1 * Math.sin(a)]],
            { color: COL.read, width: major ? 2.2 : 1.3, clip: false });
        }
        const marks = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
        for (let i = 0; i < marks.length; i++) {
          const sVal = marks[i];
          let deg = 180 - sVal * 720;
          if (sVal === 0) deg = 191;
          if (sVal === 0.5) deg = 169;
          const a = (deg * Math.PI) / 180;
          const label = sVal === 0 ? '0' : (sVal === 0.5 ? '0.5λ' : sVal.toFixed(1) + 'λ');
          const rr = sVal === 0.5 ? 1.10 : 1.135;
          h.boxText(rr * Math.cos(a), rr * Math.sin(a), label, { color: COL.read, align: 'center', size: 12.5 });
        }
        h.boxText(0, 1.02, '顺时针 = 朝源（读数增大）', { color: COL.read, align: 'center', size: 12.5 });
        h.boxText(0, -1.12, '一整圈（360°）= 0.5λ = 1/2 波长', { color: COL.read, align: 'center', size: 13.5 });
        h.badge(0, 0.62, '8', COL.read);
      }
    },
    {
      title: '同一张图的导纳读法',
      body: '把点（或整张图）绕圆心转 180°，同一位置就读作归一化导纳 y=1/z（书 4.1.4、表 4.4）：r↔g、x↔b；上半带的 +jX 对应 +jB，下半带的 −jX 对应 −jB（见图中印刷双标注）。并联问题（如支节匹配）都用这个读法。',
      formulas: [
        { expr: 'y = 1/z', value: 'r ↔ g，x ↔ b' },
        { expr: 'Γ_{I} = −Γ', value: '转 180°（式 4.63）' }
      ],
      draw: function (h) {
        h.circle(0, 0, 1, { color: COL.swr, dash: [], width: 2.2 });
        h.dot(0.55, 0.35, { color: COL.load, label: 'z = r + jx', dx: 12, dy: -14 });
        h.dot(-0.55, -0.35, { color: COL.read, label: 'y = 1/z', dx: -12, dy: 18, hollow: true });
        h.line([[0.55, 0.35], [-0.55, -0.35]], { color: COL.read, dash: [4, 4], width: 1.6 });
        h.dot(0, 0, { color: COL.ink, size: 4 });
        h.badge(0.2, 0.2, '9', COL.read);
      }
    }
  ];
  const summary = [
    { k: '坐标系', v: 'Γ 平面单位圆', s: '圆心 Γ=0（z=1），圆内 |Γ|<1', accent: true },
    { k: '水平主轴', v: '左短 · 中匹配 · 右开', s: '左 P_{sc}（读 K，K=0）；圆心 z=1（ρ=1）；右 P_{oc}（读 ρ，ρ→∞）' },
    { k: '主轴刻度', v: '行波系数 K ← | → 驻波比 ρ', s: 'K=1/ρ=(1−|Γ|)/(1+|Γ|)，ρ=(1+|Γ|)/(1−|Γ|)' },
    { k: '上 / 下半平面', v: '+j 感性 / −j 容性', s: '导纳读法：+jB（容性）/ −jB（感性）' },
    { k: '等 r / 等 x 圆', v: 'r 圆右端相切', s: 'x 圆上下对称，圆心 (1, 1/x)' },
    { k: '外圈刻度', v: '一圈 = 0.5λ（1/2λ）', s: '0→0.1λ→…→0.5λ 顺时针，朝源读数增大' },
    { k: '导纳读法', v: '转 180° 得 y', s: 'r↔g，x↔b（表 4.4）' }
  ];
  return {
    steps: steps, summary: summary, reference: reference,
    legend: [
      { color: COL.load, label: '实轴 / 纯电阻' },
      { color: COL.gamma, label: '等 r 圆簇' },
      { color: COL.rot, label: '等 x 圆簇 / −j 区' },
      { color: COL.swr, label: '单位圆 / 驻波比' },
      { color: COL.read, label: '波长刻度 / 导纳读法' }
    ]
  };
};

/* ================= 教材作图法（完整教程） ================= */
const GUIDE_HTML = [
  '<h3>依据与范围</h3>',
  '<p>本教程按《微波技术基础（第3版）》（李秀萍、刘凯明、高泽华）第 4 章 4.1–4.3 节整理（书页 54–70）。底图就是该书第 54 页的整页扫描图 <b>图 4.6 Smith 圆图</b>（阻抗/导纳合用、带朝源/朝载波长刻度）。公式编号沿用书中式 (4.20)–(4.101)。</p>',
  '<div class="tip">读图方向的三条总则（书页 55）：① 沿等反射系数圆<b>顺时针</b>移动＝朝信号源，<b>逆时针</b>＝朝负载；② 转一圈（2π）电长度改变 <b>0.5λ</b>；③ 圆图上任意一点转 180° 即得该点的归一化导纳（式 4.63）。</div>',

  '<h3>一、圆图的坐标与刻度（4.1.2，书页 54–55）</h3>',
  '<div class="eq">Γ = (Z_{L} − Z_{0})/(Z_{L} + Z_{0}) = (z_{L} − 1)/(z_{L} + 1)　【式 4.20 前的定义】</div>',
  '<div class="eq">等 r 圆：圆心 ( r/(1+r), 0 )，半径 1/(1+r)　【图 4.6】</div>',
  '<div class="eq">等 x 圆：圆心 ( 1, 1/x )，半径 1/|x|</div>',
  '<table><tr><th>圆图上的点</th><th>(Γ_{r}, Γ_{i})</th><th>(r, x)</th><th>负载</th></tr>',
  '<tr><td>短路点 P_{sc}</td><td>(−1, 0)</td><td>(0, 0)</td><td>Z_{L}=0</td></tr>',
  '<tr><td>开路点 P_{oc}</td><td>(1, 0)</td><td>(∞, ∞)</td><td>Z_{L}=∞</td></tr>',
  '<tr><td>匹配点</td><td>(0, 0)</td><td>(1, 0)</td><td>Z_{L}=Z_{0}</td></tr></table>',
  '<p>（对应教材表 4.3。）圆图外圈是<b>朝源波长刻度</b>（内圈朝载），0～0.5λ 一圈；读数按 <span class="eq-inline">l/λ = (π − ∠Γ)/(4π)</span> 换算，本软件会自动替你标出刻度位置。</p>',

  '<h3>二、标准六步作图法：求沿线输入阻抗（4.1.3-2，图 4.9、图 4.13，例 4.3）</h3>',
  '<ol>',
  '<li><b>归一化</b>：z_{L} = Z_{L}/Z_{0}，在圆图上定出负载点 A。</li>',
  '<li><b>画等反射系数圆</b>：以 O 为圆心、|Γ_{L}| 为半径画圆（圆上 |Γ| 不变）。</li>',
  '<li><b>找 B 点读电长度刻度</b>：延长射线 OA 与 r=0 圆（即单位圆）交于 B，读出 B 点的波长刻度 l_{B}/λ（教材图 4.9）。</li>',
  '<li><b>顺时针转 d/λ</b>：由 B（或由 A 点沿等反射系数圆）顺时针转过 d/λ 到 C。若 l/λ 超过 0.5，按每转一圈 0.5λ 处理（书页 55 的讨论）。</li>',
  '<li><b>读 C 点</b>：OC 与过 A 的等反射系数圆交于 C，读 C 点的 r、x，即归一化输入阻抗 z_{in}。</li>',
  '<li><b>反归一化</b>：Z_{in} = Z_{0}·z_{in}；要把 C 点转 180° 即得归一化输入导纳 y_{in}。</li>',
  '</ol>',
  '<div class="eq">Γ = Γ_{L}e^{−j2βl} = |Γ_{L}|e^{j(φ_{L}−2βl)}　【式 4.20】</div>',
  '<div class="eq">Z_{in} = Z_{0}(Z_{L} + jZ_{0}tan βl)/(Z_{0} + jZ_{L}tan βl)　【式 4.30】</div>',
  '<p>例 4.3 用圆图：Z_{0}=100 Ω、Z_{L}=100−j200 Ω、l=25 m、f=10 MHz → z_{L}=1−j2，l/λ=0.833（1 圈 + 0.333λ），读得输入阻抗约 0.45+j1.2，反归一化≈45+j120 Ω。本软件的模式②就是这六步的可视化。</p>',

  '<h3>三、读驻波比 ρ 与行波系数（4.1.3-1，图 4.7，式 4.21–4.29）</h3>',
  '<div class="eq">ρ = (1+|Γ|)/(1−|Γ|) = (1+Γ_{r0})/(1−Γ_{r0})　【式 4.21、4.26】</div>',
  '<p>等反射系数圆与<b>正实轴</b>的交点读数是 ρ（右半轴 = 电压波腹点 V<sub>max</sub>），与<b>负实轴</b>的交点读数是 1/ρ（行波系数 K，左半轴 = 电压波节点 V<sub>min</sub>，式 4.27）。沿实轴从圆心向左读 K（K：1→0），向右读 ρ（ρ：1→∞）。本软件模式①第 4 步和「圆图详解」第 3 步会把 K、ρ 刻度直接画在轴上。</p>',

  '<h3>四、由 ρ 和 d_{min} 反求负载 Z_{L}（例 4.4 解法 3，图 4.16）</h3>',
  '<ol>',
  '<li>由 ρ 求 |Γ| = (ρ−1)/(ρ+1)，画出等反射系数圆。</li>',
  '<li>第一个电压最小点在负实轴 E 点，Γ = −|Γ|。</li>',
  '<li>延长 OE 与单位圆交于 H；由 H <b>向负载（逆时针）</b>转 d_{min}/λ 到 F。</li>',
  '<li>OF 与等反射系数圆交于 G，G 点读数即 z_{L}；反归一化得 Z_{L}。</li>',
  '</ol>',
  '<p>例 4.4：ρ=3、d_{min}=0.05 m、λ=0.4 m → z_{L}=0.6−j0.8 → Z_{L}=30−j40 Ω（本软件模式③）。</p>',

  '<h3>五、导纳圆图（4.1.4，表 4.4，例 4.6）</h3>',
  '<p>导纳圆图＝阻抗圆图绕圆心整体转 180°，形状与刻度都不变，只是点义改变：阻抗圆图的开路点在右，导纳圆图的开路点在左（表 4.4）。按式 (4.63) 有 Γ_{I} = −Γ。</p>',
  '<div class="eq">y_{L} = 1/z_{L} = (1+Γ_{L})/(1−Γ_{L})　【式 4.64、4.65】</div>',
  '<ol>',
  '<li>先按 z_{L} 定位 A 点（阻抗圆图）。</li>',
  '<li>A 点绕圆心转 180° 得导纳点 A′，读 y_{L}=g+jb。</li>',
  '<li>在导纳圆图上由 A′ 沿等反射系数圆<b>顺时针</b>转 l/λ，得 y_{in}。</li>',
  '<li>Y_{in}=y_{in}/Z_{0}（单位 S）。</li>',
  '</ol>',
  '<p>例 4.6：Z_{0}=50 Ω、Z_{L}=100+j50 Ω、l=0.15λ → z_{L}=2+j1，转 180° 得 y_{L}=0.4−j0.2；再顺时针转 0.15λ 得 y_{in}=0.61+j0.66；Y_{in}=0.0122+j0.0132 S（本软件模式⑤）。</p>',

  '<h3>六、并联单支节匹配（4.3.1，图 4.29、4.30，例 4.7）</h3>',
  '<p>原理：在距负载 d 处并入一段长度 l 的终端短路或开路支节，使该处总导纳为 1（匹配）。匹配条件是 <b>g = 1</b>。图上这个<b>匹配圆（单位电导圆）</b>这样认：按导纳刻度，圆心是 <b>(g=3, b=0)</b>，半径取图上 <b>g=1 点到 g=3 点</b>这段长度；注意同一个点按阻抗刻度读是 r=1/3，不是 r=3。</p>',
  '<ol>',
  '<li><b>(a)</b> 归一化 z_{L}=Z_{L}/Z_{0}，定位 A 点。</li>',
  '<li><b>(b)</b> 画出等反射系数圆。</li>',
  '<li><b>(c)</b> 取 A 关于圆心的对称点，得归一化负载导纳 y_{L}。</li>',
  '<li><b>(d)</b> 由 y_{L} 沿等反射系数圆顺时针转到匹配圆，交于 B₁、B₂（两种解法）。</li>',
  '<li><b>(e)</b> 读出两段旋转长度 d_{1}/λ、d_{2}/λ 及 B 点导纳 y₁′ = 1 ± jb′。</li>',
  '<li><b>(f)</b> 支节长度：短路支节用 b=−jb′，从短路点 P_{sc} 沿单位圆顺时针转 l/λ；开路支节从开路点 P_{oc} 起转。</li>',
  '<li><b>(g)</b> 校核：支节接入后总导纳为 1，Γ=0、VSWR=1。</li>',
  '</ol>',
  '<p>例 4.7：Z_{0}=100 Ω、Z_{L}=75+j200 Ω、f=1 GHz（λ=30 cm）→ z_{L}=0.75+j2；y_{L}=0.16−j0.44；d/λ=0.26；y₁′=1+j2.36；短路支节 l/λ=0.06（本软件模式④，图中 P_{sc}/P_{oc} 起转的弧就是支节长度作图）。</p>',

  '<h3>七、公式速查</h3>',
  '<div class="eq">Γ_{L} = (Z_{L}−Z_{0})/(Z_{L}+Z_{0})；ρ = (1+|Γ|)/(1−|Γ|)；K = 1/ρ</div>',
  '<div class="eq">Γ(l) = Γ_{L}e^{−j2βl}，β = 2π/λ；l/λ=(π−∠Γ)/(4π)（朝源刻度）</div>',
  '<div class="eq">Z_{in} = Z_{0}(Z_{L}+jZ_{0}tan βl)/(Z_{0}+jZ_{L}tan βl)　【式 4.30】</div>',
  '<div class="eq">λ/4：Z_{in} = Z_{0}²/Z_{L}，z_{in}=1/z_{L}　【式 4.61、4.62】</div>',
  '<div class="eq">并联支节：y_{stub} = −j·cot(2πl/λ)（短路）或 j·tan(2πl/λ)（开路）</div>',
  '<div class="eq">解析解：d = (λ/4π)·arccos[(g_{L}−1)/(g_{L}+1)]；l = (λ/2π)·arctan[±√g_{L}/(1−g_{L})]　【式 4.92、4.97】</div>',

  '<h3>八、本软件与教材的对应</h3>',
  '<table><tr><th>模式</th><th>教材内容</th><th>对应例题/图</th></tr>',
  '<tr><td>① 负载分析</td><td>4.1.2 特点、4.1.3-1 求 ρ</td><td>表 4.3、图 4.7、例 4.2</td></tr>',
  '<tr><td>② 沿线输入阻抗</td><td>4.1.3-2 六步作图法</td><td>图 4.9、图 4.13、例 4.1/4.3</td></tr>',
  '<tr><td>③ 由 ρ 反求负载</td><td>4.1.3-1 与例 4.4</td><td>图 4.16、例 4.4</td></tr>',
  '<tr><td>④ 单短截线匹配</td><td>4.3.1 并联单支节</td><td>图 4.29、图 4.30、例 4.7</td></tr>',
  '<tr><td>⑤ 导纳圆图</td><td>4.1.4 导纳圆图</td><td>表 4.4、例 4.6</td></tr></table>',
  '<div class="tip">使用提示：左侧选模式并填入题目条件 → 点「开始分析」→ 右侧逐步「下一步」，圆图会按教材顺序逐层叠加作图。每个例题都可从「教材例题」一键载入。底图透明度可调，保存图片可导出当前作图。</div>',
  '<p class="ref">引用：书页 54–70；图 4.6、4.7、4.9、4.13、4.16、4.22、4.29、4.30；式 (4.20)(4.21)(4.22)(4.26)(4.30)(4.61)(4.63)(4.86)–(4.100)(4.101)。圆图扫描取自 PDF 第 61 页（书页 54）图 4.6。</p>'
].join('');

function initGuide() {
  const modal = document.getElementById('guideModal');
  const body = document.getElementById('guideBody');
  if (!modal || !body) return;
  body.innerHTML = mathHTML(GUIDE_HTML);
  const open = function () { modal.classList.add('open'); };
  const close = function () { modal.classList.remove('open'); };
  document.getElementById('guideBtn').addEventListener('click', open);
  document.getElementById('guideClose').addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
}

/* ================= 初始化 ================= */
function applyPresetFromUrl() {
  const q = new URLSearchParams(location.search);
  const id = q.get('preset');
  const step = Number(q.get('step') || '0');
  if (!id) return false;
  const pre = PRESETS.find(function (x) { return x.id === id; });
  if (!pre) return false;
  state.mode = pre.mode;
  state.params = Object.assign({}, pre.params);
  state.stepIndex = 0;
  renderAll();
  buildAndRender(isNaN(step) ? 0 : step);
  return true;
}
function boot() {
  initGuide();
  renderAll();
  if (!applyPresetFromUrl()) buildAndRender(0);
  const q = new URLSearchParams(location.search);
  if (q.get('mode') && MODES[q.get('mode')]) {
    state.mode = q.get('mode'); state.params = {}; renderAll();
    buildAndRender(Number(q.get('step') || '0'));
  }
  if (q.get('guide') === '1') document.getElementById('guideModal').classList.add('open');
  const op = document.getElementById('chartOpacity');
  op.value = state.opacity * 100;
  op.addEventListener('input', function (e) { state.opacity = Number(e.target.value) / 100; renderCanvas(); });
  document.getElementById('calcBtn').addEventListener('click', function () { buildAndRender(0); });
  document.getElementById('resetBtn').addEventListener('click', function () { state.params = {}; renderAll(); buildAndRender(0); });
  document.getElementById('prevStep').addEventListener('click', function () { setStep(state.stepIndex - 1); });
  document.getElementById('nextStep').addEventListener('click', function () { setStep(state.stepIndex + 1); });
  document.getElementById('savePng').addEventListener('click', function () {
    const a = document.createElement('a');
    a.download = 'smith-chart-analysis.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  });
  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (e.key === 'ArrowRight') setStep(state.stepIndex + 1);
    if (e.key === 'ArrowLeft') setStep(state.stepIndex - 1);
  });
  document.getElementById('paramForm').addEventListener('change', syncFieldVisibility);
  const anatomyBtn = document.getElementById('anatomyBtn');
  if (anatomyBtn) anatomyBtn.addEventListener('click', function () {
    state.mode = 'anatomy'; state.params = {}; state.stepIndex = 0;
    renderAll(); buildAndRender(0);
  });
}
window.addEventListener('resize', function () { renderCanvas(); });
chartImg.addEventListener('load', function () { renderCanvas(); });
boot();
