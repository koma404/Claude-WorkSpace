// ==UserScript==
// @name         Contest → Claude 一键解题
// @namespace    https://github.com/koma404/claude-workspace
// @version      0.6.10
// @description  在 Codeforces / AtCoder / 洛谷 / LeetCode / Vjudge / 代码源 题目页面一键提取题面，发送给 Claude（网页版或 API）
// @author       koma404
// @homepageURL  https://github.com/koma404/Claude-WorkSpace
// @updateURL    https://raw.githubusercontent.com/koma404/Claude-WorkSpace/HEAD/claude-contest-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/koma404/Claude-WorkSpace/HEAD/claude-contest-helper.user.js
// @match        https://codeforces.com/*
// @match        https://*.codeforces.com/*
// @match        https://codeforc.es/*
// @match        https://atcoder.jp/*
// @match        https://www.luogu.com.cn/*
// @match        https://leetcode.com/*
// @match        https://leetcode.cn/*
// @match        https://vjudge.net/*
// @match        https://newoj.daimayuan.top/*
// @match        https://claude.ai/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api.anthropic.com
// @connect      vjudge.net
// @connect      vjudge.net.cn
// @connect      cdn.vjudge.net.cn
// @connect      *
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 配置（可通过油猴菜单修改，保存在脚本存储中）
  // ---------------------------------------------------------------------------
  const DEFAULTS = {
    mode: 'web',             // 'web'：打开 claude.ai 自动填入；'api'：调用 Anthropic API 在页面内显示
    autoSend: false,         // web 模式下填入后是否自动点击发送（默认只填入，由你自己按发送）
    apiKey: '',              // api 模式需要
    model: 'claude-opus-5-5',
    // web 模式下打开的地址：填 Claude 项目链接则在该项目里新建对话；留空则用 https://claude.ai/new
    projectUrl: 'https://claude.ai/project/01a11f70-bbd7-727e-9e27-93b81bc5d979',
    maxTokens: 16000,
    tabPos: null,            // 悬浮标签位置（拖动后自动保存）
    vjudgeSidebar: true,     // Vjudge 左侧面板里是否显示按钮
  };
  const cfg = (k) => GM_getValue(k, DEFAULTS[k]);
  const PENDING_KEY = 'pendingPrompt';
  const PENDING_TTL = 2 * 60 * 1000;

  // 只在题目页面显示按钮。Vjudge / LeetCode 是单页应用，URL 变化时不刷新页面，所以要持续检查。
  const PROBLEM_PAGES = [
    { host: /(^|\.)codeforces\.com$|^codeforc\.es$/, path: /^\/(problemset\/problem\/\d+\/\w+|problemset\/gymProblem\/\d+\/\w+|(contest|gym)\/\d+\/problem\/\w+|group\/\w+\/contest\/\d+\/problem\/\w+)\/?$/ },
    { host: /^atcoder\.jp$/, path: /^\/contests\/[^/]+\/tasks\/[^/]+\/?$/ },
    { host: /^www\.luogu\.com\.cn$/, path: /^\/problem\/(?!list\/?$|solution\/)[\w-]+\/?$/ },
    { host: /^leetcode\.(com|cn)$/, path: /^\/problems\/[\w-]+(\/description)?\/?$/ },
    { host: /^newoj\.daimayuan\.top$/, path: /^(\/d\/[^/]+)?\/p\/[^/]+\/?$/ },
    { host: /^vjudge\.net$/, path: /^\/problem\/(?!description\/)[^/]+\/?$/ },
    { host: /^vjudge\.net$/, path: /^\/contest\/\d+\/?$/, hash: /^#problem\/\w+/ },
  ];
  const isProblemPage = () => PROBLEM_PAGES.some((r) => r.host.test(location.hostname)
    && r.path.test(location.pathname) && (!r.hash || r.hash.test(location.hash)));

  // ---------------------------------------------------------------------------
  // claude.ai 端：读取待发送的题目并填入输入框
  // ---------------------------------------------------------------------------
  if (location.hostname === 'claude.ai') {
    runOnClaude();
    return;
  }

  // ---------------------------------------------------------------------------
  // 题目页面端
  // ---------------------------------------------------------------------------
  // Claude 图标（白色透明底 PNG），用作 CSS mask，颜色跟随 currentColor
  const ICON_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAALGUlEQVR42p2Ze4xc1X3HP/fe2V2vX2AbbIwKJjWYNpF5FJQgCGASlJaQQFqM0sRVG6ANTYgaRaQllRqJVChWFKqSAAklEAUpUWRRIoJK06TQlrQ8XdlpEtsxD9sB2zv78s7uzuzOzJ17P/1jjsezs7OzOOdK87iP8/vd7/me8/v+fieSHi0iYg2fYwOvsp8dSET3B2Ly8ETPDrs0Fz4iY/ERddpUvTec6XYnXuMjXh1+n8TR62Is/pl1hxy26KgVLwpn55v/jDVVb+h6x2/kQCyu8VdOOeKYYxZNvV9Muphfb9G649Y94NqTQyHuMTYwwwRJ+J9Q4XrWkxPNuS8BbmItFfpJWcWp0HFHz9bLgYRZdtMfaBUxyzv4xDync+ACIiJkCUcYCs63U7lAgb7Wq7xNB5rtp8ShO0lo8KesnINBRE7MpjAPYl5juvUErXnRoEFK1g2ZXg7kRPyQXawgAwoMMsv5fHgeBjGDLZNHOvqMkT6+yMN8hxu6DrmLzYOrnHXEccuWnTLzeaM2kkXiEvdad9pJ9W/FQutqIp7mT2y2Ec+aP0fmT6longsPmluybNmy09b9gFFrLkTiOo84Gxy4uW2exOIpPqMes+SY+qQDvR2Iw2fcdibyTIetOm3ZsiX1qTZHY/E8S1atO+Os57V6icSl/qs6EZyvmHpJJwadM3qg5UQ7jHeqk6GbslXf0+YsXm5qw5p6yBWhn+aa+d0281PW/ZWDC68DMbKN/+Fx/okLySkEzuYkPMRuloXVvsEAf9PGcTiLQvi3hzIREJGQ83W2UaKvRek+djM7j4Zt4H/IMStW1KNubcMhEW9Qp8L7p+ZeGc4n4u1qalX9cqBgQbyj9USTO1M2/IOFSRiJjznpm446ZMkZ73ZJi1CJ+AO1ZNXcuvqjwJSCuF2tmaq3iAUT8X2mVtuGraTe0y1OtI/056067Jhjjjhi5jP+Vtt7brZi3YaZmQ1Tt4iJfeIDatXcmu8JLp3hm2rdtI26jxuZzI8S7Q5cZ2rRUcccc9Qhcw94jZgYm4j/qNbNzKyr/ynGFsRvq1V1xOVi4oDPqjUzc2uWnTR1n6d2j5PMmXAPqWMBhTEnTK37eRELRp7pqLlpwCDzA2Js4n8HB14KL/JgMJ+ZmTtjxaqXdImjHQ5ExvZ5h6NWLTrmMctOWVG/72qxX7yrhUGqviBGrvYNtabebyTeptbCUB1H67aFzHfTA5f6orlFxwJ7S+rrvl+MPcU3zE3N1Uz9sHiOk2qq/rl4hbM2AkrHzX8nIPg2HIgsiCv8hqnTYfmdtqxW/aKIt6gNVRvmvmzkJjM1V7e4zDe0w/zPXN6NfAsj0CTKxx1SJ510xtzUhvpj3yXubLmQqVf7u+HXkKv9briWBZ40nPTiheFfSJI1l9FNPq7WnDVvvc2I1/puK2YtDL7pu4PRN3wkuGJwoa5+ckHzUW9N2HzoEx7V1uyvq7rdgwHyTN3pzeGfbd+qdfVb88xHxiYWjI8HvV5aIBbP9vuhu6zDQLOl/rxlvNF2PjN3v6uMQ2g6bvTE0df8jnrmEQkZcCtfZh0pCTGSd9d2HQEmJ2ErT9BPI+jGZuvnXDZzFhv5HQ7xMC9GLi5aczZwL1uBrIvxvIvMykj4D97f+r+ezbyDS9jE2ZzGCgBSEsrcFAkxcZMPbWKy3a8CDeAv+RJryYkWFd0iVS5mnI38NldxERs4M1xLadAgB6qkrGTbwgjELX3fNJlyDvdx4wI4zHUgosxPOZ+NbZiUQ28CCQVylrKTKyLhMjYzxhRHmWGCBik52QKd385XWYFvM/XIwugL1JCEfvqAjGPs5H95mlciP8599JHTICKnQcoUdaY5QI1JhskoM8MIIxylBJzLY1zedeQ7jdNSXccVU43D7GIPL/MKx5roFhhkKUeJiFlKgQKDrAEGuaajuwqTVEjYy7K3NQtsmYWD7OV1/os9TDDWNsckjyzwD3yaOjkx/WRIAykQkyODgZ4JJ9/kIHv4N15lL0fbzMbk5MeJHglLuZ6zGWAF61hJP4OcwgCyhNX0EdFPTEyyKOgnKLiPp9jNLl7rWfqAHCLn1zRiYiKgj1UUgAEGGGAZy5EzGOCjXN2DAxLxS3bxC+pESI0IMQzhCDWKlE/UVSKbItoWZRZrl/AwF/dM7BfGps4UKceoUOEV7mM4rEB2S9BOHLGx/SJu9p/Dup+5cKu5vxUf6kGSTTrptGVnrVq3Ylnd46WLxYL2iHAGf82nGCQnb+N3t/escgu/5gqu5lJOD/fO0EAiIiIy6kCDNRzkg4uVUJoxsc/PeCREv1TVh/x1iPqdLVcnvEzEpV7pZ33I1yyHq1WPWXTYUUd9S/1Kb+PNWH6jO0NIbhrf51X+VZDd3Vqu1ryuTYav8Hxv8+u+4DHrps46YcmGB9yysPkkSNSnW8braur99nmjmpurz9nowonUzFn/UOyzr02S9LnRj3ivP/GIh/ySZywkSJoyYqPfsKpOmQZBstv3iVfaCMJ8hx9rKcQ8fObB4dzUvxCTQOSkrXCB57mhaWnhd/+cR9SykyE7SN3uklCSaxod83R3qJmj7grGM3MnrIbURO9uacwTgixpJb1RtwpJLG70KTMnLFpyyrL6opeJBZf4Y7Vm3cwPiftU/Xc3O2PDhqn6c3/folq1qj4wx4W55O6SFyD+iW85a9FRRy2qJT9rvzgg3q3WralfE5d7UNUfiPcE5VhX73a9e9QJJ9UdJgsWeelcflb5qOMWHXHcYijIvEtCanattWD+JZcaeaFlG+oDRq72oJmpDRvq5a7zh2op9JEsVMLtTEketeEBD/mWQ9Y94B1htBJxk8PWrdtwwgtEvM7cqvoVEbcF8tXVX7rMAb+pTjtu7o88rXuGMNf8Cnd52Nc96FGnfcJNYbQiY5f4XKiW6cfCgNyqzqp3iQVjn1HLVpwM1RK807pTvqm+0Ko2LJgdRy7xe9adcNxfuC2k5cczxq+pJSfVh0PNAL8VEvPbwhBdaMmKU047bc0tIv6Rx6z4pqk/853zXeik4Kne7s2+13Vt3C2InzRzzAn1ZQcDhxN3m1m27pbWunmnWrLspA13utyC+Hv+n5mHnfGAF3fW0nuthFFrVbjIcScseswx39laqFY67Kzl1j5CZMFBnzN30imH1e1hqNb6mJkjTgYXkl6V0qRtqWh2u859lh12OJShjjP6WuuWrXo44NU8e4HTlhxx1FFLvreVhH3KMUuWfNJCez128WgY+YQVixbNfbBVCS6InzZ33Kr7XdYCtiB+wdyi4w5b9WUHWoy53Bdt+KxL374DBfEupz3gQWd83pUB/CYK99rwqFO+1AZpZGy/z1qz6JhDZm4PXErEVd7TWaxdrFZ+o1Me8oDjvuD6OXXgAZ911iFn/Jc5tIrFcy064Zijjlj0/HA2Prktm5ictfw9MzRYyRDbGGptzgGcyiaqRPQxPCdTykl4nb9jGVVqVKC1iZMTkXTmVHEP4Qxb2UCJ5YxwEwdJWuYj4BxOoU5EQrGjn4wCj/A9VlChwQDr2uRa1il7e29axQyynhpb2R+U4QkHLiNjhhkaHJ63TZUR8QUOs5HTWcp4L8FZ6JlgPMoI1/NV9hLPS1c3hdpBykyXZ2OG+WM+wkqe5qWQKZ70zmln5Yw5OyHPO+IhD1rxo3O2aTqKUIsdBXrvHTd3wPJ5V/pZEoR2meF5G3XHUYiQqMfbL7ptJ1lIJOcWZRJGeZI15CylypGuDkBO1qPScFJD0C1zWuUOh33VW092t3juEclv3CJuYCdH56wOJ93+H3IN1mzlSN+MAAAAAElFTkSuQmCC';
  const isVjudge = location.hostname === 'vjudge.net';
  const HAS_NATIVE_COPY = /^(www\.luogu\.com\.cn|newoj\.daimayuan\.top)$/.test(location.hostname);

  // 脚本在 document-start 运行：赶在网站自己的脚本之前，在 window 捕获阶段注册复制和快捷键监听。
  // 有的 OJ（如代码源）会拦截 copy 事件和按键，后注册的监听器会被它们挡掉。
  let pendingCopy = null; // 脚本自己要写入剪贴板的文本
  window.addEventListener('copy', (e) => {
    if (pendingCopy === null) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    e.clipboardData.setData('text/plain', pendingCopy);
  }, true);
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey || !isProblemPage()) return;
    if (e.code === 'KeyC') { e.preventDefault(); e.stopImmediatePropagation(); sendToClaude(); }
    if (e.code === 'KeyM') { e.preventDefault(); e.stopImmediatePropagation(); copyMarkdown(); }
  }, true);

  // 界面要等页面 DOM 就绪再创建
  let edgeTab = null;
  let sidebarRow = null;
  const onReady = (fn) => (document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn());
  onReady(() => {
    registerMenu();
    injectStyle();
    edgeTab = createEdgeTab();
    syncUi();
    window.addEventListener('hashchange', syncUi);
    window.addEventListener('popstate', syncUi);
    window.addEventListener('resize', () => placeEdgeTab(edgeTab, cfg('tabPos')));
    setInterval(syncUi, 500);
  });

  // Vjudge：有左侧面板（#prob-operation）时把按钮放进面板，否则用屏幕边缘的悬浮标签
  function syncUi() {
    const onProblem = isProblemPage();
    const panel = isVjudge ? document.querySelector('#prob-operation') : null;
    if (panel) {
      const show = onProblem && cfg('vjudgeSidebar');
      if (show && (!sidebarRow || !panel.contains(sidebarRow))) {
        sidebarRow?.remove();
        sidebarRow = createSidebarRow();
        panel.appendChild(sidebarRow);
      }
      if (sidebarRow) sidebarRow.style.display = show ? '' : 'none';
      edgeTab.style.display = 'none';
    } else {
      edgeTab.style.display = onProblem ? 'flex' : 'none';
    }
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .cc-icon { display:inline-block; width:1.1em; height:1.1em; flex:none; vertical-align:-0.15em;
        background-color:currentColor; -webkit-mask:url(${ICON_URL}) center/contain no-repeat; mask:url(${ICON_URL}) center/contain no-repeat; }
      #cc-edge-tab { position:fixed; right:0; top:62%; z-index:2147483646; display:none; align-items:center;
        padding-right:4px; border-radius:999px 0 0 999px; background:#d97757; color:#fff;
        font:600 14px/1 system-ui, sans-serif; white-space:nowrap; user-select:none; touch-action:none;
        box-shadow:0 2px 10px rgba(0,0,0,.25); transform:translateX(calc(100% - 34px)); transition:transform .2s ease; }
      #cc-edge-tab.cc-left { right:auto; left:0; flex-direction:row-reverse; padding:0 0 0 4px;
        border-radius:0 999px 999px 0; transform:translateX(calc(-100% + 34px)); }
      #cc-edge-tab.cc-open, #cc-edge-tab.cc-dragging { transform:translateX(0); }
      #cc-edge-tab .cc-handle:hover { background:rgba(0,0,0,.12); border-radius:999px; }
      #cc-edge-tab.cc-dragging { transition:none; }
      #cc-edge-tab .cc-handle { display:flex; align-items:center; justify-content:center; width:34px; height:34px; flex:none; cursor:grab; }
      #cc-edge-tab.cc-dragging, #cc-edge-tab.cc-dragging * { cursor:grabbing; }
      #cc-edge-tab .cc-icon { width:16px; height:16px; }
      #cc-edge-tab button { height:26px; margin:4px 0; padding:0 10px; border:none; border-radius:999px;
        background:transparent; color:inherit; font:inherit; cursor:pointer; }
      #cc-edge-tab button:hover { background:rgba(0,0,0,.15); }
      .cc-vjudge-btn .cc-icon { color:#d97757; margin-right:4px; }
    `;
    document.head.appendChild(style);
  }

  function createIcon() {
    const i = document.createElement('span');
    i.className = 'cc-icon';
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  // 其它网站：贴在屏幕边缘，平时只露出图标，点图标展开/收起；按住拖动可换位置（拖到左半屏就贴左边）
  function createEdgeTab() {
    const tab = document.createElement('div');
    tab.id = 'cc-edge-tab';
    const handle = document.createElement('span');
    handle.className = 'cc-handle';
    handle.title = '点击展开 / 收起，按住拖动可调整位置';
    handle.setAttribute('role', 'button');
    handle.tabIndex = 0;
    handle.appendChild(createIcon());
    const toggle = () => tab.classList.toggle('cc-open');
    handle.addEventListener('click', toggle);
    handle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    // 点页面其它地方收起
    document.addEventListener('pointerdown', (e) => { if (!tab.contains(e.target)) tab.classList.remove('cc-open'); }, true);
    const mk = (label, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', () => { tab.classList.remove('cc-open'); fn(); });
      return b;
    };
    tab.append(handle, mk('问 Claude', '提取题面并发送给 Claude（Alt+Shift+C）。选中文字时只发送选中部分。', sendToClaude));
    // 洛谷、代码源页面自带“复制 Markdown”，不重复放按钮（快捷键 Alt+Shift+M 仍可用）
    if (!HAS_NATIVE_COPY) tab.append(mk('复制 MD', '复制题目 Markdown（Alt+Shift+M）', copyMarkdown));
    document.body.appendChild(tab);
    placeEdgeTab(tab, cfg('tabPos'));
    makeDraggable(tab);
    return tab;
  }

  // pos = { side: 'left' | 'right', top: 相对视口高度的比例 }
  function placeEdgeTab(tab, pos) {
    if (!pos) return;
    tab.classList.toggle('cc-left', pos.side === 'left');
    const max = Math.max(0, window.innerHeight - tab.offsetHeight - 4);
    tab.style.top = Math.min(max, Math.max(4, pos.top * window.innerHeight)) + 'px';
  }

  function makeDraggable(tab) {
    let justDragged = false;
    tab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const start = { x: e.clientX, y: e.clientY, offset: e.clientY - tab.getBoundingClientRect().top };
      let pos = null;
      // 监听 window 而不是标签本身：鼠标移动很快时会离开标签；也不用 setPointerCapture，否则按钮收不到 click
      const move = (ev) => {
        if (!pos && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
        tab.classList.add('cc-dragging');
        pos = { side: ev.clientX < window.innerWidth / 2 ? 'left' : 'right', top: (ev.clientY - start.offset) / window.innerHeight };
        placeEdgeTab(tab, pos);
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        tab.classList.remove('cc-dragging');
        if (!pos) return;
        GM_setValue('tabPos', { side: pos.side, top: parseFloat(tab.style.top) / window.innerHeight });
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 0);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
    // 拖动结束时松开鼠标会触发一次 click，吞掉它，避免误点按钮
    tab.addEventListener('click', (e) => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // Vjudge 左侧面板里的一行，样式沿用面板里的按钮
  function createSidebarRow() {
    const row = document.createElement('div');
    row.className = 'row cc-vjudge-row';
    const mk = (label, title, fn, withIcon) => {
      const col = document.createElement('div');
      col.className = 'col-6';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary cc-vjudge-btn';
      btn.title = title;
      if (withIcon) btn.appendChild(createIcon());
      btn.appendChild(document.createTextNode(label));
      btn.addEventListener('click', fn);
      col.appendChild(btn);
      return col;
    };
    row.append(
      mk('问 Claude', '提取题面并发送给 Claude（Alt+Shift+C）', sendToClaude, true),
      mk('复制 MD', '复制题目 Markdown（Alt+Shift+M）', copyMarkdown, false));
    return row;
  }

  function registerMenu() {
    GM_registerMenuCommand(`模式：${cfg('mode') === 'web' ? '网页版 claude.ai' : 'API'}（点击切换）`, () => {
      GM_setValue('mode', cfg('mode') === 'web' ? 'api' : 'web');
      alert('已切换为：' + (cfg('mode') === 'web' ? '网页版 claude.ai' : 'API') + '，刷新页面后菜单文字更新');
    });
    GM_registerMenuCommand(`网页版自动发送：${cfg('autoSend') ? '开' : '关'}（点击切换）`, () => {
      GM_setValue('autoSend', !cfg('autoSend'));
      alert('自动发送：' + (cfg('autoSend') ? '开' : '关'));
    });
    GM_registerMenuCommand('设置 API Key', () => {
      const v = prompt('Anthropic API Key（仅保存在本地油猴存储中）', cfg('apiKey'));
      if (v !== null) GM_setValue('apiKey', v.trim());
    });
    GM_registerMenuCommand(`Claude 项目：${cfg('projectUrl') || '无（claude.ai/new）'}`, () => {
      const v = prompt('Claude 项目链接（形如 https://claude.ai/project/xxxx），留空则不使用项目', cfg('projectUrl'));
      if (v === null) return;
      const url = v.trim();
      if (url && !/^https:\/\/claude\.ai\/project\/[\w-]+\/?$/.test(url)) { alert('链接格式不对'); return; }
      GM_setValue('projectUrl', url);
    });
    GM_registerMenuCommand(`Vjudge 侧边栏按钮：${cfg('vjudgeSidebar') ? '显示' : '隐藏'}（点击切换）`, () => {
      GM_setValue('vjudgeSidebar', !cfg('vjudgeSidebar'));
      toast('Vjudge 侧边栏按钮：' + (cfg('vjudgeSidebar') ? '显示' : '隐藏'));
    });
    GM_registerMenuCommand(`API 模型：${cfg('model')}`, () => {
      const v = prompt('模型 ID', cfg('model'));
      if (v) GM_setValue('model', v.trim());
    });
    GM_registerMenuCommand('复制题目 Markdown', copyMarkdown);
    if (isVjudge) {
      GM_registerMenuCommand('调试：复制 Vjudge 描述页源码', async () => {
        const frame = findDescFrame();
        if (!frame) { toast('没找到题面 iframe'); return; }
        const html = await (await fetch(frameUrl(frame), { credentials: 'include' })).text();
        const all = descFrames().map((f) => `${f === frame ? '* ' : '  '}${frameUrl(f)}${frameUrl(f) !== f.src ? `（src 属性：${f.src}）` : ''}${isVisible(f) ? '' : '（隐藏）'}`).join('\n');
        const activeKey = document.querySelector('#prob-descs .active[data-key]')?.dataset.key || '无';
        copyText(`当前选中的题面 key：${activeKey}\n所有题面 iframe（* 为本次使用的）：\n${all}\n\n${html.slice(0, 30000)}`, 'text');
        toast('已复制描述页源码（前 3 万字符）');
      });
    }
    if (!isVjudge) {
      GM_registerMenuCommand('调试：复制页面信息', debugPageInfo);
    }
    GM_registerMenuCommand('重置悬浮标签位置', () => {
      GM_deleteValue('tabPos');
      edgeTab.classList.remove('cc-left');
      edgeTab.style.top = '';
    });
  }

  // 调试：收集页面信息。每一步单独 try，出错也照样输出；结果同时显示在面板里，剪贴板失败时可以手动复制
  async function debugPageInfo() {
    const parts = [location.href, '脚本版本：' + (typeof GM_info !== 'undefined' ? GM_info.script?.version : '?')];
    const step = (label, fn) => {
      try { parts.push(`${label}：${fn()}`); } catch (e) { parts.push(`${label}：出错 ${e && e.stack || e}`); }
    };
    step('UiContext 字段', () => { const ui = unsafeWindow.UiContext; return ui ? Object.keys(ui).join(', ') : '无'; });
    step('pdoc 字段', () => { const p = unsafeWindow.UiContext?.pdoc; return p ? Object.keys(p).join(', ') : '无'; });
    step('pdoc.content 开头', () => String(unsafeWindow.UiContext?.pdoc?.content ?? '无').slice(0, 300));
    step('题面提取', () => '见下方');
    try {
      const p = await extractProblem();
      parts.push(p ? `  标题：${p.title}\n  题面开头：${String(p.statement).slice(0, 300)}` : '  返回空');
    } catch (e) { parts.push('  出错 ' + (e && e.stack || e)); }
    let html = '';
    step('正文元素', () => {
      const main = document.querySelector('.problem-content, [data-fragment-id="problem-description"], main, #main, .main, article') || document.body;
      const clone = main.cloneNode(true);
      clone.querySelectorAll('script, style, svg, #cc-edge-tab').forEach((e) => e.remove());
      html = clone.outerHTML.slice(0, 30000);
      return `<${main.tagName.toLowerCase()} id="${main.id}" class="${String(main.className)}">`;
    });
    const text = parts.join('\n') + '\n\n' + html;
    console.log('[Contest→Claude] 调试信息\n' + text);
    showPanel(text);
    toast(await copyText(text) ? '已复制页面信息；也可以在面板里点「复制全部」' : '复制失败，请在面板里手动复制');
  }

  async function copyMarkdown() {
    const msg = await buildMessage();
    if (!msg) return;
    if (!(await copyText(msg.text))) { showPanel(msg.text); toast('复制失败，请在面板里手动复制'); return; }
    toast(msg.pdfUrl ? '本题只有 PDF 题面，已复制标题和 PDF 链接' : '已复制题目 Markdown');
  }

  // 写剪贴板。有的 OJ 会监听 copy 事件拦截或改写复制内容，GM_setClipboard 可能因此失效，所以：
  // 1. 优先用 navigator.clipboard（不触发页面的 copy 事件）
  // 2. 再用 execCommand('copy')，由脚本开头抢先注册的 copy 监听器写入我们的内容
  // 3. 最后才用 GM_setClipboard
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) { /* 页面没有焦点等情况会失败 */ }
    const ta = document.createElement('textarea');
    try {
      pendingCopy = text; // 由开头注册的 copy 监听器写入，网站拦不到
      ta.value = text;
      Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0' });
      document.body.appendChild(ta);
      ta.select();
      if (document.execCommand('copy')) return true;
    } catch (_) { /* ignore */ } finally {
      pendingCopy = null;
      ta.remove();
    }
    try {
      GM_setClipboard(text, 'text');
      return true;
    } catch (_) {
      return false;
    }
  }

  let sending = false;
  async function sendToClaude() {
    if (sending) return; // 下载 PDF 要一会儿，防止连点发两次
    sending = true;
    try { await doSendToClaude(); } finally { sending = false; }
  }

  async function doSendToClaude() {
    const msg = await buildMessage();
    if (!msg) return;
    copyText(msg.text); // 兜底：自动填入失败时可直接粘贴
    let pdf = null;
    if (msg.pdfUrls) {
      toast('本题只有 PDF 题面，正在下载 PDF…');
      // 依次尝试候选地址，只接受真正的 PDF 文件（以 %PDF 开头），避免把网页当 PDF 上传
      const errors = [];
      for (const url of msg.pdfUrls) {
        try {
          pdf = { name: msg.pdfName, data: await fetchPdfBase64(url) };
          if (!msg.pdfUrl) msg.text = msg.text.replace(/题面见 PDF：.*$/, `题面见 PDF：${url}`);
          console.info('[Contest→Claude] PDF 来自', url);
          break;
        } catch (e) {
          errors.push(`${url} → ${e.message}`);
        }
      }
      if (!pdf) {
        console.error('[Contest→Claude] PDF 下载失败\n' + errors.join('\n'));
        toast('PDF 下载失败（详情见控制台），只发送标题和链接');
      }
    }
    if (cfg('mode') === 'api') {
      askApi(msg.text, pdf);
    } else {
      GM_setValue(PENDING_KEY, { prompt: msg.text, pdf, autoSend: cfg('autoSend'), ts: Date.now() });
      GM_openInTab(cfg('projectUrl') || 'https://claude.ai/new', { active: true, insert: true });
      toast(pdf ? '已打开 claude.ai，PDF 会作为附件上传' : '已打开 claude.ai（题面也已复制到剪贴板）');
    }
  }

  // 只发送题目本身（标题、链接、题面），不附加任何提示词——提示词由 Claude 项目的自定义指令提供。
  // 返回 { text, pdfUrl?, pdfName? }；只有 PDF 题面时 text 只含标题和链接，PDF 作为附件发送。
  async function buildMessage() {
    const sel = String(window.getSelection() || '').trim();
    let problem;
    if (sel.length > 20) {
      problem = { title: document.title, statement: sel };
    } else {
      try { problem = await extractProblem(); } catch (e) { console.error('[Contest→Claude]', e); }
    }
    if (problem?.pdfUrl) {
      const title = problem.title.trim();
      return {
        text: `# ${title}\n\n${location.href}\n\n题面见 PDF：${problem.pdfUrl}`,
        pdfUrl: problem.pdfUrl,
        pdfUrls: problem.pdfUrls,
        pdfName: title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) + '.pdf',
      };
    }
    if (!problem || !problem.statement.trim()) {
      toast('没能识别题面，请先选中题目文字再点按钮');
      return null;
    }
    return { text: `# ${problem.title.trim()}\n\n${location.href}\n\n${normalizeMath(problem.statement.trim())}` };
  }

  // 下载文件并转成 base64。同源用 fetch；跨域（比如 PDF 放在 CDN 上）用 GM_xmlhttpRequest
  async function fetchPdfBase64(url) {
    let buf;
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      buf = await res.arrayBuffer();
    } catch (_) {
      buf = await new Promise((resolve, reject) => GM_xmlhttpRequest({
        method: 'GET', url, responseType: 'arraybuffer',
        onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.response) : reject(new Error('HTTP ' + r.status))),
        onerror: reject, ontimeout: reject,
      }));
    }
    const bytes = new Uint8Array(buf);
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') {
      throw new Error('返回的不是 PDF：' + new TextDecoder().decode(bytes.subarray(0, 60)).replace(/\s+/g, ' '));
    }
    if (bytes.length > 30 * 1024 * 1024) throw new Error('PDF 超过 30MB');
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // 统一公式定界符（代码块内不动）：Codeforces 原始题面用 $$$x$$$ 和 $$$$$$x$$$$$$
  // （Vjudge 上的 CF 题会原样带出来），也有题面用 \( \) 和 \[ \]
  function normalizeMath(md) {
    const inline = (_, t) => '$' + t.trim() + '$';
    const display = (_, t) => '\n$$' + t.trim() + '$$\n';
    return md.split(/(```[\s\S]*?```)/).map((part, i) => (i % 2 ? part : part
      .replace(/\${6}([\s\S]+?)\${6}/g, display)
      .replace(/\${3}([\s\S]+?)\${3}/g, inline)
      .replace(/\\\[([\s\S]+?)\\\]/g, display)
      .replace(/\\\(([\s\S]+?)\\\)/g, inline)
      .replace(/\n{3,}/g, '\n\n'))).join('');
  }

  // ---------------------------------------------------------------------------
  // 各网站题面提取
  // ---------------------------------------------------------------------------
  function extractProblem() {
    const host = location.hostname;
    if (/codeforc/.test(host)) return extractCodeforces();
    if (host === 'atcoder.jp') return extractAtCoder();
    if (host === 'www.luogu.com.cn') return extractLuogu();
    if (/leetcode\./.test(host)) return extractLeetCode();
    if (host === 'vjudge.net') return extractVjudge();
    if (host === 'newoj.daimayuan.top') return extractHydro();
    return null;
  }

  // 代码源 newoj（Hydro 系统）：优先读 UiContext.pdoc 里的原始 Markdown，读不到就读页面 DOM
  function extractHydro() {
    let pdoc = null;
    try { pdoc = unsafeWindow.UiContext?.pdoc; } catch (_) { /* ignore */ }
    let statement = '';
    let content = pdoc?.content;
    if (typeof content === 'string') {
      // 多语言题面存成 {"zh": "...", "en": "..."} 的 JSON 字符串
      try {
        const obj = JSON.parse(content);
        if (obj && typeof obj === 'object') content = obj.zh || obj.en || Object.values(obj)[0];
      } catch (_) { /* 普通 Markdown */ }
      statement = typeof content === 'string' ? content : '';
    }
    if (!statement) {
      const el = document.querySelector('.problem-content, [data-fragment-id="problem-description"]');
      if (el) statement = htmlToMarkdown(el);
    }
    const c = pdoc?.config;
    const limits = c && typeof c === 'object' && (c.timeMax || c.memoryMax)
      ? `时间限制：${c.timeMax ?? '?'} ms，内存限制：${c.memoryMax ?? '?'} MB\n\n` : '';
    const title = pdoc?.title
      ? `${pdoc.pid || pdoc.docId || ''} ${pdoc.title}`
      : (document.querySelector('.section__title, h1')?.textContent || document.title);
    return { title, statement: statement ? limits + statement : '' };
  }

  // Vjudge 切换题目时，旧题目的题面 iframe 可能还留在页面里（只是隐藏了），不能直接取第一个。
  // 优先取地址里带左侧面板当前选中题面 key 的那个，其次取可见的那个。
  function descFrames() {
    return [...document.querySelectorAll('iframe#frame-description, iframe[src*="/problem/description/"]')];
  }
  function isVisible(el) {
    return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  // iframe 实际加载的地址：页面可能直接让 iframe 跳转而不改 src 属性，所以优先读 contentWindow.location
  function frameUrl(f) {
    try {
      const href = f.contentWindow?.location.href;
      if (href && href !== 'about:blank') return href;
    } catch (_) { /* 跨域时读不到 */ }
    return f.src;
  }
  function findDescFrame() {
    const frames = descFrames().filter((f) => frameUrl(f));
    const key = document.querySelector('#prob-descs .active[data-key]')?.dataset.key;
    return (key && frames.find((f) => frameUrl(f).includes(`/problem/description/${key}`)))
      || frames.find(isVisible)
      || frames[0] || null;
  }

  // Vjudge：题面在 iframe（/problem/description/...）里，同源，直接重新请求一份解析。
  // 描述页里通常有一个 JSON（textarea.data-json-container），按 section 存着原始题面；没有就读 DOM。
  async function extractVjudge() {
    const frame = findDescFrame();
    if (!frame) return null;
    const src = frameUrl(frame);
    const html = await (await fetch(src, { credentials: 'include' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    let statement = '';
    let pdfUrl = null;
    const jsonText = doc.querySelector('textarea.data-json-container')?.value || '';
    let data = null;
    try { data = JSON.parse(jsonText || 'null'); } catch (_) { /* ignore */ }
    // JSON 结构不固定，递归找所有带 content 字符串的节点（通常是 sections[].value.content）
    const sections = [];
    (function walk(node, title) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach((n) => walk(n, '')); return; }
      const v = node.value && typeof node.value === 'object' ? node.value : node;
      if (typeof v.content === 'string') { sections.push({ title: node.title || title || '', format: v.format || '', content: v.content }); return; }
      Object.values(node).forEach((n) => walk(n, node.title));
    })(data, '');
    statement = sections.map((sec) => {
      let body = sec.content;
      if (/pdf/i.test(sec.format)) { pdfUrl = pdfUrl || findPdfUrl(body) || 'pdf'; return ''; }
      if (!/^(md|markdown)$/i.test(sec.format)) {
        const div = doc.createElement('div');
        div.innerHTML = body;
        body = htmlToMarkdown(div);
      }
      return body.trim() ? (sec.title ? `## ${sec.title}\n\n` : '') + body.trim() : '';
    }).filter(Boolean).join('\n\n');

    const plainLen = (t) => t.replace(/^#+ .*$/gm, '').replace(/\s/g, '').length;
    if (plainLen(statement) < 80) {
      // 兜底 1：描述页正文（去掉存数据的 textarea）
      const body = doc.body.cloneNode(true);
      body.querySelectorAll('textarea, script, style').forEach((e) => e.remove());
      const fromBody = htmlToMarkdown(body);
      if (plainLen(fromBody) > plainLen(statement)) statement = fromBody;
    }
    if (plainLen(statement) < 80 && jsonText && !data) {
      // 兜底 2：textarea 里不是 JSON，当成 HTML
      const div = doc.createElement('div');
      div.innerHTML = jsonText;
      const fromText = htmlToMarkdown(div);
      if (plainLen(fromText) > plainLen(statement)) statement = fromText;
    }

    // 只有 PDF 的题：正文几乎没有文字，并且描述页里确实有 PDF 的迹象（PDF 格式的 section、PDF 链接或嵌入的查看器）。
    // 左侧面板的 PDF 按钮每道题都有，只能当下载地址，不能当判断依据。
    // Vjudge 的 PDF 题面在内容里写成 [pdf:CDN_BASE_URL/<hash>?<n>]，CDN_BASE_URL 是占位符
    let pdfUrls = null;
    let pdfLink = null;
    const raw = html + '\n' + jsonText;
    const marker = raw.match(/\[pdf:([^\]\s]+)\]/i)?.[1];
    const markerUrls = !marker ? [] : /^CDN_BASE_URL/.test(marker)
      ? cdnBases().map((base) => marker.replace(/^CDN_BASE_URL\/*/, base + '/'))
      : [marker];
    const descPdf = findPdfUrl(raw);
    const looksPdf = marker || pdfUrl || descPdf || doc.querySelector('iframe, embed, object');
    if (looksPdf && plainLen(statement.replace(/\[pdf:[^\]]*\]/gi, '')) < 80) {
      const panelPdf = document.querySelector('#btn-contest-problem-pdf, a[href*="problemPdf"]')?.getAttribute('href');
      const abs = (u) => new URL(u, src).href;
      // 下载顺序：原始 PDF（CDN）优先，左侧面板的 PDF 按钮兜底；发给 Claude 的文字里用面板链接（能直接在浏览器打开）
      pdfUrls = [...new Set([pdfUrl !== 'pdf' && pdfUrl, ...markerUrls, descPdf, panelPdf].filter(Boolean).map(abs))];
      if (!pdfUrls.length) pdfUrls = null;
      pdfLink = panelPdf ? abs(panelPdf) : pdfUrls?.[0];
    }

    // 标题：先试已知的 id，再找形如“A - MST in Modulo Graph”的标题元素
    const titleEl = document.querySelector('#problem-title, #prob-title h2, #prob-title, .problem-title')
      || [...document.querySelectorAll('h1, h2, h3')].find((h) => /^\s*[A-Z]\d*\s+-\s+\S/.test(h.textContent));
    const title = (titleEl?.textContent || document.title).replace(/\s+/g, ' ');
    // 题目页 / 比赛页上方的时空限制等信息
    const props = [...document.querySelectorAll('#prob-properties dt')]
      .map((dt) => `${dt.textContent.trim()}：${dt.nextElementSibling?.textContent.trim() || ''}`);
    return { title, statement: (props.length ? props.join('\n') + '\n\n' : '') + statement, pdfUrl: pdfLink, pdfUrls };
  }

  // Vjudge 的 CDN 地址：页面里引用 cdn.vjudge.* 的资源（比如头像）的域名，再加上已知的两个
  function cdnBases() {
    const bases = [];
    try { if (typeof unsafeWindow.CDN_BASE_URL === 'string') bases.push(unsafeWindow.CDN_BASE_URL); } catch (_) { /* ignore */ }
    for (const el of document.querySelectorAll('img[src*="cdn."], script[src*="cdn."], link[href*="cdn."]')) {
      const m = (el.src || el.href || '').match(/^https?:\/\/cdn\.vjudge\.[^/]+/);
      if (m) bases.push(m[0]);
    }
    bases.push('https://cdn.vjudge.net.cn', 'https://cdn.vjudge.net');
    return [...new Set(bases.map((b) => b.replace(/\/+$/, '')))];
  }

  // 在 HTML / JSON 文本里找 PDF 地址：pdf.js 查看器的 ?file= 参数，或以 .pdf 结尾的链接
  function findPdfUrl(text) {
    if (!text) return null;
    text = text.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    const viewer = text.match(/viewer\.html\?(?:[^"'\\\s<>]*&)?file=([^"'&\\\s<>]+)/);
    if (viewer) return decodeURIComponent(viewer[1]);
    const direct = text.match(/(?:https?:)?[^"'\\\s<>()]*\.pdf(?:\?[^"'\\\s<>()]*)?/i);
    return direct ? direct[0] : null;
  }

  function extractCodeforces() {
    const el = document.querySelector('.problem-statement');
    if (!el) return null;
    const title = el.querySelector('.header .title')?.textContent || document.title;
    return { title, statement: htmlToMarkdown(el) };
  }

  function extractAtCoder() {
    const root = document.querySelector('#task-statement');
    if (!root) return null;
    const el = root.querySelector('.lang-en') || root.querySelector('.lang-ja') || root;
    const title = document.querySelector('span.h2')?.childNodes[0]?.textContent || document.title;
    const limits = [...document.querySelectorAll('#main-container p')]
      .map((p) => p.textContent.trim())
      .find((t) => /Time Limit|実行時間制限/.test(t));
    return { title, statement: (limits ? limits + '\n\n' : '') + htmlToMarkdown(el) };
  }

  function extractLuogu() {
    // 新版洛谷：题目数据以 JSON 形式放在 #lentille-context 中（原始 Markdown，最干净）
    let p = null;
    try {
      const ctx = document.getElementById('lentille-context');
      if (ctx) p = JSON.parse(ctx.textContent)?.data?.problem;
    } catch (_) { /* ignore */ }
    // 旧版洛谷
    if (!p) {
      try { p = unsafeWindow._feInjection?.currentData?.problem; } catch (_) { /* ignore */ }
    }
    if (p) {
      const c = p.contenu || p.content || p;
      const parts = [];
      const sec = (name, text) => { if (text && String(text).trim()) parts.push(`## ${name}\n\n${String(text).trim()}`); };
      if (p.limits) {
        const t = p.limits.time?.[0], m = p.limits.memory?.[0];
        if (t || m) parts.push(`时间限制：${t ? t / 1000 + ' s' : '?'}，内存限制：${m ? m / 1024 + ' MB' : '?'}`);
      }
      sec('题目背景', c.background);
      sec('题目描述', c.description);
      sec('输入格式', c.formatI || c.inputFormat);
      sec('输出格式', c.formatO || c.outputFormat);
      (p.samples || []).forEach(([i, o], idx) => {
        parts.push(`## 样例 ${idx + 1}\n\n输入：\n\`\`\`\n${i}\n\`\`\`\n输出：\n\`\`\`\n${o}\n\`\`\``);
      });
      sec('说明/提示', c.hint);
      if (parts.length) return { title: `${p.pid || ''} ${c.name || p.title || ''}`, statement: parts.join('\n\n') };
    }
    // 兜底：直接读 DOM
    const el = document.querySelector('.problem-card, article, .main-container');
    if (!el) return null;
    return { title: document.title, statement: htmlToMarkdown(el) };
  }

  function extractLeetCode() {
    const el = document.querySelector('[data-track-load="description_content"]')
      || document.querySelector('.elfjS')
      || document.querySelector('[data-cy="question-content"]');
    if (!el) return null;
    const title = document.title.replace(/\s*[-|]\s*(LeetCode|力扣).*$/i, '');
    return { title, statement: htmlToMarkdown(el) };
  }

  // ---------------------------------------------------------------------------
  // HTML → Markdown（保留公式源码、样例代码块）
  // ---------------------------------------------------------------------------
  function htmlToMarkdown(source) {
    const root = source.cloneNode(true);

    // KaTeX（AtCoder 等）：用 annotation 里的 TeX 源码替换渲染结果
    root.querySelectorAll('.katex-display, .katex').forEach((k) => {
      if (!root.contains(k)) return; // 外层 .katex-display 已被替换
      const ann = k.querySelector('annotation[encoding="application/x-tex"]');
      if (!ann) return;
      const display = k.classList.contains('katex-display');
      k.replaceWith(document.createTextNode(display ? `\n$$${ann.textContent}$$\n` : `$${ann.textContent}$`));
    });
    // MathJax 2（Codeforces）：源码在 <script type="math/tex"> 中
    root.querySelectorAll('.MathJax_Preview, .MathJax, .MathJax_Display, .MJX_Assistive_MathML, .MathJax_SVG, .MathJax_CHTML')
      .forEach((e) => e.remove());
    root.querySelectorAll('script[type^="math/tex"]').forEach((s) => {
      const display = /mode=display/.test(s.type);
      s.replaceWith(document.createTextNode(display ? `\n$$${s.textContent}$$\n` : `$${s.textContent}$`));
    });
    // 去掉复制按钮等噪音
    root.querySelectorAll('script, style, button, .btn-copy, .div-btn-copy, .input-output-copier, .source-code-for-copy')
      .forEach((e) => e.remove());

    const md = nodeToMd(root);
    // 只整理代码块以外的空白
    return md.split(/(```[\s\S]*?```)/).map((part, i) => i % 2 ? part : part
      .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
      .replace(/\n{3,}/g, '\n\n')).join('').trim();
  }

  const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE',
    'CENTER', 'DL', 'DT', 'DD', 'HEADER', 'FIGURE', 'HR']);

  function nodeToMd(node) {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) { out += n.textContent.replace(/\s+/g, ' '); continue; }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = n.tagName;
      if (tag === 'PRE') { out += '\n```\n' + preText(n).replace(/\n+$/, '') + '\n```\n'; continue; }
      if (tag === 'BR') { out += '\n'; continue; }
      if (tag === 'IMG') { out += `![](${n.src})`; continue; }
      if (/^H[1-6]$/.test(tag)) { out += `\n\n${'#'.repeat(+tag[1] + 1)} ${nodeToMd(n).trim()}\n\n`; continue; }
      if (tag === 'LI') { out += '\n- ' + nodeToMd(n).trim() + '\n'; continue; }
      if (tag === 'CODE') { out += '`' + n.textContent + '`'; continue; }
      if (tag === 'STRONG' || tag === 'B') { const t = nodeToMd(n).trim(); out += t ? ` **${t}** ` : ''; continue; }
      if (tag === 'TABLE') { out += '\n\n' + tableToMd(n) + '\n\n'; continue; }
      const inner = nodeToMd(n);
      out += BLOCK_TAGS.has(tag) ? '\n' + inner + '\n' : inner;
    }
    return out;
  }

  // 表格：样例表格（单元格里是 <pre>，如 Vjudge 的 vjudge_sample）展开成“标题 + 代码块”，普通表格转成 Markdown 表格
  function tableToMd(table) {
    const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table);
    const cellsOf = (tr) => [...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
    if (!rows.length) return '';
    if (table.querySelector('pre')) {
      const first = cellsOf(rows[0]);
      const header = first.every((c) => !c.querySelector('pre')) ? first.map((c) => nodeToMd(c).trim()) : null;
      const body = header ? rows.slice(1) : rows;
      return body.map((tr, i) => cellsOf(tr).map((c, j) => {
        const label = [header?.[j], body.length > 1 ? `#${i + 1}` : ''].filter(Boolean).join(' ');
        return (label ? `**${label}**\n` : '') + nodeToMd(c).trim();
      }).join('\n\n')).join('\n\n');
    }
    const lines = rows.map((tr) => '| ' + cellsOf(tr)
      .map((c) => nodeToMd(c).trim().replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|')).join(' | ') + ' |');
    lines.splice(1, 0, '|' + ' --- |'.repeat(Math.max(1, cellsOf(rows[0]).length)));
    return lines.join('\n');
  }

  // <pre> 内的文本：Codeforces 样例每行是一个 div，需要换行
  function preText(pre) {
    let out = '';
    (function walk(node) {
      for (const n of node.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) out += n.textContent;
        else if (n.tagName === 'BR') out += '\n';
        else if (n.nodeType === Node.ELEMENT_NODE) {
          walk(n);
          if (n.tagName === 'DIV' && !out.endsWith('\n')) out += '\n';
        }
      }
    })(pre);
    return out;
  }

  // ---------------------------------------------------------------------------
  // API 模式
  // ---------------------------------------------------------------------------
  function askApi(promptText, pdf) {
    const key = cfg('apiKey');
    if (!key) {
      alert('API 模式需要先在油猴菜单里「设置 API Key」');
      return;
    }
    const panel = showPanel('Claude 正在思考…（可能需要一两分钟）');
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      data: JSON.stringify({
        model: cfg('model'),
        max_tokens: cfg('maxTokens'),
        messages: [{
          role: 'user',
          content: pdf
            ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.data } }, { type: 'text', text: promptText }]
            : promptText,
        }],
      }),
      timeout: 10 * 60 * 1000,
      onload: (res) => {
        let data;
        try { data = JSON.parse(res.responseText); } catch (_) { panel.set('解析响应失败：\n' + res.responseText); return; }
        if (data.error) { panel.set(`API 错误（${res.status}）：${data.error.message}`); return; }
        const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        panel.set(text || '（空响应）');
      },
      onerror: () => panel.set('网络错误，请检查网络或代理'),
      ontimeout: () => panel.set('请求超时'),
    });
  }

  function showPanel(initial) {
    document.getElementById('claude-contest-panel')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'claude-contest-panel';
    Object.assign(wrap.style, {
      position: 'fixed', right: '20px', bottom: '70px', width: 'min(640px, calc(100vw - 40px))',
      height: 'min(70vh, 720px)', zIndex: 2147483647, background: '#fff', color: '#222',
      border: '1px solid #ddd', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,.3)',
      display: 'flex', flexDirection: 'column', font: '14px/1.5 system-ui, sans-serif',
    });
    const bar = document.createElement('div');
    Object.assign(bar.style, { display: 'flex', gap: '8px', padding: '8px 12px', borderBottom: '1px solid #eee', alignItems: 'center' });
    const title = document.createElement('strong');
    title.textContent = 'Claude';
    title.style.flex = '1';
    const mkBtn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, { padding: '4px 10px', border: '1px solid #ccc', borderRadius: '6px', background: '#f7f7f7', cursor: 'pointer' });
      b.addEventListener('click', fn);
      return b;
    };
    const body = document.createElement('pre');
    Object.assign(body.style, { flex: '1', margin: 0, padding: '12px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', font: '13px/1.55 ui-monospace, Consolas, monospace' });
    body.textContent = initial;
    bar.append(
      title,
      mkBtn('复制代码', () => {
        const blocks = [...body.textContent.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
        if (!blocks.length) { toast('没有找到代码块'); return; }
        copyText(blocks[blocks.length - 1][1]);
        toast('已复制最后一个代码块');
      }),
      mkBtn('复制全部', async () => toast(await copyText(body.textContent) ? '已复制' : '复制失败，请手动选中复制')),
      mkBtn('关闭', () => wrap.remove()),
    );
    wrap.append(bar, body);
    document.body.appendChild(wrap);
    return { set: (t) => { body.textContent = t; } };
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', left: '50%', top: '24px', transform: 'translateX(-50%)', zIndex: 2147483647,
      background: 'rgba(0,0,0,.8)', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontSize: '14px',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // ---------------------------------------------------------------------------
  // claude.ai 端实现
  // ---------------------------------------------------------------------------
  function runOnClaude() {
    // 只在“新对话”页面（/new 或项目首页）填入
    if (!/^\/(new|project\/[\w-]+\/?$)/.test(location.pathname)) return;
    const data = GM_getValue(PENDING_KEY);
    if (!data || Date.now() - data.ts > PENDING_TTL) return;
    GM_deleteValue(PENDING_KEY); // 只消费一次，避免其它标签页重复填入

    waitFor(() => document.querySelector('div[contenteditable="true"]'), 20000).then(async (editor) => {
      if (!editor) { console.warn('[Contest→Claude] 没找到输入框，提示词已在剪贴板中，可手动粘贴'); return; }
      // 页面刚加载完时输入框可能还会被重新渲染一次（会清掉已加的附件），先等它稳定
      await sleep(1500);
      editor = document.querySelector('div[contenteditable="true"]') || editor;
      editor.focus();
      // claude.ai 会保存未发送的草稿，打开时输入框里可能还有上次的文字，先清空
      if (editor.textContent.trim()) {
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
      }
      // ProseMirror 能正确处理 insertText；失败则模拟粘贴
      const ok = document.execCommand('insertText', false, data.prompt);
      if (!ok || !editor.textContent.trim()) {
        const dt = new DataTransfer();
        dt.setData('text/plain', data.prompt);
        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }
      if (data.pdf) attachPdf(editor, data.pdf);
      if (!data.autoSend) return;
      const sendBtn = await waitFor(() => {
        const b = document.querySelector('button[aria-label="Send message"], button[aria-label="Send Message"], button[aria-label="发送消息"]');
        return b && !b.disabled ? b : null;
      }, 30000);
      if (sendBtn) sendBtn.click();
    });
  }

  // 上传 PDF 附件：模拟粘贴文件（实测在 claude.ai 上有效）。
  // 不再做“上传成功”检测和换方式重试——附件里不一定显示文件名，检测不可靠，反而会重复上传。
  function attachPdf(editor, pdf) {
    const bin = atob(pdf.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], pdf.name || 'problem.pdf', { type: 'application/pdf' }));
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function waitFor(fn, timeout) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function tick() {
        const v = fn();
        if (v) return resolve(v);
        if (Date.now() - start > timeout) return resolve(null);
        setTimeout(tick, 300);
      })();
    });
  }
})();
