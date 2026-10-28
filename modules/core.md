# L2 模块 — core（agent / session API）

范围：`packages/core/*`。这里是「agent 如何跑、会话如何记、工具如何注册」的地基。

## 组成

| 包 | 职责 |
|---|---|
| `dsh-agent` | `ctx.agents` 公共 API：create/resume、`AgentHandle`、get/list/roots、事件与拦截点 |
| `dsh-agent-loop` | 默认驱动（`AgentFactory` 实现）：turn/step 状态机、inbox、工具调度、取消 |
| `dsh-agent-default-model` | 入口共享的默认模型选择 |
| `dsh-agent-tool-presentation` | 选择 agent 的工具呈现：native Function Calling 或 PTC |
| `dsh-scope` | 每个 agent/组一份隔离的注册域与生命周期 |
| `dsh-session` | append-only 会话日志，`deriveMessages()` 派生模型历史 |
| `dsh-system-prompt` | 系统提示组装（含工具 schema） |
| `dsh-tools` | `ctx.tools` 注册表、策略（allow/deny/ask）、`defineTool` |
| `dsh-tool-executor-native` / `-ptc` | 两种工具执行器 |

## 一次 turn / step 的执行链（agent-loop）

1. turn 边界：打开 durable turn；原子 claim「下一步输入 + 一条排队提示」。step 边界只 claim 下一步输入。
2. 组装 prompt 与工具 → `agent/pre-step` waterfall → 组装 runtime context。
3. 首次尝试：提交 `user/message` 批次 → `ctx.llm.prepareCall()` 解析适配器/推理档 → 同步 reconcile system message → `deriveMessages()` → 冻结 request → 流式响应。
4. 工具调用走 guarded pipeline：parallel-safe 调用最多并发 `maxParallelToolCalls`（默认 10）；exclusive 调用是顺序屏障。
5. 每条被接受的事实先 append 到 session，下一步从日志派生；重试复用同一份渲染，不重复 pre-step/用户准入。
6. 取消是协作式的：`agent.cancel()` 中止当前活动，已流出文本保留；`keepInbox` 控制是否清空待处理输入。

## session（日志）

- `session.append(type, data, opts)`：冻结 payload、校验 lossless JSON、通知 observer；`deriveMessages()` 增量投影、带缓存。
- 所有 model-visible 事实必须能从日志重建；compaction 只是隐藏被取代条目，不删除历史。
- `ctx.sessions.create()/get()/list()/fork()`；挂 `ctx.sessionPersistence` 时 create 先 `persistence.create(header)` 拿写句柄，resume 走 `open(id,'write')`；无后端则纯内存。
- 格式版本 `SESSION_FORMAT_VERSION` 与迁移规则见 `docs/session-format-status.md`。

## tools（注册表）

- `ctx.tools.register(defineTool({ name, description, parameters, execute }))` 返回 disposer；注册即进入 system-prompt 组装。
- 模型参数在 execute 前校验；非法输入是普通错误结果，不结束 turn。
- 策略 allow/deny/ask 在调用流水线里执行；`mode` 决定 native 或 PTC，agent 可用 `presentAs` 覆盖。
- canonical 输出属于执行层；session 记录渲染内容与 presentation 元数据。

## scope（隔离）

- `createScope(ctx, key)`：子作用域继承祖先贡献、最近定义优先；祖先可观察后代活动；`dispose()` 卸载全部。
- 通过 `agent.ctx` 注册的工具只对该 agent 可见；跨 agent 复用 `serverName` 之类的命名空间靠作用域隔离。

## 硬约束（仓库 AGENTS.md 摘要）

- **Model-visible ⟺ logged**：新增模型可见输入必须新增 session event。
- 注册都是 effect；waterfall listener 必须调用 `next()`，否则短路。
- 新行为优先走插件扩展点；改 `agent-loop` 必须同步 `docs/architecture.md`。
- 可选服务用 `ctx.get(name)`；`ctx.<name>` 只用于声明注入。

## 常见坑

- 不要直接 import 驱动包：消费方只依赖 `ctx.agents` / `ctx.session` 接口（驱动以 factory 注册）。
- teardown 顺序：`handle.dispose()` → 停 loop → 注销 → 卸 scope → 关 session 写路径。
- 会话格式变更要同时更新 TS/Python SDK 期望输出与快照。
