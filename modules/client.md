# L2 模块 — client（Web GUI 浏览器端）

范围：`packages/client/*`（67 个包）+ 构建入口 `apps/web`。Host 侧页面投递见 `packages/host/`。

## 分层（单向知识，不可逆）

1. **数据对象层（无 React）**：`client/connection`（传输代与事件）、`api/session-controller/client`（`ClientSessions → SessionManager → Session`）、`api/workspace-controller/client`、`client/store`（`defineStore`/`createSnapshotStore`/`shallowEqual`）。store 产物是裸 observable，不含 hook。
2. **渲染机制**：`client/ui-renderer`（动态插件）负责全部 ctx→React 集成：slot 渲染、`SessionProvider`、uSES 适配。所有 hook 在这一层用裸 source 组合。
3. **展示组件**：各功能包 `src/client/`，纯 props；业务逻辑不得泄漏进来。

## 内核包

| 包 | 职责 |
|---|---|
| `web` | 启动浏览器 shell（**不是** Loader entry；静态 import 播种 `PLATFORM_MODULES`） |
| `modules` | 浏览器端 client module 加载（`ctx.clientModules`/`ctx.modules`） |
| `connection` | 浏览器↔Host RPC 与事件投递 |
| `ui-slots` | 类型化 Slot 定义与 Component Factory |
| `ui-renderer` | Slot → React 绑定与挂载 |
| `ui-session` | Session Controller 状态适配成 Slot sources |
| `store` | 快照 store 引擎 |
| `locale` | 本地化偏好与字典 |
| `shortcuts` | 键盘命令注册 |
| `ui-primitives` | 共享 React 控件/图标/内容渲染 |
| `ui-theme` / `ui-layout` / `ui-primitives` | 主题、区域布局、基础控件 |

## 硬约束

- Slot 只通过 `ctx.slots.register({name,children,store,inject}, Component)` 或 `registerFactory()` 注册；渲染未声明 slot 直接 load 失败；slot 名形如 `<domain>.<entry>.<hole>`（如 `tool.call.toolview`）。
- 组件 props 是五种派生 share（`PropsRuntime`/`PropsRenderSlots`/`PropsRenderFactories`/`PropsStore`/inject），不得手写或重定义；组件**看不到 ctx**，也不能造 hook。
- Store 读写：`props.useStore` 读、`props.actions.*` 写；工厂必须导出 `createXXXStore()`，禁止模块级句柄。
- 业务数据留在对象层，store 只放共享交互状态（选择、草稿、面板宽度）。
- `rpcId` 严格双向：发起方铸造、响应方回显，铸造只在 Connection。
- 文案全部走 `locale` 字典（`verify-client-ui-i18n` 强制）；样式只用 `--dsw-*` 语义 token + CSS Modules。
- 新增 UI 插件包要同时三处注册：`tsconfig.client.json` references、`packages/bundle/web-app/cordis.patch.yml` 行、web-app 的 package.json 依赖。

## 测试/推前

- 改 GUI 代码：`pnpm run test:gui`（秒级，首选内环）
- 改可见输出：`DSH_SNAPSHOT=replay pnpm run test:web`
- PR 前按 `.agents/skills/dsh-pre-push-checks` 选最小检查集

## 相关文档

`docs/subsystems/web-client.md`、`docs/subsystems/slots.md`、`docs/subsystems/conversation.md`、`packages/client/AGENTS.md`。
