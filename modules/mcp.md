# L2 模块 — MCP（external tools）

范围：`packages/mcp/mcp-client`、`packages/mcp/mcp-resources`。能力缝（capability seam）：Service Definition `ctx.tools`（消费者视角）/ Provider `dsh-mcp-client` / Consumer `agent-loop` 的 tool executor。

## 做什么

每个插件实例连接**一个**外部 MCP 服务器（stdio 或 streamable-http），把服务器的 tools 注册到 `ctx.tools`，模型侧名称为 `mcp__<serverName>__<rawName>`。多个服务器 = 多个插件实例。Resources/Prompts 不桥接（`dsh-mcp-resources` 是反向：把 DSH 资源暴露给 MCP 客户端）。

## 关键文件

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 插件入口与 `Config`；`apply()` 流程：`resolveReconnectPolicy` → effect 内预留 `serverName`（按 scope 的 WeakMap，重名报错）→ `startConnection` → `registerServerContext` → `await connection.ready`；`failOnStartupError` 才让启动失败冒泡 |
| `src/connection.ts` | supervisor：client/transport 代际、重连退避（500ms 起翻倍，上限 30s，最多 10 次）、server instructions 上限（默认 32768 字节） |
| `src/tools.ts` | `createMcpToolDefinition`；`publicToolName` 规范化到 64 字符 function-name 契约，替换/截断时补 12-hex 哈希；`callTool` 结果映射 `{content, structuredContent}`；`isError` 直接 reject；图片仅在调用路由声明支持图片输入时才转 attachment |
| `src/transport.ts` | stdio：`StdioClientTransport{command,args,env:scrubbedParentEnv()+config.env,cwd}`；http：`StreamableHTTPClientTransport(url,{headers})` |
| `src/server-context.ts` | 注册 per-server context，供 UI/诊断读取 |

## Config（stdio / streamable-http）

- 必需：`transport`、`serverName`（`[A-Za-z0-9_-]{1,32}`）或 `url`
- stdio：`command`、`args[]`、`env{}`、`cwd`（默认 `""` = 继承进程工作目录）、`toolCallTimeoutMs`（默认 60000）、`maxInstructionBytes`（32768）、`reconnect{enabled,initialDelayMs,maxDelayMs,maxAttempts}`
- http：`url`、`headers{}`、同样的超时/指令/重连字段
- `failOnStartupError` 默认 `false`：启动失败只记日志、无工具；诊断期设 `true` 让它显式失败

## 生命周期与失败语义

- 注册即 effect：dispose 时断开、注销工具、释放 `serverName`；HMR 换实例同名可复现相同工具名
- 启动阻塞：`apply()` 等初始 `listTools()` 与注册完成，因此组合启动首个 turn 前工具已可见
- 掉线重连：退避重建并重新发现；预算耗尽后注销该服务器工具并停止（HMR/host 重启恢复）
- 工具重名由服务端拒绝；跨服务器同名靠 `serverName` 命名空间共存

## 常见坑

- 子进程环境经过清洗（凭证形状变量与 `DSH_*` 被丢弃）；服务器需要的变量必须显式写进 `env`
- `cwd` 默认空 → 项目型服务器（如依赖 git 根）要显式传 `cwd`
- 工具 schema 每轮都计入 prompt，服务器工具越多固定开销越大；只接需要的服务器
- 不桥接 resources/prompts；需要资源列表时看 `mcp-resources`

## 相关文档

`docs/cookbook/adding-a-tool.md`（工具 UI 呈现）、`packages/mcp/mcp-resources/README.md`、`docs/architecture.md`（capability seam 定义）。
