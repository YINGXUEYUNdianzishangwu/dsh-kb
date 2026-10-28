# L2 模块 — session（持久化数据面）

范围：`packages/session/*`（21 个包）+ `packages/core/session`（日志实现）+ `packages/session-query`（只读查询）。

## 分工

- **core/session**：append-only 日志本体。`session.append(type,data,opts)` 冻结 payload、校验 lossless JSON、通知 observer；`deriveMessages()` 增量派生模型历史；`fork()` 取稳定前缀；compaction 隐藏被取代条目但不删除。
- **session group**：持久化接缝与实现。四个家族：
  - **Persistence**：`session-format`（相邻格式链 + 工件校验库）、`session-format-v0-to-v1` … `v3-to-v4`（冻结的已发布解码器/迁移）、`session-persistence`（`ctx.sessionPersistence` 服务定义 + 写协调）、`session-persistence-jsonl`（默认后端：每 Session 不可变 canonical generation 文件名 + 排他后继发布，可选 zstd）、`session-checkpoint-policy`（在下一个动作前把模型请求、顶层工具副作用、完成 step 变持久）、`session-log-deepseek`（把增量 canonical 日志作为 DeepSeek 请求元数据上报）。
  - **Projection**：把事件折成 client 可用值。
  - **Titles**：会话命名。
  - **Telemetry**：活动上报。
- **session-query**：独立的读取/搜索/导出/工具面（不依赖写路径）。

## 关键规则

- 已发布格式**只增不改**：新增只能加 version-named successor，绝不移动/覆盖/删除已提交代际；`SESSION_FORMAT_VERSION` 只在现有判别器无法安全解释时 bump。
- 持久化注意：mounted backend 下 loop 是唯一写句柄持有者；create 先 `persistence.create(header)`，resume 走 `open(id,'write')`；teardown 关闭写句柄并释放所有权。
- 崩溃修复：resume 读到 mid-turn 崩溃日志时追加 `interruptedTurnClosers`（语义修复是 agent 层责任，不是存储入口）。
- 所有 model-visible 事实必须能由日志重建（Model-visible ⟺ logged）。
- 改动持久化类型要按 `docs/cookbook/reviewing-persistence-type-changes.md` 走，并在 `docs/session-format-status.md` 记录状态。

## 相关文档

`docs/session-format-status.md`、`docs/cookbook/reviewing-persistence-type-changes.md`、`docs/architecture.md`、`.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md`。
