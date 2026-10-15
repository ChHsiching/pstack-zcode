# pstack → ZCode 适配技术调研报告

- 调研日期：2026-10-14
- 调研对象：pstack v0.15.24（commit `1e5c90a`，来自 `cursor/plugins` monorepo 的稀疏检出）与 ZCode（本机 `C:\Program Files\ZCode`，用户配置 `C:\Users\Administrator\.zcode\`）
- 调研方法：本地一手资料（pstack 全量 169 个文件逐目录调查 + ZCode 官方插件缓存内的权威文档）+ 联网查证（Cursor 官方文档、agent-plugins.org 标准、ZCode GitHub 仓库与官方文档）
- 本报告只做调研，不改动仓库其他文件

---

## 1. pstack 概览

### 1.1 pstack 是什么

pstack 是 Lauren Tan（@poteto，Meta/Netflix/Cursor 前工程师、React Core Team 成员）开发的 Cursor 工作流插件，口号是 "if you want to go fast, go deep first"（想快，先深）。核心理念：

- **prompt stack**：一套可叠加的「技能栈」——`/poteto-mode` 作为总入口（路由器），按任务匹配 23 个 playbook，playbook 的各步骤再按需调用其余技能；24 条工程原则（principles）作为所有决策的依据层。
- **fearless parallelism**：通过可信的 delegate 子代理（`poteto-agent`）实现带质量保证的并行。
- **多模型分工**：代码类工作默认路由到 `grok-4.7-xhigh-fast`，判断/文案类默认 `claude-opus-5-5-xhigh`，评审面板用多模型互查（`/setup-pstack` 可改写）。
- **反 slop**：产出更少但更高质量的代码，回复必须「unslop」。

来源：`pstack\README.md`（本地）；作者自述 [How I Use Cursor（x.com/poteto）](https://x.com/poteto/article/2058975157503570132)；第三方分析 [flaviocopes.com/pstack](https://flaviocopes.com/pstack)、[firecrawl.dev 最佳 Cursor 插件](https://www.firecrawl.dev/blog/best-cursor-plugins)。

### 1.2 安装与仓库位置

- Cursor 内安装：聊天框输入 `/add-plugin pstack`（来源：`pstack\README.md` L17-19、`pstack\docs\guide\01-setup.md`）。
- 上游仓库：[github.com/cursor/plugins](https://github.com/cursor/plugins)（monorepo，根 `.cursor-plugin/marketplace.json` 列出全部插件，每个插件是根下独立目录，含自己的 `.cursor-plugin/plugin.json`）。来源：[cursor/plugins README](https://github.com/cursor/plugins)。
- 本仓库是 `cursor/plugins` 的稀疏检出（`git sparse-checkout list` → `pstack`、`docs`；上游 HEAD 为 `1e5c90a chore(pstack): bump to 0.15.24 (#617)`，本地另有一个初始化提交 `a4539f4`）。来源：本地 `git log` / `.git/info/sparse-checkout`。

### 1.3 资产盘点（本地逐目录清点）

| 目录/文件 | 数量 | 内容 |
|---|---|---|
| `pstack\plugin.json` | 1 | 根清单，遵循 [agent-plugins.org](https://agent-plugins.org/) v1.0.0 schema（`$schema` 字段指明），仅元数据（name/version/description/author/homepage/repository/license/keywords），无组件指针 |
| `pstack\.cursor-plugin\plugin.json` | 1 | Cursor 专有清单：在根清单基础上增加 `displayName`、`logo`、`category`、`tags`，以及组件指针 `"skills": "./skills/"`、`"agents": "./agents/"` |
| `pstack\skills\` | **54 个技能** | 每个技能一个目录 + `SKILL.md`，部分带 `references/`、`playbooks/`、`scripts/` 子目录 |
| ├ 其中 `principle-*` | 24 | 每条工程原则一个技能（core 10 / architecture 6 / verification 5 / delegation 2 / meta 1） |
| ├ 其中工作流技能 | 30 | poteto-mode、poteto-help、how、why、architect、arena、swarm、interrogate、tdd、unslop、setup-pstack、recall、reflect、correct、teach 等 |
| `pstack\skills\poteto-mode\playbooks\` | 23 个 playbook | 纯 markdown 步骤文档（investigation、bug fix、perf、hillclimb、feature、shipping、orchestrate、autopilot 等），被 poteto-mode 的 SKILL.md 引用 |
| `pstack\skills\poteto-mode\scripts\` | ~15 个脚本 | TypeScript（bun 运行时 + commander 依赖）：`bootstrap.ts`（自装依赖）、`orch/orch.ts`、`watch-pr/`、`check-plan.mjs`、`worktree-audit.sh` 等，带测试。来源：`pstack\skills\poteto-mode\scripts\package.json` |
| `pstack\agents\` | **2 个子代理** | `poteto-agent.md`（delegate 包装器）、`comment-sicko.md`（只读注释审查员） |
| `pstack\automations\benny\` | 1 个自动化包 | Slack issue 分诊 + 复现修复的「休眠」自动化素材（2 个伪技能 + 模板 + FOR_AGENTS.md 安装说明），不注册为 slash 技能 |
| `pstack\docs\guide\` | 11 个文档 | 10 页上手指南 + README + 图片 |
| `pstack\assets\logo.png` | 1 | 市场 logo |

总计 169 个文件。来源：`find pstack -type f | wc -l`（本地实测）。

### 1.4 frontmatter 格式

**技能（SKILL.md）**，来源：本地各 `pstack\skills\*\SKILL.md` + [Cursor 官方 skills 文档](https://cursor.com/docs/skills)：

```yaml
---
name: architect                # 必填；Cursor 要求匹配父目录名
description: "..."             # 必填
disable-model-invocation: true # 53/54 个技能都有：禁止模型自动调用，仅显式 / 调用
icon: crown                    # 仅 poteto-mode（Custom Mode 徽章图标）
color: yellow                  # 仅 poteto-mode（徽章颜色）
paths: ["**/*.ts", "**/*.tsx"] # 仅 typescript-best-practices（glob 作用域）
---
```

Cursor 官方字段语义（来源：[cursor.com/docs/skills](https://cursor.com/docs/skills)）：`paths` 优先于遗留 `globs`；`icon` 合法值 `code/terminal/bug/git-branch/book-open/beaker/shield/rocket`；`color` 合法值 `default/green/cyan/blue/purple/magenta/orange/yellow/red/brand`；`metadata` 任意键值。**注意**：pstack 的 `icon: crown` 不在官方列举的合法值内（会回退为闪电图标），且 poteto-mode/make-bot-ui 的 `name` 带空格大写（"Poteto Mode"），与官方「name 必须匹配父目录名（小写连字符）」的表述不符——说明 Cursor 实际执行比文档宽松。

**子代理（agents/*.md）**，来源：`pstack\agents\poteto-agent.md`、`pstack\agents\comment-sicko.md`：

```yaml
---
name: poteto-agent
description: "..."        # 被 spawn 方按 description 匹配
is_background: true       # 仅 poteto-agent；Cursor 的子代理后台标志
---
```

正文即 system prompt。`poteto-agent.md` 正文包含 Cursor 安装路径回退搜索：`~/.cursor/plugins/` 下找 `skills/poteto-mode/SKILL.md`，多副本时取 `.cursor-plugin/plugin.json` version 最高者。

**模型配置规则**（非技能，而是 Cursor Rules 机制）：`/setup-pstack` 将每角色→模型映射写入 `~/.cursor/rules/pstack-models.mdc`（`alwaysApply: true` + frontmatter 的 `.mdc` 规则文件），所有技能运行时读取该文件、缺省回退内置默认。来源：`pstack\skills\setup-pstack\SKILL.md`、`pstack\docs\guide\01-setup.md`。

### 1.5 Cursor 专有依赖量化

对 54 个 SKILL.md + 2 个 agent + 23 个 playbook 全文 grep（本地实测）：

| Cursor 专有概念 | 出现文件数 | 说明 |
|---|---|---|
| `.cursor/rules/pstack-models.mdc` 路径 | 9 个文件（setup-pstack、arena、interrogate、swarm、how、poteto-help、docs 等） | 模型角色配置的读取路径 |
| Cursor 模型 slug（grok-4.7-*、claude-opus-5-5-*） | 15 个文件 | 含家族回退逻辑（claude-*/grok-*/cursor-grok-*/composer-*） |
| `subagent_type:`（Task 工具参数） | 9 个文件 | spawn 子代理时指定类型 |
| `Task` 工具调用规范（run_in_background、readonly、model 字段） | 16 个文件 | Cursor 的子代理 spawn API |
| `AskQuestion` 工具 | 4 个文件 | Cursor 的提问工具（ZCode 对应 AskUserQuestion） |
| Cursor 内建/生态依赖：`/create-skill`、`/loop`、Bugbot、cursor-team-kit 的 `deslop`/`control-cli`/`control-ui`、内建 babysit | poteto-mode、poteto-help、README、bug-fix 等 | 「not shipped here」章节明确列出（来源：`pstack\README.md` L242-250） |
| `~/.cursor/projects/<slug>/agent-transcripts/*.jsonl` 会话记录路径 | 4 个技能（recall、reflect、automate-me、show-me-your-work） | 挖掘历史会话的转录格式 |
| `.cursor/skills/` 项目级技能写入路径 | create-verification-skill、automate-me、maintain-verification-skill | 生成的 verify-* 技能落盘位置 |
| Cursor Automations（benny）：`.cursor/automations/`、`.cursor/settings.json` 的 plugins 开关、`api2.cursor.sh` webhook、`/automate` 内建 | automations/benny 全部 12 个文件 | 完全依赖 Cursor Automations 平台 |
| Custom Modes（Option+Enter 常驻模式）、Cloud Agents | README、poteto-help、guide | 体验层特性 |

**结论（问题 2 的回答）**：

- **编辑器无关的纯 prompt/markdown（可直接平移）**：24 个 principle 技能（每个只有 name/description/disable-model-invocation + 正文）、以及 bro、in-your-own-words、sharpen、unslop、technical-writing、tdd、benchmark-checklist、no-comments 等约 **30+ 个技能的正文**基本不依赖 Cursor 机制；23 个 playbook 的 90%+ 内容是纯方法论步骤。粗略估计：**约 70% 的文件内容编辑器无关**。
- **Cursor 专有（需改写或无对应）**：模型角色系统（.mdc 规则 + slug 体系）、子代理 spawn 措辞（subagent_type/Task）、会话转录挖掘（4 个技能）、Custom Modes 常驻体验、`/loop`、Bugbot、cursor-team-kit 外部依赖、benny 自动化包、verify 技能的落盘路径。**约 30% 内容需要适配**，其中 benny 和 make-bot-ui 几乎不可移植。

pstack 作者自己也确认了这一分层：「pstack 的技能用 Agent Skills 格式，其他工具能读；但大多数工作流技能（/poteto-mode、/how、/why、/teach）会 spawn Cursor 子代理并按角色指定模型，Custom Modes 和 /loop 是 Cursor 特性，这些部分在其他工具中可能不工作」（来源：`pstack\skills\poteto-help\SKILL.md` L45，原文意译）。

---

## 2. ZCode 扩展机制全集

ZCode 是 Z.ai 开源的 AI 编程 agent 工作台（Apache-2.0，TypeScript monorepo，含桌面 Electron 应用、Web 界面、终端 Agent CLI）。来源：[github.com/zai-org/ZCode](https://github.com/zai-org/ZCode)、[zcode.z.ai](https://zcode.z.ai/en)、VentureBeat 报道。

以下机制清单来自本机 ZCode 官方指南插件（`C:\Users\Administrator\.zcode\cli\plugins\cache\zcode-plugins-official\zcode-guide\0.3.0\skills\`，共 6 个技能文档）与官方插件开发文档（下称各来源）。

### 2.1 插件（Plugins）

来源：本地 `zcode-guide\...\zcode-configuration-guide\SKILL.md`、`zcode-guide\...\diagnosing-plugins\SKILL.md`、`plugin-creator\0.1.1\skills\plugin-creator\references\plugin-json-spec.md`、[zcode-plugins PLUGIN_DEVELOPMENT.md](https://github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT.md)。

- **清单**：`.zcode-plugin/plugin.json`（兼容探测 `.claude-plugin/plugin.json`、`.codex-plugin/plugin.json`；**不探测 `.cursor-plugin/`，也未记录探测插件根的裸 `plugin.json`**）。插件身份 `<name>@<marketplace>`。
- **name 约束**：`^[a-z0-9][a-z0-9._-]{0,127}$`；version 缺省 `0.0.0`。
- **组件字段**：`commands`、`skills`、`hooks`、`mcpServers`、`agents`（可为目录名、数组或内联对象）。`channels`、`lspServers`、`outputStyles`、`settings` 记录但不执行。`userConfig` 支持用户配置项（string/number/boolean/directory/file，`sensitive` 值暂无法持久化）。`ui.surfaces` 可声明 UI 页面。`dependencies` 写作 `name@market`。
- **路径约束**：组件路径必须留在插件根内，逃逸即拒绝（本地 diagnosing-plugins pitfall 3）。
- **钩子变量**：`${CLAUDE_PLUGIN_ROOT}`/`${ZCODE_PLUGIN_ROOT}`、`${ZCODE_PLUGIN_DATA}`。
- **本地官方矛盾点**：本地 `diagnosing-plugins` 称 `agents` 字段「recorded but not executed」，但同版 `zcode-configuration-guide` 与官方 [PLUGIN_DEVELOPMENT.md](https://github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT.md) 均把 `agents/` 列为真实组件（「Bundle skills, commands, subagents, and MCP servers into one extension」，见 [zcode.z.ai/en/docs/subagents](https://zcode.z.ai/en/docs/subagents)），且本机 documents 插件（`documents\0.1.8\agents\visual-judge.md`，manifest 声明 `"agents": "agents"`）实际在用。**裁定：插件 agents 受支持，diagnosing-plugins 0.3.0 的表述疑为过时/笔误。**
- **市场与安装**：marketplace.json（`name` + `plugins[]`，source 支持 directory/github/git/url/file，**npm/pip 不支持**）。UI：Plugin Marketplace → Add；CLI：`zcode plugins marketplace add <path> --scope user`、`zcode plugins install/enable <id>`、`zcode plugins list --json`。启用状态存 `~/.zcode/cli/config.json` 的 `plugins` 键。
- 本机实例：`~/.zcode/cli/plugins/cache/zcode-plugins-official/`（github、documents、excalidraw、zcode-guide、plugin-creator 等）+ `claude-plugins-official/`（chrome-devtools-mcp、context7、playwright 等，即 Claude 插件生态直接兼容）。

### 2.2 技能（Skills）

来源：本地 `zcode-guide\...\diagnosing-skills\SKILL.md`、`zcode-configuration-guide\SKILL.md`。

- **格式**：目录 + `SKILL.md`，frontmatter 识别键为 `name`、`description`、`when_to_use`、`license`、`metadata`（扁平解析，缩进键忽略，多行用 `>`/`|`）。
- **硬性规则**：缺 `name`、缺 `description`、或 `description` >1024 字符 → 技能被丢弃；未知/畸形行被跳过（**推断**：pstack 的 `disable-model-invocation`/`icon`/`color`/`paths` 属未识别键，大概率被忽略而非导致丢弃，需实测验证）。
- **发现顺序**（先者胜，同名按路径身份 shadow 后者）：显式配置根 → `~/.zcode/skills` → `~/.agents/skills` → 工作区 `.zcode/skills`（逐级向上，深者胜）→ 工作区 `.agents/skills` → 已启用插件根（最低）。同级 `.zcode` 先于 `.agents`。跳过 `.` 开头目录（`.system` 除外）和 `node_modules`。
- **触发**：`name` + `description`（截断至 ~250 字符）+ `when_to_use` 呈现给模型自主决定；无关键词匹配器。`/` 菜单 Skills 组可显式调用。插件技能限定名 `plugin:skill`。
- **无 `disable-model-invocation` 等价物**：ZCode 未提供「仅显式调用」开关——语义差异见 §4。

### 2.3 斜杠命令（Commands）

来源：本地 `zcode-guide\...\diagnosing-commands\SKILL.md`。

- `.md` 文件，文件名即命令名（`^[a-z0-9][a-z0-9_:-]{0,63}$`），子目录以 `:` 拼接。frontmatter：`description`、`argument-hint`、`allowed-tools`、`model`、`skills`（自动挂载技能！）、`disable-noninteractive`。`$ARGUMENTS`/`$1` 占位符。发现顺序与技能一致，同名 first-match-wins。
- **与技能的区别**：命令是模板展开（一次注入），技能是模型按需加载的指令包。pstack 的技能在 ZCode 中既可走 `/` 菜单的 Skills 组，也可（可选）额外生成 commands 做参数模板。

### 2.4 子代理（Subagents / agents）

来源：[zcode.z.ai/en/docs/subagents](https://zcode.z.ai/en/docs/subagents)（官方）、本地 `~/.zcode/agents\deepseek-flash.md`、`documents\0.1.8\agents\visual-judge.md` 实例。

- **位置**：用户级 `~/.zcode/agents/<name>.md`（工作区级暂不支持）；插件经 manifest `agents` 字段贡献 `agents/*.md`。
- **frontmatter**：`name`/`description` 必填（缺失则忽略该文件）；`model`（模型 id，如 `deepseek/deepseek-flash`、`account:bigmodel-individual-coding-plan/GLM-5.3-Flash`）；`thoughtLevel`（仅与具体 model 同用时生效）；`color`；`tools`/`disallowedTools`（穷举，MCP 工具需全名 `mcp__<server>__<tool>`）；`maxTurns`；`injectAgentsMd`；`mcpServers`（声明即强依赖，未连接则调用失败）。**无 `is_background` 字段**——前台/后台是主 Agent 在 spawn 时的决策（后台结果异步回传）。
- **调度**：主 Agent 通过 Agent 工具启动；按 `description` 自动选择或聊天框 `@` 显式引用。内建 `general-purpose`（全工具）与 `Explore`（只读、不注入 AGENTS.md）。**禁止嵌套**：子代理不能再 spawn 子代理。修改在新会话生效。
- 本机另有 `bundled-agents/` 与 `agents\{claude-code,codex}` 目录（第三方 CLI 型子代理安装位）。

### 2.5 MCP

来源：本地 `zcode-configuration-guide\SKILL.md`、`diagnosing-mcp\SKILL.md`、[PLUGIN_DEVELOPMENT.md](https://github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT.md)。

- 用户级 `~/.zcode/cli/config.json` → `mcp.servers`（fallback `~/.agents/mcp.json` → `mcpServers`）；工作区 `<repo>/.zcode/config.json`（fallback `<repo>/.agents/mcp.json`）；插件 `.mcp.json`（自动命名空间为 `plugin:<name>:<server>`）。各作用域自动信任、自动连接。stdio 需换行分隔 JSON-RPC。`user_config.key` 可在 MCP 声明中引用。

### 2.6 Hooks

来源：本地 `zcode-guide\...\diagnosing-hooks\SKILL.md`。

- 恰好 7 个事件：`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、`PostToolUseFailure`、`Stop`。无 Slack/外部触发器。
- 配置文件 hooks 默认禁用（需 `hooks.enabled: true`）；插件 hooks（`hooks/hooks.json`）自动启用。matcher 为工具名正则（`Task`↔`Agent`、`Write`/`Edit`↔`ApplyPatch` 别名）。输出严格 JSON schema 或退出码（0 过 / 2 阻断）。`Stop` 钩子可让模型续跑最多 3 轮——**这是 Cursor `/loop` 的一个可造等价物**。

### 2.7 指令文件（AGENTS.md）

来源：本地 `zcode-configuration-guide\SKILL.md`。

- 用户级 `~/.zcode/AGENTS.md` 先注入，工作区 `<repo>/AGENTS.md` 后注入（可收窄覆盖）。`/init` 内建命令生成工作区文件。迁移时可从 `~/.claude/CLAUDE.md` 复制。**这是 Cursor `.mdc alwaysApply` 规则的最近等价物**（常驻上下文）。

### 2.8 `.agents/` 兼容层

ZCode 同时扫描 `~/.agents/skills`、`~/.agents/commands`、`~/.agents/mcp.json`（OpenAI/Codex 系的跨 agent 共享目录），优先级低于同名 `.zcode` 资源。本机 `~/.agents/skills/` 下有 100+ 个技能（baoyu 系列、remotion 系列等）确实被本会话加载（见本会话技能列表），验证了该机制。Cursor 同样读 `.agents/skills`（来源：[cursor.com/docs/skills](https://cursor.com/docs/skills)），**这是两个编辑器的共同交集层**。

### 2.9 动态工作流（ZCode 特有）

`CreateWorkflow`/`AmendWorkflow` 工具 + TypeScript 编排脚本 + `~/.zcode/workflows`（全局）与 `<repo>/.zcode/workflows/`（项目）保存，支持子代理扇出、类型化中间结果、后台运行。仅显式请求触发（`/workflow`）。来源：本机内置技能 `C:\Program Files\ZCode\resources\glm\packages\bundled-skills\skills\dynamic-workflows\SKILL.md`。pstack 的 orchestrate/autopilot playbook 理念上可映射到此机制（可选增强，非必需）。

### 2.10 ZCode 没有的 Cursor 机制

Custom Modes（技能常驻徽章）、`/loop` 内建循环、Cursor Rules（`.mdc` + alwaysApply + glob 规则系统）、Bugbot/agentic security review、Cursor Automations（Slack 触发、webhook routine、`/automate` 编辑器）、Cloud Agents 技能同步、notepads、`/create-skill` 内建、`cursor-team-kit` 生态。来源：本地 zcode-guide 全部 6 个技能文档中均无对应条目；Cursor 侧来源 [cursor.com/docs/skills](https://cursor.com/docs/skills)、`pstack\README.md`。

---

## 3. 逐项映射表（问题 4）

| # | pstack 组成部分 | 依赖的 Cursor 机制 | ZCode 等价物 / 替代方案 | 迁移判定 |
|---|---|---|---|---|
| 1 | 根 `plugin.json`（agent-plugins.org schema 元数据） | 标准 | 字段全部被 ZCode manifest 识别；但 ZCode 只探测 `.zcode-plugin/`（及 `.claude-plugin/`、`.codex-plugin/`），不探测根文件 | **改写（小）**：新增 `.zcode-plugin/plugin.json`，内容可基本照抄 |
| 2 | `.cursor-plugin/plugin.json` 的 `skills`/`agents` 指针、`category`/`tags`/`logo` | Cursor 清单 | ZCode manifest 同名 `skills`/`agents` 字段（建议去掉 `./` 前缀与尾斜杠，写 `"skills"`）；`category`/`tags`/图标移入 marketplace.json 条目（图标需 HTTPS URL） | **改写（小）** |
| 3 | 24 个 principle 技能 | 无（纯 prompt） | ZCode 技能格式完全兼容（name+description 满足；多余键被忽略*） | **1:1 平移** |
| 4 | 约 30 个工作流技能正文（unslop、tdd、bro、technical-writing 等） | 基本无 | 直接作为插件 skills | **1:1 平移**（个别 Task 措辞见 #8） |
| 5 | `disable-model-invocation: true`（53/54 技能） | Cursor：仅显式 `/` 调用 | ZCode 无此开关。技能仍可从 `/` 菜单 Skills 组显式调用，但模型也可能自动触发 | **语义降级可接受**：pstack 各 description 本身写明「runs only when you type /x」，可再加 `when_to_use: "Only when explicitly invoked..."` 强化；如需硬隔离可改为 commands |
| 6 | poteto-mode 的 `icon: crown`/`color: yellow` | Custom Mode 徽章 | 无对应 | **丢弃**（无害） |
| 7 | Option+Enter 使 poteto-mode 常驻全回合 | Custom Modes | 无直接对应。替代梯度：(a) 每条消息显式 `/poteto-mode`（技能可重复调用）；(b) SessionStart/UserPromptSubmit hook 注入 poteto-mode 摘要；(c) 把精简版写入 `~/.zcode/AGENTS.md`（全局常驻，但影响所有项目） | **体验降级，需方案设计** |
| 8 | `subagent_type: "poteto-agent"/"comment-sicko"`、`Task` 工具 + `run_in_background: true` + `readonly: true` + `model` 字段 | Cursor Task 工具 | ZCode Agent 工具 + 插件 `agents/*.md`（name/description 匹配或 `@` 引用）；后台为主 Agent spawn 时决策（无 is_background 字段）；只读用内建 `Explore` 或 `tools` 白名单；模型经 agent frontmatter `model`+`thoughtLevel` | **改造**：9 个文件中的 spawn 措辞需系统性替换（`subagent_type: "X"` → 「spawn the `X` subagent」类中性表述，双向兼容） |
| 9 | `agents\poteto-agent.md`（is_background + ~/.cursor/plugins 回退搜索） | Cursor 子代理 + 安装路径 | ZCode agent 格式兼容（去掉 is_background 即可）；正文 `~/.cursor/plugins/` 回退搜索改为 ZCode 插件缓存 `~/.zcode/cli/plugins/cache/*/<plugin>/<ver>/skills/poteto-mode/SKILL.md`，或直接改为「用父代理给出的绝对路径」 | **改造（小）** |
| 10 | `agents\comment-sicko.md` | 无 | 直接兼容 | **1:1 平移** |
| 11 | `~/.cursor/rules/pstack-models.mdc`（alwaysApply 规则，角色→模型映射） | Cursor Rules | 最近等价：`~/.zcode/AGENTS.md`（用户级常驻）或 `<repo>/AGENTS.md`（项目级）；格式从 .mdc frontmatter 变纯 markdown 小节 | **改造（中）**：setup-pstack 的写入目标与读写逻辑重定向 |
| 12 | 模型面板：grok-4.7-xhigh-fast / claude-opus-5-5-xhigh 及家族回退 | Cursor 多模型 | ZCode 模型体系不同（GLM-5.3 系、deepseek 等，subagent 用 `model` id + `thoughtLevel`）；`ListModels` 类能力需确认。多模型 diversity panel 仍可实现（不同 subagent 配不同 model），但默认 slug 全部失效 | **改造（大）**：默认表与 setup-pstack 检测/校验逻辑重写；短期内可全部默认 `inherit-parent` |
| 13 | 23 个 playbooks | 文件引用（相对路径） | 纯 markdown 读取，编辑器无关 | **1:1 平移**（bug-fix.md 等少数含「Cursor's /loop」措辞需清理） |
| 14 | poteto-mode `scripts/`（bun + commander，自举安装依赖） | 运行时 | ZCode Bash 工具可执行 bun/node；bootstrap.ts 逻辑编辑器无关 | **1:1 平移**（用户需装 bun；可加 node 兼容层） |
| 15 | `automations\benny\` | Cursor Automations（Slack 触发、`/automate`、`.cursor/settings.json`、api2.cursor.sh webhook） | **无对应**。可部分重造：ZCode hooks 仅 7 个会话内事件（无外部触发）；Slack 侧需自建轮询服务 + ZCode CLI（`zcode -p` 类无头调用）或动态 workflow | **做不了（1:1）**：标记不支持，或独立子项目重造 |
| 16 | `make-bot-ui`（api2.cursor.sh webhook routine） | Cursor webhook | 无对应；需换通用 webhook 方案 | **做不了/重写** |
| 17 | recall / reflect / automate-me / show-me-your-work 的会话转录挖掘（`~/.cursor/projects/<slug>/agent-transcripts/<uuid>.jsonl`） | Cursor 会话存储 | ZCode 会话数据在 `~/.zcode/projects/<hash>/`（fileHistory/snapshots，实测）；会话上下文检索有内建 `ReadSessionContext` 工具（sess_* ID / topic 策略）；无公开的逐消息 jsonl 约定 | **改造（大）**：4 个技能的挖掘逻辑需按 ZCode 存储重写，或降级为「基于 ReadSessionContext」 |
| 18 | create-verification-skill / maintain-verification-skill 写 `.cursor/skills/verify-<app>/` | Cursor 项目技能目录 | ZCode 工作区技能目录 `<repo>/.zcode/skills/`（或跨工具的 `.agents/skills/`） | **改造（小）**：路径替换 |
| 19 | automate-me 写 `.cursor/skills/<handle>-mode/`、读 `.cursor/skills/**` | 同上 | `<repo>/.zcode/skills/`、`~/.zcode/skills/`；依赖 Cursor 内建 `/create-skill` 的步骤改为按 ZCode SKILL.md 格式自行生成 | **改造（中）** |
| 20 | `AskQuestion` 工具名 | Cursor 工具 | `AskUserQuestion`（本会话工具列表确认存在） | **改写（小）**：名称替换 |
| 21 | `/add-plugin pstack` 安装 | Cursor 市场 | `zcode plugins marketplace add <dir-or-repo> --scope user` + `zcode plugins install pstack@<market>`，或 UI：Plugin Marketplace → Add → Install | **改写（小）**：安装文档 |
| 22 | `docs\guide\`（10 页指南） | 文档 | 直接可用；01-setup、02-poteto-mode 等含 Cursor 操作（Option+Enter、/add-plugin）需改写 | **平移+局部改写** |
| 23 | Cursor 内建引用：`/create-skill`、内建 babysit、`/loop`、Bugbot、cursor-team-kit（deslop/control-cli/control-ui） | Cursor 内建/生态 | 无对应。处理：删除引用或改为可选步骤；deslop 的「提交前清理」可用 Stop/PreToolUse hook 或 unslop 技能顶替；control-ui/control-cli 可用 ZCode 的 playwright/chrome-devtools/browser-use 插件近似（本机已装） | **改造**：poteto-mode 触发器清单需逐条修剪 |
| 24 | why 技能「inspect the `mcps/` directory Cursor exposes」 | Cursor MCP 发现 | ZCode：模型可看本会话已连接 MCP 工具（`mcp__*` 命名）；或读 `~/.zcode/cli/config.json` 的 `mcp.servers` | **改造（小）** |
| 25 | `assets\logo.png` | 市场图标 | marketplace.json 图标需 HTTPS URL；本地市场可省略 | **改写（小）** |

\* 标注「推断」的两处（未识别 frontmatter 键不致丢弃；根 plugin.json 不被探测）依据本地 diagnosing-skills/diagnosing-plugins 文档的失败模型推导，建议适配首日用一个最小插件实测确认。

---

## 4. 差距与风险清单（问题 5）

### 4.1 可 1:1 平移（低风险）

- 24 个 principle 技能、comment-sicko 子代理、playbooks、poteto-mode scripts、大部分单文件技能正文。
- 前提确认项（一次性实测）：(a) 带未知 frontmatter 键（`disable-model-invocation` 等）的 SKILL.md 在 ZCode 能正常加载；(b) `name: "Poteto Mode"`（带空格）不影响调用；(c) description 均 <1024 字符（抽查最长约 450 字符，达标）；(d) `.zcode-plugin/plugin.json` 中 `"skills": "skills"`（无 `./` 前缀）。

### 4.2 需改造（中风险）

1. **子代理 spawn 措辞**（9 文件）：`subagent_type:` 是 Cursor Task 工具参数。ZCode 的 Agent 工具按名称/描述选择子代理。改写为编辑器中立表述可同时兼容两端，也便于回贡上游。
2. **模型角色系统**（15 文件 + setup-pstack）：默认 slug 失效。建议适配版将全部角色默认改为 `inherit-parent`（省略 model 字段），把 `/setup-pstack` 重写为维护 `~/.zcode/AGENTS.md` 中一个 `## pstack models` 小节（或 `~/.zcode/agents/` 下每角色一个预设 agent 文件——ZCode agent 级 `model`+`thoughtLevel` 是比 Cursor 规则文件更贴近的载体）。
3. **常驻模式体验**：无 Custom Mode。短期用「每任务开头 `/poteto-mode`」（pstack 本来的主用法）；中期可用 UserPromptSubmit hook 在检测到 rigor 类关键词时注入提醒（有过度触发风险，需谨慎）；不建议写入全局 AGENTS.md（污染所有会话）。
4. **转录挖掘 4 技能**：ZCode 会话存储布局不同（哈希目录 + ReadSessionContext 工具）。可先降级实现（基于当前会话上下文），后续按 ZCode 开源仓库（[github.com/zai-org/ZCode](https://github.com/zai-org/ZCode)）确认 transcript 落盘格式后补全。
5. **落盘路径族**：`.cursor/skills/` → `.zcode/skills/`（或 `.agents/skills/` 双兼容）；`~/.cursor/rules/` → `~/.zcode/AGENTS.md`。
6. **Cursor 内建引用修剪**：poteto-mode 触发器清单中的 deslop/control-*/create-skill/`/loop`/Bugbot 条目需删除或替换（playwright/chrome-devtools 插件可顶 control-ui 的一部分）。

### 4.3 做不了 / 需重造（高风险）

1. **benny automations**：依赖 Cursor Automations 平台（Slack 触发、webhook routine、automations 编辑器）。ZCode hooks 无外部触发器。如需保留，须自建外部长轮询服务调用 ZCode CLI 无头模式——建议明确标记「v1 不支持」。
2. **make-bot-ui**：硬编码 `api2.cursor.sh` webhook。
3. **多模型 diversity panel 的默认值**：ZCode 可表达（agent 级 model），但默认面板（opus+grok）不存在，需用户自配模型才有「diversity」效果。
4. **`/loop` 自主长跑**：ZCode 无内建；Stop hook 的 3 轮续跑是弱等价物；更接近的是动态 workflow 的后台运行，但触发模型不同（显式请求）。
5. **Cloud Agents / notepads** 等 Cursor 平台特性：pstack 未深度依赖（grep notepad = 0），影响可忽略。

### 4.4 语义差异风险（易被忽略）

- ZCode 技能「first same-named wins」shadow 规则：pstack 技能名（如 `tdd`、`teach`、`unslop`、`interrogate`）与本机 `~/.zcode/skills/` 及 `~/.agents/skills/` 已有技能撞名（本机实测已有 `unslop`、`teach`、`tdd`、`interrogate`、`bro` 等同名技能！见 `~/.zcode/skills/`、`~/.agents/skills/` 目录列表）。**插件技能优先级最低，会被用户级同名技能 shadow**——适配后必须做撞名审计，必要时给 pstack 技能加 `pstack:` 前缀或引导用户清理。
- ZCode 子代理禁止嵌套：pstack 设计恰好符合（「Never spawn a poteto-agent to run the playbook itself」，来源 `pstack\README.md` L200），但若某 playbook 让 delegate 再派生 helper 会失效——审读 playbook 时需确认（抽查未发现嵌套 spawn 指令）。
- 插件技能正文中的相对路径引用（`../<name>/SKILL.md`、`playbooks/x.md`）：ZCode 插件安装后目录结构保持原样（本机官方插件缓存可证），相对引用继续有效；但 `poteto-agent` 的绝对路径回退搜索必须改。

---

## 5. 适配仓库结构设计方案（问题 6）

上游同步是硬约束：`pstack/` 是 `cursor/plugins` 的稀疏检出，理想状态是 `git merge upstream/main` 时零冲突。三个候选：

### 方案 A：生成式（保留 pstack/ 原样 + 构建脚本生成 ZCode 产物）

```
pstack-zcode/
├── pstack/                     # 上游稀疏检出，绝不修改
├── adapt/                      # 适配规则（全部知识集中于此）
│   ├── manifest.template.json  # .zcode-plugin/plugin.json 模板
│   ├── rules.md                # 逐文件的改写规则表（spawn 措辞、路径、模型默认）
│   └── overrides/              # 少数需要整文件重写的技能（setup-pstack、poteto-help）
├── build.mjs                   # 读取 pstack/ + adapt/ → 生成 dist/pstack-zcode/
│                               #   （复制 skills/agents + 应用文本替换 + 叠加 overrides
│   └                            + 生成 .zcode-plugin/plugin.json + marketplace.json）
└── dist/                       # 构建产物（本地市场根，可 gitignore 后由 CI 产出）
```

- 优点：上游 merge 零冲突（pstack/ 不动）；改写规则集中可审计可测试（可对 54 技能跑「Cursor 术语残留」lint）；可同时产出 Cursor/ZCode 双端。
- 缺点：多一步构建；调试时「改了没生效」的经典陷阱（需 watch/重装脚本）；dist 与源有漂移窗口。
- 适用：追求长期低维护跟随上游高频更新（pstack 上游活跃，0.15.x 迭代快）。

### 方案 B：双目录手工共存（pstack/ 与 zcode 版本两份）

```
pstack-zcode/
├── pstack/          # 上游只读参考
└── pstack-zc/       # 手工维护的 ZCode 插件（.zcode-plugin/ + skills/ + agents/）
```

- 优点：无构建、直接可读可改可调试；ZCode 原生安装。
- 缺点：54 个技能 × 上游高频变更 = 手工同步必然漂移、不可持续；两份真相源。
- 适用：只精选 5-10 个核心技能（poteto-mode + how/why/architect/tdd/unslop）做薄移植，放弃全量跟随。

### 方案 C：薄壳插件 + 覆盖层（本次调研发现的最优解，推荐）

利用两个 ZCode 原生机制：(1) 市场条目的 `source` 可直接指向 `pstack/` 目录；(2) 技能发现优先级「用户/工作区同名技能 shadow 插件技能」。

```
pstack-zcode/
├── pstack/                          # 上游稀疏检出
│   └── .zcode-plugin/plugin.json    # 唯一新增文件（上游无此路径，merge 永不冲突）
│                                    #   {"name":"pstack","skills":"skills","agents":"agents",...}
├── marketplace.json                 # 根市场：{"plugins":[{"name":"pstack","source":"./pstack",...}]}
├── overlay/                         # 覆盖层：只放必须改写的技能副本
│   └── .zcode/skills/…  或安装脚本投放到 ~/.zcode/skills/
│       （setup-pstack、poteto-mode、how、why、arena、swarm、interrogate、
│         reflect、recall、automate-me、show-me-your-work、poteto-agent 对应处理）
└── docs/research/                   # 本报告
```

工作方式：`zcode plugins marketplace add <repo>` 安装的 pstack 插件提供全部 54 技能 + 2 子代理（未改写的 41 个技能、comment-sicko 等直接生效）；`overlay/` 中约 12-15 个改写版技能以更高优先级 shadow 插件内同名原件；安装脚本（或工作区 `.zcode/skills/` 提交）完成投放。

- 优点：**上游同步成本趋近于零**（唯一新增文件 `.zcode-plugin/plugin.json` 不与上游任何路径冲突）；未改写技能永远跟随上游最新；改写面最小且集中在 overlay；无需构建系统。
- 缺点：覆盖是技能整文件粒度（上游更新该技能时 overlay 不会自动跟进，需人工 diff——可加一个脚本对比 overlay 与上游版本差异提醒）；`poteto-agent.md` 等子代理无法用 overlay 机制覆盖（ZCode 的 shadow 规则文档只覆盖技能/命令，子代理未见同名覆盖规则，需实测；不行则把 agent 改写版放进 `~/.zcode/agents/`）；「未识别 frontmatter 键不致丢弃」这一前提需先实测。
- 适用：本项目「不侵入 pstack/、便于 merge upstream」的既定目标。

### 方案对比一句话

- 跟随上游的完整性、自动化程度：A > C > B
- 实现与维护的简单度：C > B > A
- 对 pstack/ 的侵入度：C ≈ A（均不修改上游文件，C 加 1 个文件、A 加 1 个目录）< B（B 的第二份目录实质是 fork）
- 建议：**C 起步**（一两天可跑通全量安装），当 overlay 积累超过 ~15 个技能、人工同步开始疼时，**演进为 A**（把 overlay 规则化进构建脚本）；B 仅适用于「精选薄移植」这一降级目标。

### 上游同步操作（两方案通用）

```bash
git remote add upstream https://github.com/cursor/plugins.git   # 已配置则跳过
git fetch upstream main
git merge upstream/main          # pstack/ 内零冲突（C 方案下我们只加过 .zcode-plugin/）
# C 方案：跑 overlay-drift 检查脚本（对比 overlay/ 与 pstack/skills 同名文件差异）
# A 方案：重跑 build.mjs + 重新 zcode plugins marketplace update + install
```

上游 monorepo 结构的影响：pstack 在 `cursor/plugins` 根下是独立目录，稀疏检出 `pstack` + `docs` 即自洽（实测本仓库）；其依赖的 `cursor-team-kit` 在上游同仓另有目录，若将来要补 deslop 等价物，可将稀疏检出扩展出该目录再引用（但注意 ZCode 市场条目 source 指向 `./pstack`，不能逃逸到插件根之外，所以跨插件复用需各自复制或声明 dependencies）。

---

## 6. 结论摘要

1. pstack = 54 技能（24 原则 + 30 工作流）+ 2 子代理 + 23 playbook + 1 自动化包 + 10 页指南；约 70% 内容是编辑器无关的 Agent Skills 格式 prompt。
2. ZCode 插件格式与 Cursor 同源（agent-plugins/Claude 兼容线），`skills`/`agents` 组件字段直接对上；**唯一结构性缺口**是 `.cursor-plugin/` 清单目录不被 ZCode 探测——补一个 `.zcode-plugin/plugin.json` 即解决。
3. 真正的适配工作量集中在：模型角色系统（.mdc 规则→AGENTS.md/预设 agents + 默认改 inherit-parent）、子代理 spawn 措辞（9 文件）、转录挖掘（4 技能）、Cursor 内建引用修剪、同名技能 shadow 审计（本机已存在 unslop/teach/tdd 等冲突）。
4. 不可移植：benny automations、make-bot-ui（Cursor 平台硬依赖），建议 v1 明确标记不支持。
5. 仓库结构推荐方案 C（薄壳插件 + 覆盖层，利用 ZCode 技能优先级 shadow 机制），长期可演进为方案 A（生成式）。

---

## 附录：资料来源索引

### 本地一手资料（pstack 侧）

- `C:\Users\Administrator\Git\pstack-zcode\pstack\README.md` — 插件总说明、技能表、原则表、not-shipped 清单
- `C:\Users\Administrator\Git\pstack-zcode\pstack\plugin.json`、`pstack\.cursor-plugin\plugin.json` — 双清单
- `pstack\skills\poteto-mode\SKILL.md`（及 54 个技能 frontmatter 抽查）、`pstack\agents\{poteto-agent,comment-sicko}.md`
- `pstack\skills\setup-pstack\SKILL.md` — `.mdc` 规则写入逻辑
- `pstack\automations\benny\FOR_AGENTS.md`、`README.md` — Automations 依赖
- `pstack\docs\guide\01-setup.md`、`pstack\skills\poteto-mode\playbooks\bug-fix.md`、`pstack\skills\poteto-mode\scripts\package.json`
- 仓库 `AGENTS.md`、`README.md`（上游）、`.git/info/sparse-checkout`

### 本地一手资料（ZCode 侧）

- `C:\Users\Administrator\.zcode\cli\plugins\cache\zcode-plugins-official\zcode-guide\0.3.0\skills\{zcode-configuration-guide,diagnosing-skills,diagnosing-commands,diagnosing-hooks,diagnosing-mcp,diagnosing-plugins}\SKILL.md`
- `C:\Users\Administrator\.zcode\cli\plugins\cache\zcode-plugins-official\plugin-creator\0.1.1\skills\plugin-creator\{SKILL.md,references\plugin-json-spec.md}`
- 官方插件实例：`...\documents\0.1.8\.zcode-plugin\plugin.json` 与 `agents\visual-judge.md`、`...\github\0.1.2\.zcode-plugin\plugin.json`
- 用户配置实例：`~\.zcode\agents\deepseek-flash.md`、`~\.zcode\cli\config.json`（结构）、`~\.zcode\skills\`、`~\.agents\skills\`、`~\.zcode\projects\`
- `C:\Program Files\ZCode\resources\glm\packages\bundled-skills\skills\dynamic-workflows\SKILL.md`

### 网络来源

- [github.com/cursor/plugins](https://github.com/cursor/plugins) — Cursor 插件规范与 monorepo 结构
- [cursor.com/docs/skills](https://cursor.com/docs/skills) — Cursor 技能 frontmatter 字段、Custom Modes、技能目录（含 `.agents/skills` 兼容）
- [cursor.com/docs/plugin](https://cursor.com/docs/plugin) — Cursor 插件文档（404，经重定向验证入口）
- [agent-plugins.org](https://agent-plugins.org/) — Agent Plugins v1.0.0 开放标准（plugin.json/skills/mcp.json 布局）
- [github.com/zai-org/ZCode](https://github.com/zai-org/ZCode) — ZCode 开源仓库（Apache-2.0，TypeScript monorepo）
- [zcode.z.ai/en/docs/subagents](https://zcode.z.ai/en/docs/subagents) — ZCode 子代理官方文档（frontmatter 字段、禁止嵌套、用户级 only）
- [github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT.md](https://github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT.md) — ZCode 插件开发权威教程（manifest 字段、marketplace、CLI、hooks 变量）
- [zcode.z.ai](https://zcode.z.ai/en) — ZCode 官网
- [x.com/poteto — How I Use Cursor](https://x.com/poteto/article/2058975157503570132) — 作者对 pstack 的自述
- [flaviocopes.com/pstack](https://flaviocopes.com/pstack)、[firecrawl.dev/blog/best-cursor-plugins](https://www.firecrawl.dev/blog/best-cursor-plugins) — 第三方分析/热度佐证
