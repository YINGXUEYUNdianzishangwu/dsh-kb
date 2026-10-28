# L2 模块 — skill（可复用指令）

范围：`packages/skill/*`（5 个包）+ `packages/skill/skill-*`。技能 = 按需发现、按名加载的可复用任务指令。

## 包分工

| 包 | 职责 | ctx key |
|---|---|---|
| `skill/` | 注册表：合并任意 provider 的目录，按名解析胜者 | `ctx.skills` |
| `skill-filesystem/` | 从 project / custom / user 目录发现技能并 watch | 注册到 `ctx.skills` |
| `skill-office/` | 内置 Word/PPT/Excel 工作流 | 注册到 `ctx.skills` |
| `tool-skill/` | 发布会话技能目录 + 模型侧 `skill` 加载工具 | 注册到 `ctx.tools` |

## 文件系统 provider 的根与优先级

| Rank | 来源 | 路径 |
|---|---|---|
| 100 | project-dsh | `<projectRoot>/.dsh/skills` |
| 200 | project-agents | `<projectRoot>/.agents/skills` |
| 300 | custom | `Config.customSkillDirs` |
| 400 | user-dsh | `<dshHome>/skills`（跳过 `.system` 子dir） |
| 500 | user-agents | `<agentsHome>/skills`（默认 `~/.agents`） |

project root = 最近的含 `.git` 祖先；没有则用当前 cwd。skill 形式：目录包 `<name>/SKILL.md` 或扁平 `<name>.md`，**只在根顶层发现**，不递归。

## SKILL.md 契约

- YAML frontmatter：必填 `name`、`description`；可选 `whenToUse`、`metadata`、`disable-model-invocation`、`user-invocable`。
- 两种生命周期独立：发现时解析 frontmatter 进目录（catalog），加载时每次重读正文 → 改正文不需要版本号/缓存失效。
- 目录 = 常驻系统提示的一行（名称+描述）；正文只在调用时进上下文（本知识库技能就是这么设计的）。

## 维护

- 新增技能：写文件即被 watch 到，下一次 catalog 生效，无需重启。
- 技能内容要精简：目录行会被每轮计入；正文只在加载时计入。
- 本机用户级技能在 `~/.dsh/skills/`（如 `deepseek-harness-kb`）。

## 相关文档

`packages/skill/README.md`（组）、`packages/skill/skill-filesystem/README.md`、`packages/skill/tool-skill/README.md`、`packages/skill/AGENTS.md`（若有）。
