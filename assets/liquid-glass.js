/* liquid-glass.js — 液态玻璃运行时（零依赖，原生 JS）
 * 按 skills/liquid-glass.md 配方：
 *   1) 对每个 .lg 元素在 canvas 上生成 SDF 位移贴图：
 *      圆角矩形 SDF，rim 带 max(14px, 0.34×min(w,h)) 内沿负梯度推
 *      pow(1 − t, 1.6) × 0.92 的位移，其余写中性 (128,128)。
 *   2) 注入 SVG filter：R/G/B 三通道 feColorMatrix 拆分，
 *      同一贴图以 scale 60/54/48 分别 feDisplacementMap，
 *      feBlend mode="screen" 合成 → 12% scale 差 = 色散。
 *   3) 贴图就绪才设 --lg-filter + .lg-on；resize 防抖 180ms 重建。
 *   4) 指针位置（+移动端 deviceorientation）→ lerp 0.06 平滑 + idle sway
 *      → 写 :root 的 --lg-tx/--lg-ty/--lg-bx/--lg-ang（+--lg-flash）。
 *   5) LiquidGlass.setFlash(v)：瞬时点亮 rim 与 sheen（main.js 可调）。
 *
 * 对外接口（给 main.js）：
 *   LiquidGlass.setFlash(v)          // 0~1 闪光
 *   LiquidGlass.setPointer(x, y)     // 页面坐标覆盖（视差/演示可用）
 *   LiquidGlass.refresh()            // 手动重建贴图（布局变化后调用）
 *   LiquidGlass.register(el)         // 动态新增玻璃元素后调用
 */
(function () {
  "use strict";

  var API = {};
  var reducedMotion = false;
  try {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { /* matchMedia 不可用则按常规模处理 */ }

  /* ============ 1. SVG 折射 filter 注入 ============================== */
  // 一份贴图三个 ref 各用一次：feImage 引 data-img-*（map 就绪后 JS 逐元素挂 href）
  var FILTER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:fixed;pointer-events:none" aria-hidden="true">' +
    '<defs>' +
    '<filter id="lg-refract" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">' +
    // R 通道
    '<feImage data-ch="r" result="map-r" preserveAspectRatio="none"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="map-r" scale="60" xChannelSelector="R" yChannelSelector="G" result="disp-r"/>' +
    '<feColorMatrix in="disp-r" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="ch-r"/>' +
    // G 通道
    '<feImage data-ch="g" result="map-g" preserveAspectRatio="none"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="map-g" scale="54" xChannelSelector="R" yChannelSelector="G" result="disp-g"/>' +
    '<feColorMatrix in="disp-g" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="ch-g"/>' +
    // B 通道
    '<feImage data-ch="b" result="map-b" preserveAspectRatio="none"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="map-b" scale="48" xChannelSelector="R" yChannelSelector="G" result="disp-b"/>' +
    '<feColorMatrix in="disp-b" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="ch-b"/>' +
    // screen 合成
    '<feBlend in="ch-r" in2="ch-g" mode="screen" result="rg"/>' +
    '<feBlend in="rg" in2="ch-b" mode="screen"/>' +
    "</filter>" +
    "</defs></svg>";

  function injectFilter() {
    if (document.getElementById("lg-svg")) return;
    var holder = document.createElement("div");
    holder.id = "lg-svg";
    holder.setAttribute("aria-hidden", "true");
    holder.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none";
    holder.innerHTML = FILTER_SVG;
    document.documentElement.appendChild(holder);
  }

  /* ============ 2. SDF 位移贴图 ====================================== */
  // 圆角矩形 SDF（2D，标准 iq 公式）
  function sdRoundRect(px, py, hw, hh, r) {
    var qx = Math.abs(px) - hw + r;
    var qy = Math.abs(py) - hh + r;
    var ax = Math.max(qx, 0), ay = Math.max(qy, 0);
    return Math.min(Math.max(qx, qy), 0) + Math.sqrt(ax * ax + ay * ay) - r;
  }

  // 对一个元素生成位移贴图（data URL）。返回 null 表示尺寸无效。
  function buildMap(el) {
    var rect = el.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    if (w < 8 || h < 8 || w * h > 4e6) return null;

    // 运行时读 computed radius 并 clamp 到半高（胶囊 999px → pill）
    var cs = getComputedStyle(el);
    var r = parseFloat(cs.borderTopLeftRadius) || 0;
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2));

    var band = Math.max(14, 0.34 * Math.min(w, h)); // rim 带宽
    var canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) return null;
    var img = ctx.createImageData(w, h);
    var data = img.data;
    var cx = w / 2, cy = h / 2, hw = w / 2, hh = h / 2;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        // SDF：元素内为负
        var px = x + 0.5 - cx, py = y + 0.5 - cy;
        var d = sdRoundRect(px, py, hw, hh, r);
        var t = 0; // rim 带内深度 0~1
        if (d < 0) {
          var depth = -d;             // 距边缘的深度
          if (depth < band) t = 1 - depth / band;
        }
        if (t > 0) {
          // 沿 SDF 负梯度（指向外缘）推；圆角矩形梯度可直接用归一化 (px,py) 近似中心区，
          // 边角用 SDF 数值梯度更稳——取一步有限差分
          var eps = 1.25;
          var dx = sdRoundRect(px + eps, py, hw, hh, r) - d;
          var dy = sdRoundRect(px, py + eps, hw, hh, r) - d;
          var len = Math.sqrt(dx * dx + dy * dy) || 1;
          // 位移方向 = 梯度反方向（向内推 → 贴图偏移为负梯度）
          var push = Math.pow(t, 1.6) * 0.92 * 44; // 强度基线（配合 scale 60）
          data[i]     = 128 + (dx / len) * push;
          data[i + 1] = 128 + (dy / len) * push;
        } else {
          data[i] = 128; data[i + 1] = 128; // 中性：中心不弯
        }
        data[i + 2] = 255; data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  // Chromium/Safari 的 backdrop-filter 无法直接引用每元素不同贴图的共享 filter，
  // 因此为每个元素克隆一份专属 filter（id 唯一），三通道 feImage href 指向该元素贴图。
  function buildFilterFor(el, url, index) {
    var holder = document.getElementById("lg-svg");
    var svg = holder.querySelector("svg");
    var fid = "lg-refract-" + index;
    var old = document.getElementById(fid);
    if (old) old.remove();
    var defs = svg.querySelector("defs");
    var filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", fid);
    filter.setAttribute("x", "-8%"); filter.setAttribute("y", "-8%");
    filter.setAttribute("width", "116%"); filter.setAttribute("height", "116%");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    var scales = { r: 60, g: 54, b: 48 };       // 12% spread = 色散
    var mats = {
      r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
      g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
      b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
    };
    ["r", "g", "b"].forEach(function (ch, n) {
      var feImg = document.createElementNS("http://www.w3.org/2000/svg", "feImage");
      feImg.setAttribute("result", "map-" + ch);
      feImg.setAttribute("preserveAspectRatio", "none");
      feImg.setAttribute("href", url);
      filter.appendChild(feImg);
      var dm = document.createElementNS("http://www.w3.org/2000/svg", "feDisplacementMap");
      dm.setAttribute("in", n === 0 ? "SourceGraphic" : "SourceGraphic");
      dm.setAttribute("in2", "map-" + ch);
      dm.setAttribute("scale", scales[ch]);
      dm.setAttribute("xChannelSelector", "R");
      dm.setAttribute("yChannelSelector", "G");
      dm.setAttribute("result", "disp-" + ch);
      filter.appendChild(dm);
      var cm = document.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
      cm.setAttribute("in", "disp-" + ch);
      cm.setAttribute("type", "matrix");
      cm.setAttribute("values", mats[ch]);
      cm.setAttribute("result", "ch-" + ch);
      filter.appendChild(cm);
    });
    var b1 = document.createElementNS("http://www.w3.org/2000/svg", "feBlend");
    b1.setAttribute("in", "ch-r"); b1.setAttribute("in2", "ch-g");
    b1.setAttribute("mode", "screen"); b1.setAttribute("result", "rg");
    filter.appendChild(b1);
    var b2 = document.createElementNS("http://www.w3.org/2000/svg", "feBlend");
    b2.setAttribute("in", "rg"); b2.setAttribute("in2", "ch-b");
    b2.setAttribute("mode", "screen");
    filter.appendChild(b2);
    defs.appendChild(filter);
    el.style.setProperty("--lg-filter", 'url("#' + fid + '") blur(3px)');
    el.classList.add("lg-on");
  }

  /* ============ 3. 元素发现与贴图批产 ================================ */
  var elements = [];

  function collect(root) {
    var nodes = (root || document).querySelectorAll(".lg, [data-lg]");
    nodes.forEach(function (n) { if (elements.indexOf(n) === -1) elements.push(n); });
  }

  function buildAll() {
    // 只在浏览器支持 backdrop-filter 时尝试折射；否则保持 frosted 降级
    var supported = CSS.supports && (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)"));
    if (!supported) return;
    injectFilter();
    elements.forEach(function (el, i) {
      if (!document.contains(el)) return;
      var url = buildMap(el);
      if (!url) return;
      buildFilterFor(el, url, i);
    });
  }

  /* ============ 4. 实时高光：指针 / 倾斜 / idle sway ================== */
  var target = { x: 0.32, y: 0.24 };   // 目标（0~1 视口比例）
  var current = { x: 0.32, y: 0.24 };  // 平滑后
  var tilt = null;                     // deviceorientation
  var frame = null;
  var idleT = 0;

  function onPointerMove(e) {
    target.x = e.clientX / window.innerWidth;
    target.y = e.clientY / window.innerHeight;
  }

  function onOrientation(e) {
    if (e.gamma == null || e.beta == null) return;
    tilt = {
      x: Math.max(-1, Math.min(1, e.gamma / 30)),
      y: Math.max(-1, Math.min(1, (e.beta - 45) / 40))
    };
  }

  function writeVars() {
    // lerp 0.06
    current.x += (target.x - current.x) * 0.06;
    current.y += (target.y - current.y) * 0.06;
    var tx = current.x, ty = current.y;
    if (tilt) { tx = (tx + tilt.x) / 2; ty = (ty + tilt.y) / 2; }
    // idle sway：无输入时高光缓慢漂移（reduced motion 下不做）
    if (!reducedMotion) {
      idleT += 0.008;
      var sway = Math.sin(idleT) * 0.05;
      tx += sway; ty += Math.cos(idleT * 0.8) * 0.035;
    }
    tx = Math.max(-0.1, Math.min(1.1, tx));
    ty = Math.max(-0.1, Math.min(1.1, ty));
    var root = document.documentElement.style;
    root.setProperty("--lg-tx", (tx * 100).toFixed(2) + "%");
    root.setProperty("--lg-ty", (ty * 100).toFixed(2) + "%");
    root.setProperty("--lg-bx", (100 - tx * 100).toFixed(2) + "%");
    // rim conic 角度 = 指针相对中心的方位角
    var ang = Math.atan2(ty - 0.5, tx - 0.5) * 180 / Math.PI + 90;
    root.setProperty("--lg-ang", ang.toFixed(1) + "deg");
    root.setProperty("--lg-ax", ((tx * 200) + 20).toFixed(1));
    frame = requestAnimationFrame(writeVars);
  }

  /* ============ 5. flash（蜂鸣/通知应答） ============================ */
  var flashV = 0;
  function flashLoop() {
    flashV *= 0.92;
    if (flashV < 0.01) flashV = 0;
    document.documentElement.style.setProperty("--lg-flash", flashV.toFixed(3));
    if (flashV > 0) requestAnimationFrame(flashLoop);
    else flashV = 0;
  }
  API.setFlash = function (v) {
    flashV = Math.max(0, Math.min(1, v || 0.6));
    document.documentElement.style.setProperty("--lg-flash", flashV.toFixed(3));
    if (!reducedMotion) requestAnimationFrame(flashLoop);
  };

  /* ============ 6. resize 重建（防抖 180ms） ========================== */
  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildAll, 180);
  }

  /* ============ 7. 启动 ============================================== */
  function start() {
    collect(document);
    // reduced motion：跳过折射重建循环中的 idle sway，但材质本身照常
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("deviceorientation", onOrientation, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    if (!reducedMotion) frame = requestAnimationFrame(writeVars);
    else writeVars(); // 静态写一次

    buildAll();
  }

  // 动态注册（main.js 新增玻璃元素后调用）
  API.register = function (el) {
    if (elements.indexOf(el) === -1) elements.push(el);
    if (document.readyState === "complete") buildAll();
  };
  API.refresh = function () {
    if (document.readyState === "complete") buildAll();
  };
  API.setPointer = function (x, y) { target.x = x; target.y = y; };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.LiquidGlass = API;
})();
