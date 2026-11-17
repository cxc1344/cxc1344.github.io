/* main.js — 页面行为层（零依赖，原生 JS）
 * 1) 指针 → LiquidGlass.setPointer：折射/高光随指针动（liquid-glass.js 已做全局跟踪，
 *    这里补 Hero 视差 + 蜂鸣 flash 应答）
 * 2) 滚动渐入：.io 加 .io-up 待入场，进视口加 .io-in；JS 失效时内容默认可见
 * 3) 导航平滑滚动（锚点；html.scroll-behavior 的 JS 兜底）
 * 4) prefers-reduced-motion：全部位移动效降级为直接显示/静态
 */
(function () {
  "use strict";

  var reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  /* ============ 1. 滚动渐入 ========================================= */
  function initReveal() {
    var items = document.querySelectorAll(".io");
    if (!("IntersectionObserver" in window) || reduced) {
      // 无 IO 或 reduced：不动，内容保持可见
      return;
    }
    items.forEach(function (el) {
      el.classList.add("io-up"); // 进入待入场态（main.css 初始 opacity:0）
      el._ioSeen = false;
    });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || entry.target._ioSeen) return;
          entry.target._ioSeen = true;
          // heading → text → 图 错峰：同段内按序给延迟
          var sibs = entry.target.parentElement
            ? Array.prototype.indexOf.call(
                entry.target.parentElement.querySelectorAll(".io"),
                entry.target
              )
            : 0;
          var delay = Math.max(0, Math.min(sibs, 4)) * 80; // 60–90ms 一档，封顶
          entry.target.style.transitionDelay = delay + "ms";
          entry.target.classList.add("io-in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    items.forEach(function (el) { io.observe(el); });
  }

  /* ============ 2. Hero 视差（玻璃浮在蜂格上） ======================= */
  function initParallax() {
    var bee = document.querySelector(".hero-bee");
    var panel = document.querySelector(".hero-panel");
    if (!bee || !panel || reduced || !window.matchMedia("(hover: hover) and (min-width: 900px)").matches) return;
    var raf = null;
    window.addEventListener("pointermove", function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        var dx = e.clientX / window.innerWidth - 0.5;
        var dy = e.clientY / window.innerHeight - 0.5;
        // 背景 ±6px 顺指针，玻璃面板 ±10px 逆指针 → 玻璃「浮」在背景之上
        bee.style.translate = (-50 + dx * 6) + "px " + (dy * 6) + "px";
        panel.style.translate = (-dx * 10) + "px " + (-dy * 8) + "px";
      });
    }, { passive: true });
  }

  /* ============ 3. 蜂鸣 flash：Hero 蜂每隔 ~8s 轻闪，玻璃应答 ======== */
  function initFlash() {
    if (reduced || !window.LiquidGlass) return;
    setInterval(function () {
      // 只在 Hero 可见时闪
      var hero = document.querySelector(".hero");
      if (!hero) return;
      var r = hero.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      window.LiquidGlass.setFlash(0.5);
    }, 8000);
  }

  /* ============ 4. 导航平滑滚动 ====================================== */
  function initNav() {
    var links = document.querySelectorAll('a[href^="#"]');
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href").slice(1);
        var target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        try {
          target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        } catch (err) {
          target.scrollIntoView();
        }
        // 修正地址栏，不触发跳转
        if (history.replaceState) history.replaceState(null, "", "#" + id);
      });
    });
  }

  /* ============ 5. 沙箱终端演示（one live thing） ====================== */
  var TERM = {
    whoami: [
      { t: "bot", c: "u" }, { t: " — 你的 Bot。有自己的人格设定和本地长期记忆。" }
    ],
    ls: [
      { t: "documents/  downloads/  projects/  skills/  .memory.db" }
    ],
    apt: [
      { t: "Reading package lists... Done", c: "d" },
      { t: "python3 is already the newest version (3.12.3).", c: "ok" },
      { t: "装好了。需要我写个脚本试试吗？", c: "" }
    ],
    rm: [] // 走批准卡，不直接输出
  };

  function termLine(parts, cls) {
    var body = document.getElementById("term-body");
    if (!body) return;
    var div = document.createElement("div");
    if (cls) div.className = cls;
    (Array.isArray(parts) ? parts : [{ t: parts }]).forEach(function (seg) {
      var s = document.createElement("span");
      if (seg.c) s.className = seg.c;
      s.textContent = seg.t;
      div.appendChild(s);
    });
    var cursor = body.querySelector(".term-cursor");
    if (cursor && cursor.parentElement) {
      cursor.parentElement.removeChild(cursor);
      body.appendChild(div);
      body.appendChild(cursor.parentElement === body ? cursor : makeCursor());
    } else {
      body.appendChild(div);
      body.appendChild(makeCursor());
    }
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function makeCursor() {
    var s = document.createElement("span");
    s.className = "term-cursor";
    return s;
  }

  function runCommand(cmd) {
    var body = document.getElementById("term-body");
    if (!body) return;
    var lastPrompt = body.lastElementChild;
    // 输出命令行回显
    var echo = document.createElement("div");
    var u = document.createElement("span"); u.className = "u"; u.textContent = "bot@bothive";
    echo.appendChild(u);
    echo.appendChild(document.createTextNode(":"));
    var d = document.createElement("span"); d.className = "d"; d.textContent = "~";
    echo.appendChild(d);
    echo.appendChild(document.createTextNode("$ " + cmd));
    var cursor = body.querySelector(".term-cursor");
    if (cursor) echo.appendChild(cursor);
    body.appendChild(echo);
    body.scrollTop = body.scrollHeight;

    if (cmd === "rm -rf ~") {
      var card = document.getElementById("approve-card");
      if (card) { card.classList.add("show"); if (window.LiquidGlass) LiquidGlass.register(card); }
      return;
    }
    var termKey = cmd === "whoami" ? "whoami"
      : (cmd === "ls" || cmd === "ls ~" || cmd === "ls ~/") ? "ls"
      : cmd.indexOf("apt") === 0 ? "apt" : null;
    if (!termKey) {
      termLine([{ t: "bash: " + cmd + "：未找到命令", c: "warn" }]);
      termLine([{ t: "试试 whoami、ls ~/、apt install python3，或者点下面的按钮。" }]);
      prompt();
      return;
    }
    var lines = TERM[termKey] || [];
    if (reduced) {
      lines.forEach(function (l) { termLine(l); });
      prompt();
      return;
    }
    // 打字机逐行输出
    var i = 0;
    (function next() {
      if (i >= lines.length) { prompt(); return; }
      var line = lines[i++];
      var div = termLine([{ t: "" }]);
      // 逐字符打
      var segs = Array.isArray(line) ? line : [line];
      var si = 0, ci = 0;
      (function type() {
        if (si >= segs.length) { setTimeout(next, 160); return; }
        var seg = segs[si];
        if (ci < seg.t.length) {
          var span = div.querySelectorAll("span")[si] || div.firstChild;
          if (!span || span.nodeType !== 1) {
            span = document.createElement("span");
            if (seg.c) span.className = seg.c;
            div.appendChild(span);
          }
          span.textContent += seg.t[ci++];
          body.scrollTop = body.scrollHeight;
          setTimeout(type, reduced ? 0 : 14);
        } else { si++; ci = 0; type(); }
      })();
    })();
  }

  function prompt() {
    var body = document.getElementById("term-body");
    if (!body) return;
    var div = document.createElement("div");
    var u = document.createElement("span"); u.className = "u"; u.textContent = "bot@bothive";
    var d = document.createElement("span"); d.className = "d"; d.textContent = "~";
    div.appendChild(u); div.appendChild(document.createTextNode(":"));
    div.appendChild(d); div.appendChild(document.createTextNode("$ "));
    div.appendChild(makeCursor());
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function initTerm() {
    var body = document.getElementById("term-body");
    if (!body) return;
    var buttons = document.querySelectorAll(".term-cmds button");
    var map = {
      whoami: "whoami",
      ls: "ls ~/",
      apt: "apt install python3",
      rm: "rm -rf ~"
    };
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-cmd");
        var card = document.getElementById("approve-card");
        if (card) card.classList.remove("show");
        runCommand(map[key] || key);
      });
    });
    var deny = document.getElementById("approve-deny");
    var allow = document.getElementById("approve-allow");
    if (deny) deny.addEventListener("click", function () {
      document.getElementById("approve-card").classList.remove("show");
      termLine([{ t: "已拒绝。沙箱原样保留，主目录没事。", c: "ok" }]);
      prompt();
    });
    if (allow) allow.addEventListener("click", function () {
      document.getElementById("approve-card").classList.remove("show");
      termLine([{ t: "批准收到。重置沙箱主目录……", c: "warn" }]);
      setTimeout(function () {
        termLine([{ t: "完成。~/ 已恢复出厂，Bot 重新在线。", c: "ok" }]);
        prompt();
      }, reduced ? 0 : 700);
    });
    var form = document.getElementById("term-form");
    var input = document.getElementById("term-input");
    if (form && input) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var raw = input.value.trim().replace(/\s+/g, " ");
        if (!raw) return;
        input.value = "";
        var c = document.getElementById("approve-card");
        if (c) c.classList.remove("show");
        runCommand(raw);
      });
    }
    if (window.LiquidGlass) {
      var card = document.getElementById("approve-card");
      if (card) LiquidGlass.register(card);
    }
  }

  /* ============ 6. 玻璃贴图就绪后补一次 Hero 面板刷新 ================== */
  function initGlass() {
    if (!window.LiquidGlass) return;
    // 字体/布局稳定后再建贴图（首帧 getBoundingClientRect 可能偏早）
    window.addEventListener("load", function () {
      LiquidGlass.refresh();
    });
    // 动态批准卡显示时刷新（display:none → grid 后尺寸变化）
    var card = document.getElementById("approve-card");
    if (card) {
      var obs = new MutationObserver(function () {
        if (card.classList.contains("show")) LiquidGlass.refresh();
      });
      obs.observe(card, { attributes: true, attributeFilter: ["class"] });
    }
  }

  /* ============ 0.6.0 主题色系统 ==================================== */
  var THEME_PRESETS = [
    { name: "蜂蜜黄", h: 45, s: 76, v: 100 },
    { name: "Claude 橙", h: 18, s: 65, v: 83 },
    { name: "天空蓝", h: 210, s: 55, v: 90 },
    { name: "抹茶绿", h: 145, s: 50, v: 85 },
    { name: "葡萄紫", h: 275, s: 50, v: 80 },
    { name: "樱花粉", h: 340, s: 55, v: 90 },
    { name: "薄荷青", h: 170, s: 50, v: 88 },
    { name: "珍珠白", h: 60, s: 10, v: 95 }
  ];

  var themeState = { h: 45, s: 76, v: 100, custom: false, name: "蜂蜜黄" };

  function hsvToRgb(h, s, v) {
    h = ((Number(h) % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, Number(s))) / 100;
    v = Math.max(0, Math.min(100, Number(v))) / 100;
    var c = v * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = v - c;
    var rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return rgb.map(function (n) { return Math.round((n + m) * 255); });
  }

  function rgbHex(rgb) {
    return "#" + rgb.map(function (n) {
      return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    }).join("").toUpperCase();
  }

  function applyTheme(save) {
    var root = document.documentElement;
    var rgb = hsvToRgb(themeState.h, themeState.s, themeState.v);
    var deep = hsvToRgb(themeState.h, themeState.s, themeState.v * 0.85);
    var pale = hsvToRgb(themeState.h, themeState.s * 0.45, Math.min(100, themeState.v * 1.04));
    var accent = rgbHex(rgb);
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-deep", rgbHex(deep));
    root.style.setProperty("--accent-pale", rgbHex(pale));
    root.style.setProperty("--accent-rgb", rgb.join(", "));

    var preview = document.getElementById("theme-preview-swatch");
    var previewName = document.getElementById("theme-preview-name");
    var previewHex = document.getElementById("theme-preview-hex");
    if (preview) preview.style.backgroundColor = accent;
    if (previewName) previewName.textContent = themeState.custom ? "自定义颜色" : themeState.name;
    if (previewHex) previewHex.textContent = accent;

    var ranges = [
      ["hue-range", "hue-value", themeState.h, "°"],
      ["sat-range", "sat-value", themeState.s, "%"],
      ["val-range", "val-value", themeState.v, "%"]
    ];
    ranges.forEach(function (item) {
      var input = document.getElementById(item[0]);
      var output = document.getElementById(item[1]);
      if (input) input.value = String(item[2]);
      if (output) output.textContent = String(item[2]) + item[3];
    });

    var presetButtons = document.querySelectorAll(".theme-preset");
    presetButtons.forEach(function (button) {
      var match = !themeState.custom && Number(button.dataset.h) === themeState.h &&
        Number(button.dataset.s) === themeState.s && Number(button.dataset.v) === themeState.v;
      button.classList.toggle("is-active", match);
      button.setAttribute("aria-pressed", match ? "true" : "false");
      var swatch = button.querySelector("i");
      if (swatch) swatch.style.setProperty("--swatch", rgbHex(hsvToRgb(button.dataset.h, button.dataset.s, button.dataset.v)));
    });

    if (save) {
      try {
        window.localStorage.setItem("bothive-theme", JSON.stringify({
          h: themeState.h, s: themeState.s, v: themeState.v, custom: themeState.custom
        }));
      } catch (e) { /* 隐私模式或禁用存储时仍可正常使用 */ }
    }
  }

  function initTheme() {
    var card = document.getElementById("theme-card");
    if (!card) return;
    try {
      var stored = window.localStorage.getItem("bothive-theme");
      if (stored) {
        var saved = JSON.parse(stored);
        if (saved && Number.isFinite(Number(saved.h)) && Number.isFinite(Number(saved.s)) && Number.isFinite(Number(saved.v))) {
          themeState.h = Math.max(0, Math.min(360, Math.round(Number(saved.h))));
          themeState.s = Math.max(0, Math.min(100, Math.round(Number(saved.s))));
          themeState.v = Math.max(0, Math.min(100, Math.round(Number(saved.v))));
          themeState.custom = Boolean(saved.custom);
          var matched = THEME_PRESETS.find(function (preset) {
            return preset.h === themeState.h && preset.s === themeState.s && preset.v === themeState.v;
          });
          themeState.name = matched ? matched.name : "自定义颜色";
        }
      }
    } catch (e) { /* 坏数据按默认蜂蜜黄启动 */ }

    card.querySelectorAll(".theme-preset").forEach(function (button) {
      button.addEventListener("click", function () {
        themeState.h = Number(button.dataset.h);
        themeState.s = Number(button.dataset.s);
        themeState.v = Number(button.dataset.v);
        themeState.custom = false;
        themeState.name = button.dataset.name || "预设颜色";
        applyTheme(true);
      });
    });

    [
      ["hue-range", "h"],
      ["sat-range", "s"],
      ["val-range", "v"]
    ].forEach(function (pair) {
      var input = document.getElementById(pair[0]);
      if (!input) return;
      input.addEventListener("input", function () {
        themeState[pair[1]] = Number(input.value);
        themeState.custom = true;
        themeState.name = "自定义颜色";
        applyTheme(true);
      });
    });

    var copyBtn = document.getElementById("theme-copy");
    if (copyBtn) {
      var copyTimer = 0;
      var fallbackCopy = function (text) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta);
      };
      copyBtn.addEventListener("click", function () {
        var hex = rgbHex(hsvToRgb(themeState.h, themeState.s, themeState.v));
        var done = function () {
          copyBtn.textContent = "已复制";
          copyBtn.classList.add("is-copied");
          window.clearTimeout(copyTimer);
          copyTimer = window.setTimeout(function () {
            copyBtn.textContent = "复制";
            copyBtn.classList.remove("is-copied");
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(hex).then(done, function () { fallbackCopy(hex); done(); });
        } else {
          fallbackCopy(hex);
          done();
        }
      });
    }

    applyTheme(false);
  }

  /* ============ 0.6.0 液态胶囊：双边缘弹簧 ========================== */
  function initLiquidGroup(track, onSelect) {
    var buttons = Array.prototype.slice.call(track.querySelectorAll(".seg-item"));
    var drop = track.querySelector(".seg-drop");
    if (!buttons.length || !drop) return;

    var activeIndex = Math.max(0, Math.min(buttons.length - 1, Number(track.dataset.activeIndex) || 0));
    var current = { left: 0, right: 0, vLeft: 0, vRight: 0 };
    var target = { left: 0, right: 0 };
    var frame = 0;
    var lastTime = 0;
    var direction = 0;
    var dragged = false;
    var suppressClick = false;
    var pointerStartX = 0;
    var pointerId = null;

    function measure(index) {
      var trackRect = track.getBoundingClientRect();
      var rect = buttons[index].getBoundingClientRect();
      return { left: rect.left - trackRect.left, right: rect.right - trackRect.left };
    }

    function setActive(index) {
      activeIndex = Math.max(0, Math.min(buttons.length - 1, index));
      track.dataset.activeIndex = String(activeIndex);
      buttons.forEach(function (button, i) {
        var selected = i === activeIndex;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      if (typeof onSelect === "function") onSelect(activeIndex);
    }

    function draw() {
      var left = Math.max(0, current.left);
      var width = Math.max(8, current.right - current.left);
      drop.style.width = width + "px";
      drop.style.setProperty("--drop-x", left + "px");
    }

    function settlePulse() {
      drop.classList.remove("is-settling");
      // 触发一次样式计算，确保连续快速点击时也能重新播放回弹
      void drop.offsetWidth;
      drop.classList.add("is-settling");
      window.setTimeout(function () { drop.classList.remove("is-settling"); }, 380);
    }

    function stopFrame() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    }

    function setPosition(index, animate, pulse) {
      var next = measure(index);
      var nextDirection = next.left > current.left + 0.5 ? 1 : next.left < current.left - 0.5 ? -1 : 0;
      target.left = next.left;
      target.right = next.right;
      direction = nextDirection;
      if (!animate || reduced) {
        stopFrame();
        current.left = target.left;
        current.right = target.right;
        current.vLeft = current.vRight = 0;
        draw();
        if (pulse && !reduced) settlePulse();
        return;
      }
      if (frame) return;

      function tick(time) {
        if (!lastTime) lastTime = time;
        var dt = Math.min(0.032, Math.max(0.001, (time - lastTime) / 1000));
        lastTime = time;
        // 向右时左边缘是前缘，向左时右边缘是前缘；前缘更快，后缘稍慢
        var leftK = direction >= 0 ? 700 : 230;
        var rightK = direction < 0 ? 700 : 230;
        var leftD = 2 * Math.sqrt(leftK) * 0.58;
        var rightD = 2 * Math.sqrt(rightK) * 0.74;
        var aLeft = -leftK * (current.left - target.left) - leftD * current.vLeft;
        var aRight = -rightK * (current.right - target.right) - rightD * current.vRight;
        current.vLeft += aLeft * dt;
        current.vRight += aRight * dt;
        current.left += current.vLeft * dt;
        current.right += current.vRight * dt;
        draw();

        var settled = Math.abs(current.left - target.left) < 0.12 &&
          Math.abs(current.right - target.right) < 0.12 &&
          Math.abs(current.vLeft) < 0.65 && Math.abs(current.vRight) < 0.65;
        if (settled) {
          current.left = target.left;
          current.right = target.right;
          current.vLeft = current.vRight = 0;
          draw();
          frame = 0;
          lastTime = 0;
          if (pulse) settlePulse();
          return;
        }
        frame = window.requestAnimationFrame(tick);
      }
      frame = window.requestAnimationFrame(tick);
    }

    function choose(index, animate) {
      if (index < 0 || index >= buttons.length) return;
      var changed = index !== activeIndex;
      setActive(index);
      setPosition(index, animate !== false, changed && animate !== false);
    }

    function nearestIndex(clientX) {
      var closest = 0;
      var distance = Infinity;
      buttons.forEach(function (button, index) {
        var rect = button.getBoundingClientRect();
        var d = Math.abs(clientX - (rect.left + rect.width / 2));
        if (d < distance) { distance = d; closest = index; }
      });
      return closest;
    }

    // 首帧按当前选中项对齐；ResizeObserver 处理横竖屏与容器宽度变化
    setActive(activeIndex);
    var initial = measure(activeIndex);
    current.left = target.left = initial.left;
    current.right = target.right = initial.right;
    draw();

    track.addEventListener("click", function (event) {
      var button = event.target.closest(".seg-item");
      if (!button) return;
      if (suppressClick) { event.preventDefault(); suppressClick = false; return; }
      choose(buttons.indexOf(button), true);
    });

    track.addEventListener("keydown", function (event) {
      var button = event.target.closest(".seg-item");
      if (!button) return;
      var idx = buttons.indexOf(button);
      var next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (idx + 1) % buttons.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (idx - 1 + buttons.length) % buttons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      if (next === null) return;
      event.preventDefault();
      choose(next, true);
      buttons[next].focus();
    });

    track.addEventListener("pointerdown", function (event) {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      var button = event.target.closest(".seg-item");
      if (!button) return;
      pointerId = event.pointerId;
      pointerStartX = event.clientX;
      dragged = false;
      track.classList.add("is-pressed");
      try { track.setPointerCapture(pointerId); } catch (e) {}
    });

    track.addEventListener("pointermove", function (event) {
      if (pointerId === null || event.pointerId !== pointerId) return;
      if (Math.abs(event.clientX - pointerStartX) > 4) dragged = true;
      if (dragged) choose(nearestIndex(event.clientX), true);
    });

    function finishPointer(event) {
      if (pointerId === null || (event && event.pointerId !== pointerId)) return;
      if (dragged && event && Number.isFinite(event.clientX)) choose(nearestIndex(event.clientX), true);
      track.classList.remove("is-pressed");
      if (dragged) {
        suppressClick = true;
        window.setTimeout(function () { suppressClick = false; }, 0);
      }
      var oldId = pointerId;
      pointerId = null;
      dragged = false;
      try { if (track.hasPointerCapture(oldId)) track.releasePointerCapture(oldId); } catch (e) {}
    }
    track.addEventListener("pointerup", finishPointer);
    track.addEventListener("pointercancel", finishPointer);
    track.addEventListener("lostpointercapture", function () {
      if (pointerId !== null) finishPointer({ pointerId: pointerId });
    });

    if ("ResizeObserver" in window) {
      var resizeObserver = new ResizeObserver(function () {
        var next = measure(activeIndex);
        stopFrame();
        current.left = target.left = next.left;
        current.right = target.right = next.right;
        current.vLeft = current.vRight = 0;
        draw();
      });
      resizeObserver.observe(track);
    } else {
      window.addEventListener("resize", function () {
        var next = measure(activeIndex);
        current.left = target.left = next.left;
        current.right = target.right = next.right;
        draw();
      });
    }

    return { getActiveIndex: function () { return activeIndex; } };
  }

  function initLiquidSegments() {
    var stateText = document.getElementById("capsule-state-text");
    var modeNames = ["Bot 模式", "Agent 模式"];
    var roleNames = ["管家", "程序员", "画师", "管账的"];
    var selectedMode = 0;
    var selectedRole = 0;
    function updateText() {
      if (stateText) stateText.innerHTML = "当前选择 <strong>" + modeNames[selectedMode] + " · " + roleNames[selectedRole] + "</strong>";
    }
    var modeTrack = document.querySelector(".liquid-seg");
    var roleTrack = document.querySelector(".liquid-choice");
    if (modeTrack) initLiquidGroup(modeTrack, function (index) { selectedMode = index; updateText(); });
    if (roleTrack) initLiquidGroup(roleTrack, function (index) { selectedRole = index; updateText(); });
    updateText();
  }

  /* ============ 7. 滚动进度 + 章节高亮 + 卡片聚光 ==================== */
  function initScrollUI() {
    var bar = document.querySelector(".scroll-progress");
    var spyLinks = document.querySelectorAll('.nav-links a[href^="#"]');
    var ticking = false;
    function update() {
      ticking = false;
      if (bar) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
        bar.style.transform = "scaleX(" + p + ")";
      }
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();

    if ("IntersectionObserver" in window && spyLinks.length) {
      var byId = {};
      spyLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          spyLinks.forEach(function (a) { a.classList.remove("is-current"); });
          var link = byId[entry.target.id];
          if (link) link.classList.add("is-current");
        });
      }, { rootMargin: "-38% 0px -55% 0px" });
      Object.keys(byId).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) spy.observe(el);
      });
    }

    // 特性卡聚光：只在可悬停设备上跟踪指针
    if (window.matchMedia("(hover: hover)").matches && !reduced) {
      document.querySelectorAll(".feature-card").forEach(function (card) {
        var raf = null;
        card.addEventListener("pointermove", function (e) {
          if (raf) return;
          raf = window.requestAnimationFrame(function () {
            raf = null;
            var r = card.getBoundingClientRect();
            card.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
            card.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
          });
        }, { passive: true });
      });
    }

    var year = document.getElementById("foot-year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  /* ============ 8. 回到顶部 ========================================= */
  function initToTop() {
    var btn = document.getElementById("to-top");
    if (!btn) return;
    var ticking = false;
    function update() {
      ticking = false;
      btn.classList.toggle("is-show", window.scrollY > 600);
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
    btn.addEventListener("click", function () {
      try {
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      } catch (e) {
        window.scrollTo(0, 0);
      }
    });
  }

  /* ============ 启动 ================================================== */
  function start() {
    initTheme();
    initLiquidSegments();
    initReveal();
    initParallax();
    initFlash();
    initNav();
    initTerm();
    initGlass();
    initScrollUI();
    initToTop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
