# Contest → Claude 一键解题（油猴脚本）

在算法竞赛**题目页面**加两个按钮：**问 Claude**（`Alt+Shift+C`）一键提取题面发给 Claude，**复制 MD**（`Alt+Shift+M`）复制题目 Markdown。只发送题目本身（标题、链接、题面），不附加提示词，提示词交给 Claude 项目的自定义指令。

## 支持的网站

| 网站 | 提取方式 |
| --- | --- |
| Codeforces（含 gym / mirror） | `.problem-statement`，从 MathJax 的 `<script type="math/tex">` 还原 TeX 公式 |
| AtCoder | `#task-statement`，优先英文版，从 KaTeX annotation 还原公式，附带时空限制 |
| 洛谷 | 优先读页面内嵌的 JSON（原始 Markdown 题面 + 样例），失败时退回读 DOM |
| LeetCode / 力扣 | 题目描述区域 |
| Vjudge | 比赛页 `#problem/X` 和单题页 `/problem/...`，从题面 iframe 对应的描述页提取，`$$$x$$$` 等 CF 原始公式写法统一成 `$x$`；只有 PDF 的题会下载 PDF 作为附件发给 Claude |
| 代码源 newoj（Hydro） | 优先读 `UiContext.pdoc` 里的原始 Markdown，失败时读 `.problem-content` |

按钮位置：Vjudge 放在左侧面板里（PDF 按钮下面，可在油猴菜单「Vjudge 侧边栏按钮」里隐藏）；其它网站贴在屏幕边缘，平时只露出图标，鼠标移上去展开；按住拖动可以上下移动，拖到左半屏就贴到左边，位置会记住（菜单「重置悬浮标签位置」可恢复）。

按钮只在题目页面出现（比赛首页、题目列表、提交记录等页面不显示）：

- Codeforces：`/problemset/problem/…`、`/contest/…/problem/…`、`/gym/…/problem/…`、`/group/…/contest/…/problem/…`
- AtCoder：`/contests/…/tasks/…`
- 洛谷：`/problem/P1001` 这类
- LeetCode：`/problems/<题目>/` 和 `/problems/<题目>/description/`
- Vjudge：`/contest/<id>#problem/<题号>`、`/problem/<题目>`
- 代码源 newoj：`/p/<题号>`

其它网站：在脚本头部加一行 `// @match`，然后**选中题目文字**再点按钮即可（有选中文字时只发送选中部分）。

## 安装

1. 浏览器装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）。
2. 新建脚本，把 [`claude-contest-helper.user.js`](./claude-contest-helper.user.js) 的内容整个粘进去，保存。

## 两种模式（在油猴菜单里切换）

- **网页版（默认）**：打开你的 Claude 项目（菜单「Claude 项目」里设置，留空则用 `claude.ai/new`），在项目里新建对话，脚本把题面填进输入框，由你检查后自己按发送（菜单里可打开“自动发送”，但脚本代你点发送属于条款里的灰色地带，默认关闭）。用的是你自己的 claude.ai 账号，不需要 API Key。题面同时会复制到剪贴板，如果 claude.ai 改版导致自动填入失败，直接 `Ctrl+V` 即可。
- **API**：菜单里设置 Anthropic API Key 后，直接在题目页面弹出面板显示回答，带“复制代码”按钮（复制最后一个代码块）。Key 只保存在油猴本地存储中。

把项目的自定义指令和知识库（模板、常用算法等）配好，脚本只负责把题目送进去。

其它菜单项：Vjudge 侧边栏按钮显示/隐藏、API 模型 ID、复制题目 Markdown、重置悬浮标签位置。API 模式不经过项目，所以不会带上项目的自定义指令。

## 注意

- Vjudge 上只有 PDF 题面的题：「问 Claude」会把 PDF 下载下来，网页版作为附件上传到对话里，API 模式作为 document 发送；「复制 MD」只能复制标题和 PDF 链接。PDF 可能放在其它域名上，第一次下载时油猴可能会弹窗询问是否允许跨域访问，选允许即可。

- **不要在正式比赛（rated contest）中使用。** Codeforces 等平台明确禁止比赛中使用 AI 解题，违规会被封号；请只在赛后补题、练习时使用。
- 网页版模式依赖 claude.ai 的页面结构（`contenteditable` 输入框、`aria-label="Send message"` 的发送按钮），改版后可能需要调整 `runOnClaude()` 里的选择器。
