// ==UserScript==
// @name         Contest → Claude 一键解题
// @namespace    https://github.com/koma404/claude-workspace
// @version      0.3.0
// @description  在 Codeforces / AtCoder / 洛谷 / LeetCode / Vjudge 题目页面一键提取题面，发送给 Claude（网页版或 API）
// @author       koma404
// @match        https://codeforces.com/*
// @match        https://*.codeforces.com/*
// @match        https://codeforc.es/*
// @match        https://atcoder.jp/*
// @match        https://www.luogu.com.cn/*
// @match        https://leetcode.com/*
// @match        https://leetcode.cn/*
// @match        https://vjudge.net/*
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
  registerMenu();
  const button = injectButton();
  const syncButton = () => { button.style.display = isProblemPage() ? 'flex' : 'none'; };
  syncButton();
  window.addEventListener('hashchange', syncButton);
  window.addEventListener('popstate', syncButton);
  setInterval(syncButton, 500);
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code === 'KeyC' && isProblemPage()) {
      e.preventDefault();
      sendToClaude();
    }
  });

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
    GM_registerMenuCommand(`API 模型：${cfg('model')}`, () => {
      const v = prompt('模型 ID', cfg('model'));
      if (v) GM_setValue('model', v.trim());
    });
    GM_registerMenuCommand('仅复制题面到剪贴板', async () => {
      const p = await buildMessage();
      if (p) { GM_setClipboard(p, 'text'); toast('已复制到剪贴板'); }
    });
  }

  function injectButton() {
    const btn = document.createElement('button');
    btn.title = '提取题面并发送给 Claude（Alt+Shift+C）。选中文字时只发送选中部分。';
    Object.assign(btn.style, {
      position: 'fixed', right: '20px', bottom: '20px', zIndex: 2147483646,
      display: 'none', alignItems: 'center', gap: '6px',
      padding: '10px 16px', border: 'none', borderRadius: '999px', cursor: 'pointer',
      background: '#d97757', color: '#fff', fontSize: '14px', fontWeight: '600', lineHeight: '1',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)',
    });
    // 用内联 SVG 画图标，不依赖系统的 emoji 字体
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) {
      const line = document.createElementNS(NS, 'line');
      Object.entries({ x1: 12, y1: 2, x2: 12, y2: 22, stroke: 'currentColor', 'stroke-width': 2.6,
        'stroke-linecap': 'round', transform: `rotate(${i * 45} 12 12)` }).forEach(([k, v]) => line.setAttribute(k, v));
      svg.appendChild(line);
    }
    btn.append(svg, document.createTextNode('问 Claude'));
    btn.addEventListener('click', sendToClaude);
    document.body.appendChild(btn);
    return btn;
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
    return `# ${problem.title.trim()}\n\n${location.href}\n\n${problem.statement.trim()}`;
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
    return null;
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

    const titleEl = document.querySelector('#problem-title, #prob-title h2, #prob-title, .problem-title');
    const title = (titleEl?.textContent || document.title).replace(/\s+/g, ' ');
    // 题目页 / 比赛页上方的时空限制等信息
    const props = [...document.querySelectorAll('#prob-properties dl, #prob-properties li, .prob-property, dl.card-text')]
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /limit|限制/i.test(t));
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
