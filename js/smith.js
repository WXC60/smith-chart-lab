// smith.js — 史密斯圆图核心数学（经典脚本，挂载到 window.Smith；Node 下可用 module.exports 加载）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Smith = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var C0 = 299792458; // m/s
  var TAU = Math.PI * 2;

  function cadd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
  function csub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
  function cmul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
  function cdiv(a, b) {
    var d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  }
  function cabs(a) { return Math.hypot(a.re, a.im); }
  function carg(a) { return Math.atan2(a.im, a.re); }

  function normalizeZ(zRe, zIm, z0) { return { r: zRe / z0, x: zIm / z0 }; }
  function zToGamma(r, x) { return cdiv({ re: r - 1, im: x }, { re: r + 1, im: x }); }
  function gammaToZ(g) { return cdiv({ re: 1 + g.re, im: g.im }, { re: 1 - g.re, im: -g.im }); }
  function admittanceOfZ(r, x) { return cdiv({ re: 1, im: 0 }, { re: r, im: x }); }

  function swrCircle(g) { return { cu: 0, cv: 0, r: cabs(g) }; }
  function vswr(mag) { if (mag >= 1) return Infinity; return (1 + mag) / (1 - mag); }
  function travelingWaveCoefficient(mag) { return 1 / vswr(mag); }
  function returnLossDb(mag) { return mag <= 0 ? Infinity : -20 * Math.log10(mag); }
  function mismatchLossDb(mag) { var t = 1 - mag * mag; return t <= 0 ? Infinity : -10 * Math.log10(t); }
  function deliveredFraction(mag) { return Math.max(0, 1 - mag * mag); }

  function rotateTowardGenerator(g, lOverLambda) {
    var delta = -4 * Math.PI * lOverLambda;
    var c = Math.cos(delta), s = Math.sin(delta);
    return { re: g.re * c - g.im * s, im: g.re * s + g.im * c };
  }
  function rotateTowardLoad(g, lOverLambda) { return rotateTowardGenerator(g, -lOverLambda); }

  function waveLengthScale(g) {
    var phi = carg(g);
    var delta = Math.PI - phi;
    delta = ((delta % TAU) + TAU) % TAU;
    return delta / (2 * TAU);
  }
  function gammaFromRhoAndDmin(rho, dminOverLambda) {
    var mag = (rho - 1) / (rho + 1);
    var phi = Math.PI + 4 * Math.PI * dminOverLambda;
    return { re: mag * Math.cos(phi), im: mag * Math.sin(phi), mag: mag, phi: phi };
  }
  function quarterWaveTransformer(z0, zlRe) { return Math.sqrt(z0 * zlRe); }

  function stubMatch(z0, zlRe, zlIm, options) {
    var stubType = (options && options.stubType) || 'short';
    var nz = normalizeZ(zlRe, zlIm, z0);
    var g = zToGamma(nz.r, nz.x);
    var mag = cabs(g);
    var solutions = [];
    if (mag > 0 && mag <= 1) {
      var u = -mag * mag;
      var vAbs = Math.sqrt(Math.max(0, mag * mag - u * u));
      var vs = vAbs === 0 ? [0] : [vAbs, -vAbs];
      for (var k = 0; k < vs.length; k++) {
        var v = vs[k];
        var D = { re: u, im: v };
        var delta = carg(g) - carg(D);
        delta = ((delta % TAU) + TAU) % TAU;
        var dOverLambda = delta / (2 * TAU);
        var zIn = gammaToZ(D);
        var yIn = cdiv({ re: 1, im: 0 }, zIn);
        var b = yIn.im;
        var stubOverLambda;
        if (stubType === 'short') {
          stubOverLambda = Math.atan2(1, b) / TAU;
        } else {
          var betaL = Math.atan(-b);
          stubOverLambda = ((betaL % Math.PI) + Math.PI) % Math.PI / TAU;
        }
        var bStub = stubType === 'short' ? -1 / Math.tan(TAU * stubOverLambda) : Math.tan(TAU * stubOverLambda);
        solutions.push({
          dOverLambda: dOverLambda, stubOverLambda: stubOverLambda, b: b, bStub: bStub, stubType: stubType,
          gammaD: D, zIn: zIn, yIn: yIn,
          checkGamma: Math.hypot(1 - 1, b + bStub)
        });
      }
    }
    solutions.sort(function (a, b2) { return a.dOverLambda - b2.dOverLambda; });
    return { z: { r: nz.r, x: nz.x }, gamma: g, mag: mag, solutions: solutions };
  }

  function circleIntersections(c1, r1, c2, r2) {
    var dx = c2.cu - c1.cu, dy = c2.cv - c1.cv;
    var d = Math.hypot(dx, dy);
    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return [];
    var a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    var h2 = r1 * r1 - a * a;
    if (h2 < 0) return [];
    var h = Math.sqrt(h2);
    var xm = c1.cu + (a * dx) / d, ym = c1.cv + (a * dy) / d;
    return [
      { cu: xm + (h * dy) / d, cv: ym - (h * dx) / d },
      { cu: xm - (h * dy) / d, cv: ym + (h * dx) / d }
    ];
  }

  function fmt(v, n) {
    var d = n === undefined ? 2 : n;
    return Number.isFinite(v) ? v.toFixed(d) : '∞';
  }
  function fmtSigned(v, n) {
    var d = n === undefined ? 2 : n;
    return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  }
  function fmtZ(r, x, n) {
    var d = n === undefined ? 2 : n;
    return fmt(r, d) + (x >= 0 ? ' + j' : ' − j') + Math.abs(x).toFixed(d);
  }
  function fmtGamma(g, n) {
    var d = n === undefined ? 3 : n;
    var mag = cabs(g), deg = (carg(g) * 180) / Math.PI;
    return mag.toFixed(d) + ' ∠ ' + deg.toFixed(1) + '°';
  }
  function wavelengthM(fGHz) { return fGHz > 0 ? C0 / (fGHz * 1e9) : NaN; }

  return {
    C0: C0, TAU: TAU, cadd: cadd, csub: csub, cmul: cmul, cdiv: cdiv, cabs: cabs, carg: carg,
    normalizeZ: normalizeZ, zToGamma: zToGamma, gammaToZ: gammaToZ, admittanceOfZ: admittanceOfZ,
    swrCircle: swrCircle, vswr: vswr, travelingWaveCoefficient: travelingWaveCoefficient,
    returnLossDb: returnLossDb, mismatchLossDb: mismatchLossDb, deliveredFraction: deliveredFraction,
    rotateTowardGenerator: rotateTowardGenerator, rotateTowardLoad: rotateTowardLoad,
    waveLengthScale: waveLengthScale, gammaFromRhoAndDmin: gammaFromRhoAndDmin,
    quarterWaveTransformer: quarterWaveTransformer, stubMatch: stubMatch,
    circleIntersections: circleIntersections,
    fmt: fmt, fmtSigned: fmtSigned, fmtZ: fmtZ, fmtGamma: fmtGamma, wavelengthM: wavelengthM
  };
});
