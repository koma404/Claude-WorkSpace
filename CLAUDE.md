# 项目约定

## 把便宜的活分给 DeepSeek

目的：省钱、省主会话的 Token 和上下文。工具是 `tools/delegate.py`，结果写文件，终端只回一行状态。

### 适合分出去的活
- 批量、自包含、一条指令能说清的任务：翻译、总结长文、批量分类/打标签、格式转换、样板代码初稿、注释和文档初稿。
- 输出我能快速核对（行数、格式、抽样几条）。
- 出错代价低。

### 不要分出去的活
- 需要仓库上下文或多步工具调用：调试、重构、跨文件改动。
- 需要严谨推理、长上下文记忆、或安全相关的判断。
- 活很小：写 prompt 加读结果的开销比自己直接做还大。

### 用法
```
python3 tools/delegate.py --task "指令" --input in.md --out out/result.md
python3 tools/delegate.py --batch jobs.jsonl --task "统一指令" --out out/results.jsonl --workers 8
```
- 结果只读需要的部分（`head`、`grep`、抽样），不要整个 `cat` 回上下文。
- 需要结构化输出时加 `--json`；输出过长用 `--max-chars` 兜底。
- 交付前必须核对：DeepSeek 的输出不能直接当成果。它有爱自造术语、迎合、丢上下文的倾向。

### 后端
- 设了 `DEEPSEEK_API_KEY`：直连 api.deepseek.com。
- 否则走 OpenRouter（云端会话里凭据由代理注入）。
