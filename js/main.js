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
      }, { passive: true } ? undefined : undefined);
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
    var lines = TERM[cmd] || [];
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

  /* ============ 启动 ================================================== */
  function start() {
    initReveal();
    initParallax();
    initFlash();
    initNav();
    initTerm();
    initGlass();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
