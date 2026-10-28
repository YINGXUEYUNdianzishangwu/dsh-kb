# L2 模块 — llm（模型调用能力）

范围：`packages/llm/*`（9 个包）。核心是**一个 provider 中立**的模型调用服务 `ctx.llm`。

## 包分工

| 包 | 职责 |
|---|---|
| `llm` | `ctx.llm`：流式发起一次模型调用；定义全仓共享的 message / content block / stream chunk 词汇表 |
| `llm-deepseek` | 官方路线的 Messages 协议、请求配置、模型能力（共享实现） |
| `llm-deepseek-api-key` | API-key 认证与发现（`ctx.llm`） |
| `llm-deepseek-account` | 账号 token 认证、失效处理与发现（`ctx.llm`） |
| `llm-pi-ai` | 通过 pi-ai 目录与 wire 协议提供配置化 provider route（含手写网关） |
| `deepseek-llm-api-extensions` | 在官方 DeepSeek 请求上注册生命周期拥有的顶层字段 |
| `plugin-package-inventory-deepseek` | 把活跃 Loader 包清单作为请求元数据上报 |
| `llm-retry` | 在 durable agent-step 边界按 provider 策略重试失败请求（监听 `agent/request-error`） |
| `token-meter` | 从持久日志度量请求/上下文压力（固定启发式，`ctx.tokenMeter`） |

## 关键概念

- **词汇表由 `llm` 包拥有**：消息、内容块、`StreamChunk`；适配器只做 provider wire 格式 ↔ 该词汇表的翻译。
- **适配器契约**见 `docs/subsystems/llm-streaming.md`；`ctx.llm.prepareCall()` 校验适配器字段、解析 reasoning-effort 与输出 token 默认值，并返回该调用绑定的适配器。
- **请求头/上下文记录**：loop 为首次请求、envelope 变化、surface 替换、resume 写 header；`request/context` 只在 provider/model/contextWindow/systemPromptUpdate 变化时记录。
- **token 计量**是固定启发式（`docs/subsystems/token-meter.md`），不是精确 tokenizer。
- **两条 DeepSeek 适配路线结构不同**（api-key vs account），见 `.agents/notes/.../twin-llm-adapters.md`。

## 常见坑

- 不要绕过 `ctx.llm` 直接调 provider SDK：路由、重试、计量、请求日志都挂在这条缝上。
- 新增 provider 需要 adapter + 模型能力声明；缺失适配器时请求以 `NO_ADAPTER` 失败。
- 推理档/输出 token 的默认值属于 adapter-owned 字段，loop 只解析不硬编码。

## 相关文档

`docs/subsystems/llm-streaming.md`、`docs/subsystems/token-meter.md`、`docs/architecture.md`。
