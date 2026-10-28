# dsh-kb — DeepSeek Harness 分层索引

按需读取的源码知识库索引，供 AI agent 在**不把整个仓库灌进上下文**的前提下定位 DSH 的包、插件、文档、符号与机制。

- 目标仓库：`deepseek-ai/deepseek-harness`
- 索引版本：**tag `dsh-v0.2.1-rc.3`**（commit `1f81c047`），与本机安装的 DSH 版本一致
- 规模：16,347 文件 / 381 包 / 4,517 篇 docs / 12,608+ 导出符号
- 生成器：`gen.cjs`（脚本化，不靠模型逐文件读）；校验：`verify.cjs`

## 目录结构

| 文件 | 层 | 用途 | 典型 token |
|---|---|---|---|
| `00-README.md` | — | 索引说明 + 各文件实测 token | 1.2k |
| `10-tree.md` | L0 | 顶层目录与 52 个 packages 域 | 183 |
| `20-packages.md` | L1 | 域索引（先读它，再进单域） | ~1k |
| `20-packages-<domain>.md` | L1 | 单域包清单（超大域已分 part） | ≤2k |
| `25-docs-index.md` | L1 | docs 组索引（按组读 `25-docs-*.md`） | ~1.4k |
| `25-docs-<group>.md` | L1.5 | 单组文档标题+摘要（每篇一行） | ≤2k |
| `30-plugins-*.md` | L1 | 插件 bundle / Client UI / preset / app 入口 | ≤2k |
| `40-symbols.jsonl` | L2 | 导出符号索引（`{"s","k","f","l","p"}`），grep 用 | 机器索引 |
| `40-symbols-summary.md` | L1 | 符号按域统计 | 450 |
| `modules/<domain>.md` | L2 | 机制文档（现有 `mcp`/`core`/`client`/`session`/`llm`/`skill`） | 1–2k |
| `50-scene-map.md` | L2 | 场景 → 入口映射（“改工具该看哪”） | ~700 |
| `meta.json` | — | 来源、tag、commit、规模、生成时间 | 小 |
| `gen.cjs` / `verify.cjs` | — | 重建与自检脚本 | 代码 |

## 使用方式（按需读取）

1. 先 `10-tree.md` 判断域 → `20-packages.md` 定位包 → 只读一个 `20-packages-<domain>.md`。
2. 设计问题 → `25-docs-index.md` → 读 1–2 篇 docs。
3. 找实现 → `grep 40-symbols.jsonl` 拿到 `file:line` → 读该文件（单次 ≤3 个）。
4. 机制 → 先读 `modules/<domain>.md`；场景 → `50-scene-map.md`。
5. 预算：单轮新增 ≤8k tokens、单任务 ≤25k；不整文件读，不把源码全文灌入。

## 重建

```powershell
# 在仓库副本上重新生成（会保留手写 modules/、50-scene-map.md、README.md）
node gen.cjs <repoPath> <outRoot> <tag> <commit>
node verify.cjs
```

索引是**派生产物**：升级 DSH 后按新 tag 重新生成（slug 随 tag 变化），旧索引标记 stale 后删除。

## 说明

- 索引只包含路径、名称、描述、摘要与符号位置，**不包含源码正文**；源码仍需在本地仓库副本中读取。
- 上游代码为 MIT 许可；本仓库仅含生成的索引元数据。
