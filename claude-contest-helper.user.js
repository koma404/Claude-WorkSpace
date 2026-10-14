// ==UserScript==
// @name         Contest → Claude 一键解题
// @namespace    https://github.com/koma404/claude-workspace
// @version      0.5.0
// @description  在 Codeforces / AtCoder / 洛谷 / LeetCode / Vjudge / 代码源 题目页面一键提取题面，发送给 Claude（网页版或 API）
// @author       koma404
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
// @run-at       document-idle
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
  const ICON_URL = 'data:image/png;base64,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';
  const isVjudge = location.hostname === 'vjudge.net';

  registerMenu();
  injectStyle();
  const edgeTab = createEdgeTab();
  let sidebarRow = null;
  syncUi();
  window.addEventListener('hashchange', syncUi);
  window.addEventListener('popstate', syncUi);
  window.addEventListener('resize', () => placeEdgeTab(edgeTab, cfg('tabPos')));
  setInterval(syncUi, 500);
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey || !isProblemPage()) return;
    if (e.code === 'KeyC') { e.preventDefault(); sendToClaude(); }
    if (e.code === 'KeyM') { e.preventDefault(); copyMarkdown(); }
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
      #cc-edge-tab:hover, #cc-edge-tab:focus-within, #cc-edge-tab.cc-dragging { transform:translateX(0); }
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

  // 其它网站：贴在屏幕边缘，平时只露出图标，鼠标移上去展开；按住拖动可换位置（拖到左半屏就贴左边）
  function createEdgeTab() {
    const tab = document.createElement('div');
    tab.id = 'cc-edge-tab';
    const handle = document.createElement('span');
    handle.className = 'cc-handle';
    handle.title = '按住拖动可调整位置';
    handle.appendChild(createIcon());
    const mk = (label, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    tab.append(handle,
      mk('问 Claude', '提取题面并发送给 Claude（Alt+Shift+C）。选中文字时只发送选中部分。', sendToClaude),
      mk('复制 MD', '复制题目 Markdown（Alt+Shift+M）', copyMarkdown));
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
    GM_registerMenuCommand('重置悬浮标签位置', () => {
      GM_deleteValue('tabPos');
      edgeTab.classList.remove('cc-left');
      edgeTab.style.top = '';
    });
  }

  async function copyMarkdown() {
    const md = await buildMessage();
    if (md) { GM_setClipboard(md, 'text'); toast('已复制题目 Markdown'); }
  }

  async function sendToClaude() {
    const message = await buildMessage();
    if (!message) return;
    GM_setClipboard(message, 'text'); // 兜底：自动填入失败时可直接粘贴
    if (cfg('mode') === 'api') {
      askApi(message);
    } else {
      GM_setValue(PENDING_KEY, { prompt: message, autoSend: cfg('autoSend'), ts: Date.now() });
      GM_openInTab(cfg('projectUrl') || 'https://claude.ai/new', { active: true, insert: true });
      toast('已打开 claude.ai（题面也已复制到剪贴板）');
    }
  }

  // 只发送题目本身（标题、链接、题面），不附加任何提示词——提示词由 Claude 项目的自定义指令提供
  async function buildMessage() {
    const sel = String(window.getSelection() || '').trim();
    let problem;
    if (sel.length > 20) {
      problem = { title: document.title, statement: sel };
    } else {
      try { problem = await extractProblem(); } catch (e) { console.error('[Contest→Claude]', e); }
    }
    if (!problem || !problem.statement.trim()) {
      toast('没能识别题面，请先选中题目文字再点按钮');
      return null;
    }
    return `# ${problem.title.trim()}\n\n${location.href}\n\n${normalizeMath(problem.statement.trim())}`;
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

  // Vjudge：题面在 iframe（/problem/description/...）里，同源，直接重新请求一份解析。
  // 描述页里通常有一个 JSON（textarea.data-json-container），按 section 存着原始题面；没有就读 DOM。
  async function extractVjudge() {
    const frame = document.querySelector('iframe#frame-description, iframe[src*="/problem/description/"]');
    if (!frame || !frame.getAttribute('src')) return null;
    const html = await (await fetch(frame.src, { credentials: 'include' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    let statement = '';
    try {
      const data = JSON.parse(doc.querySelector('textarea.data-json-container')?.value || 'null');
      statement = (data?.sections || []).map((s) => {
        const v = s.value || {};
        let body = v.content || '';
        if (v.format !== 'MD') {
          const div = doc.createElement('div');
          div.innerHTML = body;
          body = htmlToMarkdown(div);
        }
        return (s.title ? `## ${s.title}\n\n` : '') + body.trim();
      }).filter(Boolean).join('\n\n');
    } catch (_) { /* ignore */ }
    if (!statement) statement = htmlToMarkdown(doc.body);

    // 标题：先试已知的 id，再找形如“A - MST in Modulo Graph”的标题元素
    const titleEl = document.querySelector('#problem-title, #prob-title h2, #prob-title, .problem-title')
      || [...document.querySelectorAll('h1, h2, h3')].find((h) => /^\s*[A-Z]\d*\s+-\s+\S/.test(h.textContent));
    const title = (titleEl?.textContent || document.title).replace(/\s+/g, ' ');
    // 题目页 / 比赛页上方的时空限制等信息
    const props = [...document.querySelectorAll('#prob-properties dt')]
      .map((dt) => `${dt.textContent.trim()}：${dt.nextElementSibling?.textContent.trim() || ''}`);
    return { title, statement: (props.length ? props.join('\n') + '\n\n' : '') + statement };
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
      if (tag === 'TR') { out += '\n|' + nodeToMd(n) + '\n'; continue; }
      if (tag === 'TD' || tag === 'TH') { out += ' ' + nodeToMd(n).trim() + ' |'; continue; }
      const inner = nodeToMd(n);
      out += BLOCK_TAGS.has(tag) ? '\n' + inner + '\n' : inner;
    }
    return out;
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
  function askApi(promptText) {
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
        messages: [{ role: 'user', content: promptText }],
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
        GM_setClipboard(blocks[blocks.length - 1][1], 'text');
        toast('已复制最后一个代码块');
      }),
      mkBtn('复制全部', () => { GM_setClipboard(body.textContent, 'text'); toast('已复制'); }),
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
      editor.focus();
      // ProseMirror 能正确处理 insertText；失败则模拟粘贴
      const ok = document.execCommand('insertText', false, data.prompt);
      if (!ok || !editor.textContent.trim()) {
        const dt = new DataTransfer();
        dt.setData('text/plain', data.prompt);
        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }
      if (!data.autoSend) return;
      const sendBtn = await waitFor(() => {
        const b = document.querySelector('button[aria-label="Send message"], button[aria-label="Send Message"], button[aria-label="发送消息"]');
        return b && !b.disabled ? b : null;
      }, 10000);
      if (sendBtn) sendBtn.click();
    });
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
