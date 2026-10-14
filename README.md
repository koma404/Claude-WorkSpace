# Contest → Claude 一键解题（油猴脚本）

在算法竞赛题目页面右下角加一个 **🤖 问 Claude** 按钮（快捷键 `Alt+Shift+C`），一键提取题面发给 Claude。

## 支持的网站

| 网站 | 提取方式 |
| --- | --- |
| Codeforces（含 gym / mirror） | `.problem-statement`，从 MathJax 的 `<script type="math/tex">` 还原 TeX 公式 |
| AtCoder | `#task-statement`，优先英文版，从 KaTeX annotation 还原公式，附带时空限制 |
| 洛谷 | 优先读页面内嵌的 JSON（原始 Markdown 题面 + 样例），失败时退回读 DOM |
| LeetCode / 力扣 | 题目描述区域，提示词改为“按给定函数签名实现” |

其它网站：在脚本头部加一行 `// @match`，然后**选中题目文字**再点按钮即可（有选中文字时只发送选中部分）。

## 安装

1. 浏览器装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）。
2. 新建脚本，把 [`claude-contest-helper.user.js`](./claude-contest-helper.user.js) 的内容整个粘进去，保存。

## 两种模式（在油猴菜单里切换）

- **网页版（默认）**：打开 `claude.ai/new`，脚本自动把提示词填进输入框并发送（可在菜单关闭“自动发送”）。用的是你自己的 claude.ai 账号，不需要 API Key。提示词同时会复制到剪贴板，如果 claude.ai 改版导致自动填入失败，直接 `Ctrl+V` 即可。
- **API**：菜单里设置 Anthropic API Key 后，直接在题目页面弹出面板显示回答，带“复制代码”按钮（复制最后一个代码块）。Key 只保存在油猴本地存储中。

其它菜单项：代码语言（默认 C++）、API 模型 ID、仅复制提示词。提示词模板在脚本顶部的 `PROMPT_TEMPLATE`，可按需修改。

## 注意

- **不要在正式比赛（rated contest）中使用。** Codeforces 等平台明确禁止比赛中使用 AI 解题，违规会被封号；请只在赛后补题、练习时使用。
- 网页版模式依赖 claude.ai 的页面结构（`contenteditable` 输入框、`aria-label="Send message"` 的发送按钮），改版后可能需要调整 `runOnClaude()` 里的选择器。
