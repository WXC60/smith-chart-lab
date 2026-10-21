// 数值校验：与教材例题及解析公式对照
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../js/smith.js', import.meta.url), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const S = mod.exports;

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✔', name, detail); }
  else { fail++; console.log('  ✘', name, detail); }
}
const close = (a, b, tol) => Math.abs(a - b) <= tol;
const deg = (g) => (S.carg(g) * 180) / Math.PI;
const zOf = (g) => { const z = S.gammaToZ(g); return { r: z.re, x: z.im }; };

console.log('例4.1 终端短路线 l=0.1λ, Z0=50Ω');
{
  const gi = S.rotateTowardGenerator({ re: -1, im: 0 }, 0.1);
  const z = zOf(gi);
  ok('归一化输入阻抗 x≈0.726', close(z.r, 0, 1e-9) && close(z.x, 0.726, 2e-3), S.fmtZ(z.r, z.x));
  ok('输入阻抗 ≈ j36.4Ω（书 j36.4Ω）', close(z.x * 50, 36.4, 0.3), (z.x * 50).toFixed(1) + 'Ω');
}
console.log('例4.2 ZL=85+j30, Z0=50 → ρ=2.0');
{
  const z = S.normalizeZ(85, 30, 50);
  const g = S.zToGamma(z.r, z.x);
  ok('z=1.7+j0.6', close(z.r, 1.7, 1e-9) && close(z.x, 0.6, 1e-9));
  ok('VSWR=2.00', close(S.vswr(S.cabs(g)), 2.0, 0.01), S.vswr(S.cabs(g)).toFixed(3));
}
console.log('例4.3 Z0=100, ZL=100−j200, l=25m, f=10MHz');
{
  const lam = S.wavelengthM(0.01);
  const lOver = 25 / lam;
  const z = S.normalizeZ(100, -200, 100);
  const g = S.zToGamma(z.r, z.x);
  const zi = zOf(S.rotateTowardGenerator(g, lOver));
  ok('λ≈29.98m', close(lam, 29.979, 0.01), lam.toFixed(2) + 'm');
  ok('l/λ≈0.834', close(lOver, 5 / 6, 2e-3), lOver.toFixed(4));
  ok('z_in≈0.44+j1.21（书 0.45+j1.2）', close(zi.r, 0.45, 0.02) && close(zi.x, 1.2, 0.02), S.fmtZ(zi.r, zi.x));
  ok('Z_in≈45+j120Ω（书 45+j120Ω）', close(zi.r * 100, 45, 2) && close(zi.x * 100, 120, 2), S.fmtZ(zi.r * 100, zi.x * 100, 1) + 'Ω');
  ok('B 点波长刻度 ≈0.3125λ', close(S.waveLengthScale(g), 0.3125, 1e-6), S.waveLengthScale(g).toFixed(4));
}
console.log('例4.4 ρ=3, dmin=0.05m, λ=0.4m → ZL=30−j40Ω');
{
  const g = S.gammaFromRhoAndDmin(3, 0.05 / 0.4);
  const z = zOf(g);
  ok('|Γ|=0.5, ∠Γ=−90°', close(g.mag, 0.5, 1e-9) && close(deg(g), -90, 1e-6), S.fmtGamma(g));
  ok('z=0.6−j0.8', close(z.r, 0.6, 1e-6) && close(z.x, -0.8, 1e-6), S.fmtZ(z.r, z.x));
  ok('ZL=30−j40Ω', close(z.r * 50, 30, 1e-4) && close(z.x * 50, -40, 1e-4), S.fmtZ(z.r * 50, z.x * 50, 1) + 'Ω');
}
console.log('单短截线匹配（Z0=50, ZL=100+j50）');
{
  const res = S.stubMatch(50, 100, 50);
  ok('存在两个解', res.solutions.length === 2, res.solutions.map((s) => 'd/λ=' + s.dOverLambda.toFixed(3)).join(', '));
  for (const s of res.solutions) {
    ok('  d/λ 在 (0,0.5)', s.dOverLambda > 0 && s.dOverLambda < 0.5, s.dOverLambda.toFixed(4));
    ok('  支节长度在 (0,0.5)', s.stubOverLambda > 0 && s.stubOverLambda < 0.5, s.stubOverLambda.toFixed(4));
    ok('  匹配校核 |y_total−1|<1e-9', s.checkGamma < 1e-9, s.checkGamma.toExponential(1));
    const zi = zOf(S.rotateTowardGenerator(res.gamma, s.dOverLambda));
    const yi = S.admittanceOfZ(zi.r, zi.x);
    ok('  旋转后 Re(y)=1', close(yi.re, 1, 1e-9), yi.re.toFixed(9));
    const yTot = { re: yi.re, im: yi.im + (s.stubType === 'short' ? -1 / Math.tan(2 * Math.PI * s.stubOverLambda) : Math.tan(2 * Math.PI * s.stubOverLambda)) };
    ok('  加支节后匹配 |y−1|<1e-9', Math.hypot(yTot.re - 1, yTot.im) < 1e-9, Math.hypot(yTot.re - 1, yTot.im).toExponential(1));
  }
}

console.log('例4.6 导纳：Z0=50, ZL=100+j50, l=0.15λ');
{
  const z = S.normalizeZ(100, 50, 50);
  const g = S.zToGamma(z.r, z.x);
  const yL = S.admittanceOfZ(z.r, z.x);
  const gin = S.rotateTowardGenerator(g, 0.15);
  const zi = S.gammaToZ(gin);
  const yi = S.admittanceOfZ(zi.re, zi.im);
  ok('z_L=2+j1', close(z.r, 2, 1e-9) && close(z.x, 1, 1e-9), S.fmtZ(z.r, z.x));
  ok('y_L=0.4−j0.2', close(yL.re, 0.4, 1e-9) && close(yL.im, -0.2, 1e-9), S.fmtZ(yL.re, yL.im));
  ok('y_in≈0.61+j0.66（书）', close(yi.re, 0.61, 0.01) && close(yi.im, 0.66, 0.01), S.fmtZ(yi.re, yi.im));
  ok('Y_in≈0.0122+j0.0132 S', close(yi.re / 50, 0.0122, 3e-4) && close(yi.im / 50, 0.0132, 3e-4), S.fmtZ(yi.re / 50, yi.im / 50, 4) + ' S');
}
console.log('例4.7 并联单支节：Z0=100, ZL=75+j200');
{
  const res = S.stubMatch(100, 75, 200);
  const sol = res.solutions[0];
  ok('存在解', !!sol);
  ok('d/λ≈0.26（书）', close(sol.dOverLambda, 0.26, 0.01), sol.dOverLambda.toFixed(4));
  ok('y1′≈1+j2.36（教材圆图读数，±0.05）', close(sol.b, 2.36, 0.05), sol.b.toFixed(4));
  ok('短路支节 l/λ≈0.06（书）', close(sol.stubOverLambda, 0.06, 0.01), sol.stubOverLambda.toFixed(4));
}


console.log('4.1 圆图基本练习');
{
  const y2g = (y) => S.cdiv({ re: 1 - y.re, im: -y.im }, { re: 1 + y.re, im: y.im });
  const g2y = (g) => S.cdiv({ re: 1 - g.re, im: -g.im }, { re: 1 + g.re, im: g.im });
  // 4.1.1
  {
    const z = S.normalizeZ(80, -60, 100);
    const g = S.zToGamma(z.r, z.x);
    const gi = S.rotateTowardGenerator(g, 0.2);
    const zi = S.gammaToZ(gi);
    const yi = S.admittanceOfZ(zi.re, zi.im);
    ok('4.1.1 Zin≈59.14+j35.89Ω', close(zi.re * 100, 59.142, 0.01) && close(zi.im * 100, 35.885, 0.01), S.fmtZ(zi.re * 100, zi.im * 100));
    ok('4.1.1 Yin≈0.01236−j0.00750S', close(yi.re / 100, 0.012358, 1e-4) && close(yi.im / 100, -0.007499, 1e-4), S.fmtZ(yi.re / 100, yi.im / 100, 5) + ' S');
  }
  // 4.1.2
  {
    const yin = { re: 0.025 * 50, im: -0.015 * 50 };
    const Gin = y2g(yin);
    const GL = S.rotateTowardLoad(Gin, 0.15);
    const zL = S.gammaToZ(GL);
    ok('4.1.2 ZL≈29.73−j18.24Ω', close(zL.re * 50, 29.734, 0.01) && close(zL.im * 50, -18.238, 0.01), S.fmtZ(zL.re * 50, zL.im * 50));
  }
  // 4.1.3
  {
    const z = S.normalizeZ(80, -20, 50);
    const g = S.zToGamma(z.r, z.x);
    const gi = S.rotateTowardGenerator(g, 0.35);
    ok('4.1.3 Γ(0.35λ)≈0.274∠83.1°', close(S.cabs(gi), 0.274, 0.001) && close(S.carg(gi) * 180 / Math.PI, 83.1, 0.2), S.fmtGamma(gi));
    ok('4.1.3 VSWR≈1.76', close(S.vswr(S.cabs(gi)), 1.755, 0.01), S.vswr(S.cabs(gi)).toFixed(3));
  }
  // 4.1.4 / 4.1.6 exact lengths
  {
    const solveLen = (yL, yt) => {
      const GL = y2g(yL), Gt = y2g(yt);
      let d = S.carg(GL) - S.carg(Gt);
      d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return d / (4 * Math.PI);
    };
    ok('4.1.4 l/λ≈0.4536', close(solveLen({ re: 0, im: 0 }, { re: 0, im: -0.3 }), 0.4536, 1e-3), solveLen({ re: 0, im: 0 }, { re: 0, im: -0.3 }).toFixed(4));
    ok('4.1.6 l/λ≈0.4686', close(solveLen({ re: 0, im: 0 }, { re: 0, im: -0.2 }), 0.4686, 1e-3), solveLen({ re: 0, im: 0 }, { re: 0, im: -0.2 }).toFixed(4));
  }
  // 4.1.5
  {
    const res = S.stubMatch(1, 0.5, -0.1);
    const sols = res.solutions;
    ok('4.1.5 两解 l/λ≈0.1185 / 0.4235', close(sols[0].dOverLambda, 0.1185, 1e-3) && close(sols[1].dOverLambda, 0.4235, 1e-3), sols.map(s => s.dOverLambda.toFixed(4)).join(' / '));
    ok('4.1.5 b_in≈0.721', close(Math.abs(sols[0].b), 0.721, 1e-3), sols.map(s => s.b.toFixed(3)).join(' / '));
  }
}


console.log('4.3 综合题');
{
  const z = S.normalizeZ(70, -20, 50);
  const g = S.zToGamma(z.r, z.x);
  const mag = S.cabs(g);
  const ang = S.carg(g) * 180 / Math.PI;
  const y = S.admittanceOfZ(z.r, z.x);
  const gi = S.rotateTowardGenerator(g, 0.6);
  const zi = S.gammaToZ(gi);
  const dmin = ((ang + 180) / 720 % 0.5 + 0.5) % 0.5;
  const dmax = (ang / 720 % 0.5 + 0.5) % 0.5;
  ok('4.3 VSWR≈1.606', close(S.vswr(mag), 1.6058, 1e-3), S.vswr(mag).toFixed(3));
  ok('4.3 ΓL≈0.232∠−35.5°', close(mag, 0.2325, 1e-3) && close(ang, -35.54, 0.1), S.fmtGamma(g));
  ok('4.3 yL≈0.660+j0.189', close(y.re, 0.6604, 1e-3) && close(y.im, 0.1887, 1e-3), S.fmtZ(y.re, y.im));
  ok('4.3 Zin≈39.61−j18.56Ω', close(zi.re * 50, 39.607, 0.01) && close(zi.im * 50, -18.564, 0.01), S.fmtZ(zi.re * 50, zi.im * 50));
  ok('4.3 d_min≈0.2006λ', close(dmin, 0.2006, 1e-3), dmin.toFixed(4));
  ok('4.3 d_max≈0.4506λ', close(dmax, 0.4506, 1e-3), dmax.toFixed(4));
}

console.log('其它');
{
  ok('短路点波长刻度=0', close(S.waveLengthScale({ re: -1, im: 0 }), 0, 1e-12));
  ok('开路点波长刻度=0.25λ', close(S.waveLengthScale({ re: 1, im: 0 }), 0.25, 1e-12));
  ok('λ/4 变换器 ZT=√(50×200)=100Ω', close(S.quarterWaveTransformer(50, 200), 100, 1e-9));
  ok('ZL=25+j25 也存在两解', S.stubMatch(50, 25, 25).solutions.length === 2);
}
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
