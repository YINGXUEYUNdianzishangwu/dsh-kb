# 场景 → 入口映射（先看这一格，再读 1–2 个文件）

| 我要做的事 | 先读 | 再深入 |
|---|---|---|
| 新增/修改一个模型可调用工具 | `packages/core/tools/src/index.ts`（defineTool/registry） | `docs/cookbook/adding-a-tool.md` + Client UI 卡片 |
| 接入一个 MCP 服务器 | `modules/mcp.md` | `packages/mcp/mcp-client/src/index.ts`（Config）+ profile 的 `cordis.patch.yml` |
| 新增插件 / profile bundle | `packages/bundle/base/cordis.patch.yml` | `docs/cordis-primer.md` |
| 调试 agent 循环 / turn / 取消 | `packages/core/agent-loop/src/agent.ts` | `docs/architecture.md` |
| 会话持久化 / 会话格式 | `packages/core/session` | `docs/session-format-status.md` |
| 接一个新模型 provider | `packages/llm/` | `docs/architecture.md`（capability seam） |
| 工具呈现（PTC vs native） | `packages/core/agent-tool-presentation` | `packages/ptc-runtime/` |
| 沙箱 / 子进程 / 环境清洗 | `packages/sandbox/` | `packages/subprocess/`（`scrubbedParentEnv`） |
| 技能（skill）加载 | `packages/skill/` | `docs/` 下 skill 相关说明 |
| 远程 API / GUI Host | `packages/api/` | `packages/host/` |
| 写一个 Client UI 插件 | `30-plugins-client-ui*.md` | `packages/client/` |
| 审批 / 人机交互 | `packages/interaction/` | `packages/user-approval`（dsh-user-approval） |
| 测试怎么写 / 推前检查 | `docs/testing.md` | `.agents/skills/dsh-pre-push-checks` |
| 文档规范 / 双语 | `docs/AGENTS.md` | `docs/cookbook/` |
| 发布 / 版本 / 迁移 | `docs/development.md` | `docs/session-format-status.md` |
| 后台任务 / 子代理 | `packages/jobs/` | `packages/subagent/` |
| 上下文压缩 | `packages/compaction/` | `docs/architecture.md` |
| Goal / 计划 / 待办 | `packages/goal/` | `packages/plan/`、`packages/todo/` |
| 定时任务 | `packages/schedule/` | `docs/config-catalog.md` |
| 工作区 / 文件访问 | `packages/workspace/` | `packages/fs/` |

## 查不到时

1. `grep` 符号：`40-symbols.jsonl`（每行 `{"s":名称,"k":类型,"f":文件,"l":行,"p":包}`）
2. `grep` 文档：`25-docs-index.md` 找到组，再读 `25-docs-*.md`
3. 仍不确定：读 `packages/<域>/<包>/README.md`（每个包都有 Summary + Model Experience）
4. 最后才读 `src/*.ts`，单次 ≤3 个文件
