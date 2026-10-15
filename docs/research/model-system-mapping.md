# pstack 模型角色系统 → ZCode 适配研究（逐文件、逐行引用）

日期：2026-10-15。研究对象：本仓库 `pstack/`（pstack v0.15.24，`.cursor-plugin/plugin.json` version 字段）与 ZCode（github.com/zai-org/ZCode，本机 `C:\Users\Administrator\.zcode\`）。

来源标注约定：

- `pstack/...:L12` = 本仓库 pstack 目录下文件的行号（一手引用，本次逐文件核过）。
- `[ZDocs-subagents]` = https://zcode.z.ai/en/docs/subagents （2026-10-15 抓取）。
- `[ZDocs-config]` = https://zcode.z.ai/en/docs/configuration （2026-10-15 抓取）。
- `[本机]` = 本机文件实地读取。
- `[宿主事实]` = 本会话宿主提供的系统提示/工具 schema（任务方明确许可直接引用）。
- `[需实测]` = 文档未覆盖、本会话无法验证的事实。

---

## 第一部分 pstack 模型系统全量解剖

### 1.1 配置载体：`~/.cursor/rules/pstack-models.mdc`

- 写入者只有一个技能：`/setup-pstack`。`pstack/skills/setup-pstack/SKILL.md:8`：「Write `~/.cursor/rules/pstack-models.mdc`, an always-applied rule that sets pstack's model per role.」
- 文件格式（`setup-pstack/SKILL.md:41-66`）：`.mdc` 规则文件，frontmatter 含 `description` + `alwaysApply: true`，正文是一行 `# budget: <label> (effort)` 加一行一个角色：
  ```
  ---
  description: pstack per-role model choices (overrides skill defaults)
  alwaysApply: true
  ---
  # pstack model configuration. One line per role. Delete a line to fall back to the skill default.
  # `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit Task `model`). Alias entries in a panel list still count toward its fan-out.
  # budget: large (xhigh)
  feature, refactoring: grok-4.7-xhigh-fast
  ...
  ```
- 覆盖语义（`README.md:262`）：「every skill reads it and falls back to sensible defaults when the rule is absent, so you override only what you want.」
- 幂等与陈旧默认（`README.md:264`）：「when a default changes, a rule written before the change still pins the old default. delete those role lines, or delete the file, then run `/setup-pstack` again. a rerun keeps any role whose model differs from the default.」
- 生效时机（`setup-pstack/SKILL.md:70`、`poteto-help/SKILL.md:136`）：写入后对新会话生效（「applies to new sessions」/「The rule from `/setup-pstack` applies to new chats. Start one.」）。
- 退役角色清理（`setup-pstack/SKILL.md:18`）：读旧文件时，「A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it.」

### 1.2 /setup-pstack 交互流程（`setup-pstack/SKILL.md` 全文归纳）

1. **检测可用模型**（L14）：「Enumerate the model slugs you can pass to a `Task` subagent in this session. That is the dependable source.」若 Cursor 暴露 models API/CLI 则优先；检测不到就请用户粘贴；「Never write a real slug you have not confirmed is available. The aliases `inherit-parent` and `auto` are always valid even though they are not detected slugs.」
2. **载入现状**（L18）：以步骤 5 的规则形状为默认；已有文件则读其 `# budget` 行与角色值。
3. **budget → 角色 → 确认**（L22-31）：
   - budget 四选一（AskQuestion，标签逐字固定）：`unlimited — max reasoning` / `large — xhigh reasoning` / `medium — high reasoning` / `small — medium reasoning`；无规则时明说 `large` 即技能默认。
   - 应用规则（L29，精确逻辑）：「`unlimited`, `large`, `medium`, and `small` set the effort token of every real slug, panel entries included, to `max`, `xhigh`, `high`, or `medium`. The effort token is the last token, or the one before a trailing `fast`, on the ladder `max` > `xhigh` > `high` > `medium` > `low`. If the result is not a detected slug, use the same family's detected slug with the highest effort at or below the target, else mark the role as needing a choice. `inherit-parent` and `auto` do not change.」例：`unlimited` 把 `claude-opus-5-5-xhigh` 变 `claude-opus-5-5-max`；Grok 顶格 `xhigh` 故不变；`small` 变 `claude-opus-5-5-medium` 和 `grok-4.7-medium-fast`。
   - 确认（L31）：展示全部角色、标出非检测集的真实 slug；提供检测到的模型加 `inherit-parent`/`auto`（「both mean: this role runs on the parent chat model, which is how Auto users stay on Auto」）。面板角色（arena runners、architect runners、interrogate reviewers）的值是列表，「one subagent runs per entry, alias entries included, so the list length sets the count」；`arena cross-judge pool` 也是列表但只从中选一个（尽量异于父模型家族）；`swarm workers` 是所有 worker 的默认，race/对比可为每臂另指定。
4. **校验**（L35）：「Every real slug written must be in the detected set. `inherit-parent` and `auto` always pass. If a chosen real slug is not available, stop and ask again.」
5. **写文件**（L39）：整文件覆写保持幂等。
6. 确认告知（L70）。
7. 可选推销 `/create-verification-skill`（L74）。

### 1.3 完整角色清单（`setup-pstack/SKILL.md:49-65` 的 17 行）

| # | 角色行 | 默认值 | 类型 | 消费方（读取处） |
|---|--------|--------|------|------------------|
| 1 | `feature, refactoring` | `grok-4.7-xhigh-fast` | 标量 | `poteto-mode/SKILL.md:95`；playbooks `feature.md:12`、`refactoring.md:11`（"configured feature/refactoring model (default `grok-4.7-xhigh-fast`)"） |
| 2 | `bug-fix` | `grok-4.7-xhigh-fast` | 标量 | `poteto-mode/SKILL.md:95`；`bug-fix.md:9` |
| 3 | `perf-issue` | `grok-4.7-xhigh-fast` | 标量 | `poteto-mode/SKILL.md:95`；`perf-issue.md:17` |
| 4 | `hillclimb` | `grok-4.7-xhigh-fast` | 标量 | `poteto-mode/SKILL.md:95`；`hillclimb.md:12` |
| 5 | `judgment and prose` | `claude-opus-5-5-xhigh` | 标量 | `poteto-mode/SKILL.md:95`（「Prose and judgment read `judgment and prose`」） |
| 6 | `hardest tasks` | `claude-opus-5-5-xhigh` | 标量 | `poteto-mode/SKILL.md:95`（「the hardest changes read `hardest tasks`」） |
| 7 | `how explorer` | `grok-4.7-xhigh-fast` | 标量 | `how/SKILL.md:11` |
| 8 | `how explainer` | `claude-opus-5-5-xhigh` | 标量 | `how/SKILL.md:11` |
| 9 | `why investigators` | `grok-4.7-xhigh-fast` | 标量 | `why/SKILL.md:49` |
| 10 | `why synthesizer` | `claude-opus-5-5-xhigh` | 标量 | `why/SKILL.md:79` |
| 11 | `reflect tooling` | `grok-4.7-xhigh-fast` | 标量 | `reflect/SKILL.md:32` |
| 12 | `reflect judgment, divergent, synthesizer` | `claude-opus-5-5-xhigh` | 标量（一行供 3 个 reviewer + synthesizer 共用，`reflect/SKILL.md:31,33,39`） | `reflect/SKILL.md:27,39` |
| 13 | `swarm workers` | `grok-4.7-xhigh-fast` | 标量（race 可按臂覆盖） | `swarm/SKILL.md:25`；`multi-phase-plan.md:13`（验证 lane）；`poteto-mode/SKILL.md:97`（验证固定用此角色） |
| 14 | `arena runners` | `claude-opus-5-5-xhigh, grok-4.7-xhigh-fast` | 列表（每项一个 runner） | `arena/SKILL.md:17` |
| 15 | `arena cross-judge pool` | `claude-opus-5-5-xhigh, grok-4.7-xhigh-fast` | 列表（只选一个，异家族优先） | `arena/SKILL.md:28` |
| 16 | `architect runners` | `claude-opus-5-5-xhigh, grok-4.7-xhigh-fast` | 列表 | `architect/SKILL.md:31`（明确「in place of the `arena runners` line」） |
| 17 | `interrogate reviewers` | `claude-opus-5-5-xhigh, grok-4.7-xhigh-fast` | 列表（Reviewer A/B 表格默认，`interrogate/SKILL.md:29-32`） | `interrogate/SKILL.md:27,34` |

角色-模型哲学（`README.md:30`）：「the mode splits work by model strength: code delegates (feature, refactoring, bug fix, perf, hillclimb) go to grok, while the hardest changes, prose, and judgment go to opus 5.5. the default panel is opus 5.5 / grok.」

按难度分层（`poteto-mode/SKILL.md:95`）：「Code delegates tier by difficulty. The hardest changes (cross-cutting design, gnarly concurrency, subtle algorithms) go to your strongest judgment model (`claude-opus-5-5-xhigh`)… Trivial mechanical edits go to your fast code model.」

### 1.4 家族回退链的精确逻辑（原文引用）

主表述在 `arena/SKILL.md:17`（architect/interrogate 各有变体）：

> If the Task tool rejects a configured entry, run that seat on its family's default and say so. Families go by prefix: `claude-*`, and `grok-*` with `cursor-grok-*` and `composer-*`. A refused `composer-*` entry runs on `grok-4.7-xhigh-fast`. With no family match, use `claude-opus-5-5-xhigh`. If it rejects a default, use the closest valid slug of the same family from its error message.

变体：

- `interrogate/SKILL.md:36`：composer-* 被拒 → Reviewer B 的默认；无家族匹配 → Reviewer A 的默认；默认被拒 → 用错误信息里合法 slug 中最接近者（同家族同档优先），并「open a separate PR to update the default table. Do not block the review on the slug issue. Never treat an alias entry as a rejected slug or apply either fallback to it.」
- `how/SKILL.md:11`、`why/SKILL.md:11`、`reflect/SKILL.md:27`、`swarm/SKILL.md:25`：统一句式「If the Task tool rejects a slug, use the default and say so. If it rejects the default, use the closest valid slug of the same family from its error message.」

即三级回退：配置项被拒 → 该家族默认 → 家族内最接近合法 slug（依据错误信息）。别名项（`auto`/`inherit-parent`）永不进回退。

### 1.5 spawn 时按作业调档（`poteto-mode/SKILL.md:97`，逐句）

> Before each spawn, start from the role's line or default and pick the reasoning level and speed the job needs. The `/setup-pstack` budget sets each role's starting level, xhigh by default. Raise it one step, up to max, for the hardest or subtlest work. Lower it one step for judgment and two or more steps for routine work. Use fast mode only when the job is urgent, meaning CI or trunk is red or a person is blocked on the result right now. Otherwise use standard speed, the same slug without `-fast`. Verification is the exception and stays on the `swarm workers` model and speed (`grok-4.7-xhigh-fast` by default). Change only the effort level and whether the slug is fast, and keep the family the role names, so a diverse panel stays diverse. If the family has no slug at that level and speed, use its nearest slug. A role on `auto` or `inherit-parent` stays on the parent model. If the Task tool rejects the adjusted slug, do not try another adjusted slug. Use the role's line or default and say so.

要点：调档只动 effort token 和 `-fast` 后缀、不动家族；家族内无该档该速则用最近 slug；调整后的 slug 被拒不二次调整、回落到角色行/默认。

### 1.6 `inherit-parent` / `auto` 的语义（pstack 侧定义）

`docs/guide/01-setup.md:29`（最完整）：

> Set a role to `inherit-parent` or `auto` and pstack omits the subagent `model` field, so the subagent inherits your parent chat model. Both values mean the same thing, and neither is a model slug.

- 「which is how Auto users stay on Auto」（`setup-pstack/SKILL.md:31`）——"Auto" 是 Cursor 的模型自动路由特性。
- 面板列表中的别名项仍占一个 fan-out 名额（`setup-pstack/SKILL.md:47` 注释行、L31）。
- 省钱的解释（`poteto-help/SKILL.md:43`）：「A role set to `auto` or `inherit-parent` runs on the chat's model, which saves tokens when the chat runs on Auto or a cheaper model. A shorter panel list runs fewer subagents, one for each entry.」
- 陷阱条目（`docs/guide/10-recipes-and-pitfalls.md:150`）：「**Treating `auto` as a model slug.** `auto` and `inherit-parent` mean "omit the model field so the subagent inherits the parent chat model."」

### 1.7 Task spawn 参数全景（模型相关）

统一默认（`poteto-mode/SKILL.md:95`）：「`run_in_background: true`, agent mode (readonly strips MCP), file pointers not inlined context, explicit model per role」。

| 参数 | 取值与出现处 |
|------|--------------|
| `model` | 角色 slug；`auto`/`inherit-parent` 时省略（`poteto-mode/SKILL.md:95`、`how:11`、`why:11`、`reflect:27`、`swarm:25`、`interrogate:34`、`arena:17`） |
| `subagent_type` | playbook 内部委派与 ad-hoc 帮手一律 `"poteto-agent"`（`poteto-mode/SKILL.md:93`）；路由技能自定：how/why/reflect/swarm/interrogate/arena 用 `generalPurpose`（`how:11`、`why:13`、`reflect:25,39`、`swarm:30`、`interrogate:34`）；no-comments 用 `"comment-sicko"`（`no-comments/SKILL.md:19`）。规则：「Routed workflow skills… set their own `subagent_type` for diverse-model review. Respect what the skill prescribes, don't override to `poteto-agent`.」（`poteto-mode/SKILL.md:93`） |
| `run_in_background` | 默认 true（`poteto-mode/SKILL.md:95`；`arena:22`、`swarm:30` 显式重申） |
| `readonly` | 探索/评审类 true（`how:11`、`interrogate:34`、arena cross-judge「readonly judge」`arena:28`）；需要 MCP 的为 false（`why:13`「Do not use readonly/Ask mode. It strips MCP access」；`reflect:25`「Reviewers need MCP access… and readonly strips MCPs」） |
| `environment` | swarm 用 `"cloud"`（`swarm:30`），仅 worker 需要本机资源时 `"local"`；非默认分支起跑传 `cloud_base_branch`（`swarm:32`） |
| 嵌套 | orchestrate 允许 sub-coordinator 再 spawn，「nesting works to depth 3, and a nested spawn has the full Task schema including `environment`」（`orchestrate.md:16`） |

### 1.8 `agents/poteto-agent.md` 与 `agents/comment-sicko.md`

- `poteto-agent.md:1-6` frontmatter 仅 4 键：`name: poteto-agent`、`description`（长段，说明它是 `/poteto-mode` 运行期的委派包装、要先整读 poteto-mode SKILL.md）、`is_background: true`（L4）。**无 `model` 键**——模型由父级 spawn 时按角色传入。
- 正文（L8-）要求：找不到路径时搜 `~/.cursor/plugins/` 下 `skills/poteto-mode/SKILL.md`，多副本取 `.cursor-plugin/plugin.json` version 最高者（L10）。
- `comment-sicko.md:1-4` frontmatter 只有 `name` + `description`，同样不钉模型；由 `no-comments/SKILL.md:19` 以 `subagent_type: "comment-sicko"` 调起。
- README 定位（`README.md:200,202,204`）：poteto-agent 是 delegate 包装，「substituting `generalPurpose` skips that read and drifts」；comment-sicko 是只读评论评审员，通常经 `/no-comments` 调用。

### 1.9 机制解释类引用（不改代码但要随适配改写文案的位置）

- `poteto-help/SKILL.md:27`（缺规则文件=未跑过 setup，全角色默认）、L30-33（主动询问 setup）、L38（setup 步骤描述）、L43（省钱建议）、L45（pstack 依赖 Cursor 子代理/Custom Mode 的自我声明）、L57（`subagent_type: "poteto-agent"` 用法）、L136（模型规则对新会话生效）。
- `docs/guide/01-setup.md:23,25,27,29,39,45,46`；`docs/guide/04-design.md:31,69`（多家族评审的意义）；`docs/guide/07-overnight.md:68`（show-me-your-work 的跨模型评审）；`docs/guide/10-recipes-and-pitfalls.md:150`。
- `README.md:11`（多模型哲学）、L25、L30、L129、L262-264。
- `orchestrate.md:98`：「Tool-error, retry on a different model.」（运行期按模型重试的唯一直接引用）
- `eval.md:20`（arena Phase B 多模型并行）；`multi-phase-plan.md:7,13`；`figure-it-out/SKILL.md:31` 与 `no-comments/SKILL.md:19`、`blast-radius/SKILL.md:38`（只引用调档规则或 arena，不直接持有默认 slug）。

### 1.10 pstack 侧小结

模型系统的全部状态在一个用户级文件（`pstack-models.mdc`），全部决策发生在 spawn 时（父代理读表→调档→传 `model` 或省略），全部回退在 prompt 里写成三级规则（配置项→家族默认→家族内最近合法 slug）。子代理文件本身不钉模型（除 `is_background` 外无模型字段）。这套「运行时读表 + spawn 参数覆盖」架构是适配的关键参照。

---

## 第二部分 ZCode 模型能力全量解剖

### 2.1 子代理定义文件 frontmatter（`~/.zcode/agents/<name>.md`）

`[ZDocs-subagents]` 逐字段：

- `name` / `description`：必填，「A file missing either is ignored, with a diagnostic.」
- **`model`**：「A specific model id; inherit or omitting it follows the primary Agent's current model.」
- **`thoughtLevel`**：「Reasoning level (e.g. high). Only takes effect together with a specific model, and the value must be a level that model supports.」并警告键名不是 `reasoningEffort`，未识别键被静默忽略。
- `tools` / `disallowedTools`：省略或 `*` 则继承主会话全部工具（含 MCP）；自定义列表为穷举，MCP 工具须写全名 `mcp__<server>__<tool>`（通配符被忽略）。
- `maxTurns`、`injectAgentsMd`（默认开；内建 Explore 不注入）、`mcpServers`（声明即强依赖，未连接调用立即失败）。
- 文件位置：「ZCode writes the subagent as a Markdown file under `~/.zcode/agents/<name>.md`」；Settings 的项目级创建「is not available yet」。
- **文档未记载** `permissionMode`、`is_background`、`providerId/modelId` 复合格式；但本机文件实证了前两者中的 `permissionMode`（见下）。`is_background` 无此字段（上一轮研究结论一致，且文档说后台是 Agent 的调用决策，见 2.2）。

本机实例：

- `[本机] C:\Users\Administrator\.zcode\agents\deepseek-flash.md:1-9`：`model: deepseek/deepseek-flash`、`thoughtLevel: max`、`permissionMode: bypassPermissions`、`injectAgentsMd: true`——`permissionMode` 字段实际存在（文档未载，[需实测] 其完整合法值）。
- `[本机] C:\Users\Administrator\.zcode\agents\vision.md:1-8`：`model: "custom:account%3Abigmodel-individual-coding-plan:GLM-5.3-Flash"`——自定义 provider 的 URL 编码写法实例。
- `[本机]` 插件代理 `C:\Users\Administrator\.zcode\cli\plugins\cache\zcode-plugins-official\documents\0.1.8\agents\visual-judge.md:1-8`：`model: account:bigmodel-individual-coding-plan/GLM-5.3-Flash`、`thoughtLevel: max`、`tools: [Read, Bash]`——**providerId/modelId 复合格式的官方实例**。
- `[本机]` 插件可携带 agents：documents 插件 `.zcode-plugin/plugin.json` 含 `"agents": "agents"`；配置指南 `[本机] zcode-guide/0.3.0/skills/zcode-configuration-guide/SKILL.md:34`：「A plugin contributes skills, commands, hooks, MCP servers, and agents」；L77：manifest 位于 `.zcode-plugin/plugin.json`，兼容名 `.claude-plugin/` 与 `.codex-plugin/`（**未列 `.cursor-plugin/`**——pstack 的 manifest 目录名是否被识别 [需实测]）。
- `[本机]` documents 与 pdf 两个插件都带 `agents/visual-judge.md`（同名）——插件间同名代理的优先级 [需实测]。

### 2.2 主会话 spawn 与后台

- `[ZDocs-subagents]`：主代理经 Agent 工具启动子代理；前台多个并行、主任务等待全部返回；后台「the main task doesn't wait and can keep going」，结果自动回到主对话；「Background execution is the Agent's call」——**没有面向用户的 background 开关字段**。「a backgrounded Explore subagent has read-only tools only」（内建 Explore 即只读探索代理）。
- 选取方式：「you can let the Agent pick the subagent automatically [按 description], or reference it with @ in the chat box.」
- `[宿主事实]` 本机主会话的 Agent 工具带 `subagent_type` 与 `run_in_background` 参数（任务方许可引用）；`model` 参数覆盖见 2.4 的旁证与 [需实测] 项。
- 嵌套限制：`[ZDocs-subagents]`「Subagents cannot spawn subagents of their own」——**深度 1**（对比 orchestrate 的 depth 3，`orchestrate.md:16`）。
- 热重载：「Changes require a new session (no hot-reload), except switching the primary session's model — subagents without an explicit model "follow the new model immediately on subsequent calls."」——省略 model 的子代理动态跟随主会话换模，这一条正是 pstack `inherit-parent` 想要的语义。

### 2.3 模型编址、reasoning 档位与会话模型

- `[ZDocs-config]`：模型 id 是 provider 各自的字符串（如 DeepSeek `deepseek-chat, deepseek-reasoner`；Kimi `kimi-k3 / k3 / k3-256k`），在 Settings → Model Settings 手工添加；可用与否「depend on your account permissions and the model list returned by the provider」。内建 provider：BigModel（国内）、Z.ai（国际），各含 GLM-5.3 与 GLM-5.3-Flash；可加 Anthropic、OpenRouter、Moonshot、OpenAI、MiniMax、MiMo 及 Anthropic/OpenAI 兼容自定义 provider。
- reasoning 档位按模型各异（`[ZDocs-config]` 原文数字）：GLM-5.3 `low / high / max`（默认 max）；GLM-5.2 `nothink / high / max`；GPT 系 `low / medium / high / xhigh`（默认 medium）；Claude 系 `low / medium / high / xhigh`（Opus 4.7 另支持 `max`，默认 medium）；Kimi K3 `low / high / max`；DeepSeek V4 `high / max`；其他自定义模型「a simple on/off toggle, or no levels at all」。
- 会话模型由用户选择：`[ZDocs-config]`「choose the channel from the model selector in the chat box」——代理不可改主会话模型。
- **模型目录的两种运行时编址格式**（`[宿主事实]`，本会话工具 schema 原文）：ListModels——「Each row's `id` (`providerId/modelId`) pastes verbatim into the `subagent_model` field… Append `$<level>` to pick a reasoning level from that row's `reasoningLevels`」「The model the session is on right now is marked `[current]` — **setting the subagents to that one is the same as omitting the field**」「A row marked `disabled` cannot be used」；CreateWorkflow `subagent_model`——「(`providerId/modelId` or a model id)」。

### 2.4 ListModels 实测（重要负结果）

本会话实际调用 ListModels 返回（`[宿主事实]`，2026-10-15）：

> model_catalog_unavailable: this session cannot list models — the host did not provide a model catalog. This is a capability gap, not an empty configuration. Omit `subagent_model` on CreateWorkflow and AmendWorkflow; the workflow's subagents will run on the session model.

结论：**ListModels 是随会话/宿主而定的能力，不能作为 setup 检测的唯一依赖**。检测的降级链必须内建设计。

### 2.5 本机模型目录文件（检测的备用数据源）

`[本机] C:\Users\Administrator\.zcode\v2\model-providers.json`：数组，每项含 `id`（如 `builtin:bigmodel`、`builtin:zai`）、`name`、`endpoints`（anthropic/openai/gemini）、`models`（字符串数组，如 `glm-5.1`、`glm-4.7`…）、`modelSupportedFormats`、`providerMappings`、`apiKey`（敏感，勿入报告正文/勿由 setup 复述）。`[本机] ~/.zcode/v2/setting.json` 存 provider 连接方式与界面偏好，`~/.zcode/cli/config.json` 只有 `plugins` 与 `mcp` 两个顶层键。注意：`model-providers.json` 反映**配置过的 provider 与模型**，不等于 entitlement；`[需实测]` 它与 ListModels 输出的一致性。

### 2.6 常驻配置载体选项（`[本机] zcode-configuration-guide/SKILL.md`）

| 载体 | 位置与生效范围 | 加载时机 | 关键行 |
|------|----------------|----------|--------|
| 用户指令 `~/.zcode/AGENTS.md` | 全部工作区 | 会话启动注入主上下文；因子代理默认 `injectAgentsMd`，也进子代理（`[ZDocs-subagents]`） | L23、L43-46（先用户后工作区，工作区可收窄） |
| 工作区指令 `<repo>/AGENTS.md` | 单仓库、可版本化 | 同上，后于用户文件 | L24、L46 |
| 插件（skills/commands/hooks/MCP/agents） | 启用即全局 | 插件安装/启用；改动需新会话（子代理热重载规则 `[ZDocs-subagents]`） | L34、L77 |
| 预设 agents `~/.zcode/agents/*.md` | 用户级全部会话 | 新会话加载（无热重载） | `[ZDocs-subagents]` |
| 普通数据文件（任意路径 markdown/json） | 无内置语义 | 技能运行时用 Read 读 | ——（pstack 技能本就如此读 .mdc） |

### 2.7 ZCode 与 pstack 机制的能力差距清单（适配必须面对）

| pstack 机制 | ZCode 状态 | 处置 |
|--------------|------------|------|
| effort 编码进 slug（`claude-opus-5-5-xhigh`、`grok-4.7-xhigh-fast`） | model id 与 `thoughtLevel` 分离 | 映射反而更干净：budget → thoughtLevel |
| `-fast` 速度后缀（`grok-4.7-xhigh-fast`） | 无对应概念 | **丢失**，文档明示放弃（或映射为"换更快的模型"由 setup 配置） |
| slug 家族前缀（`claude-*`、`grok-*`+`cursor-grok-*`+`composer-*`） | 无内置家族；`providerId` 前缀（`deepseek/`、`builtin:bigmodel`、`account:…`）可作弱家族 | 回退链重写（见方案） |
| Task 拒绝 slug 后从错误信息挑最近合法 slug | Agent 工具错误是否枚举合法模型 [需实测] | 回退终点改为「omit model + 声明」 |
| `environment: "cloud"`、`cloud_base_branch`（swarm L30/L32） | 无云子代理 | 丢失；swarm 改全本地后台 spawn |
| Task 嵌套 depth 3（orchestrate L16） | 深度 1（`[ZDocs-subagents]`） | orchestrate/autopilot 需结构重设计（超出本文档范围，仅记约束） |
| `is_background: true`（poteto-agent L4） | 无此字段；后台由 spawn 时 `run_in_background` 决定 | 删字段，spawn 语义照搬 |
| Custom Mode（poteto-help L53-55） | 无；靠每任务 `/poteto-mode` 或 AGENTS.md 常驻 | 文案改写 |
| "Auto" 用户（setup L31） | 无 Auto 概念；有 `[current]` 会话模型 | 文案改写为"会话模型" |
| 规则文件对新会话生效 | agent 文件/AGENTS.md 同为新会话生效；**spawn 参数即时生效** | 语义兼容，方案 C 更优 |

---

## 第三部分 概念映射总表

| pstack | ZCode 对应 | 来源 |
|--------|-----------|------|
| `~/.cursor/rules/pstack-models.mdc`（alwaysApply 规则） | 无 Rules 机制；候选载体见三方案 | `[ZDocs-subagents]` 无此概念 |
| 角色行 slug 值 | `providerId/modelId`（或裸 model id）+ 可选 `thoughtLevel` | `[宿主事实]` CreateWorkflow/ListModels schema；`[本机]` visual-judge.md:5-6 |
| `auto` / `inherit-parent` → 省略 Task `model` | 省略 `model`（frontmatter 或 spawn 参数）→ 「follows the primary Agent's current model」，且主会话换模后即时跟随 | `[ZDocs-subagents]` 原文两处 |
| budget 改 slug 的 effort token | 设 `thoughtLevel`（各模型档位不同，按 `[ZDocs-config]` 表取最近合法档） | `[ZDocs-config]` |
| `subagent_type: generalPurpose` | 无钉模型的通用子代理（省略 model 的预设 agent，或主会话默认子代理） | `[ZDocs-subagents]` |
| `subagent_type: poteto-agent` | 插件 `agents/poteto-agent.md`（ZCode 插件 agents 组件） | `[本机]` plugin.json `"agents"` 字段实证 |
| `subagent_type: comment-sicko` | 同上 | 同上 |
| `run_in_background: true` | Agent 工具 `run_in_background` | `[宿主事实]` |
| `readonly: true` | 内建 Explore（只读）或 `tools: [Read, …]` 白名单 | `[ZDocs-subagents]` |
| 家族回退三级链 | 重写为：被拒 → 同 provider 前缀已配置模型 → omit model（inherit）+ 声明 | 本文方案 |
| 「规则对新会话生效」 | agent 文件改动新会话生效；spawn 参数即时 | `[ZDocs-subagents]` |

---

## 第四部分 三个适配方案

三方案共用的前置事实：所有方案都必须改仓库内同一批文件（见 4.4 冲突面）；差异在**角色表的载体**与**模型指定的传递路径**。

### 4.0 共通默认策略（不配置时）——先定死

**默认 = 全角色 `inherit-parent`（spawn 时省略 model）。** 依据：

1. ZCode 文档原句保证省略即继承且动态跟随（`[ZDocs-subagents]`：「inherit or omitting it follows the primary Agent's current model」+ 换模即时跟随条），与 pstack `inherit-parent` 定义（`docs/guide/01-setup.md:29`）逐语义对齐。
2. pstack 无配置时默认是**硬编码双模型**（opus+grok），这在 ZCode 不成立（默认 slug 全部失效，上一轮研究同结论）；单模型用户零配置可跑是硬约束。
3. 代价：无配置时 arena/interrogate/reflect 面板退化为**同模型并行**，多样性收益归零——如实写进技能文案（interrogate 的价值主张本来是「The adversarial signal comes from model diversity, not assigned personas」，`interrogate/SKILL.md:9`），并在 setup/poteto-help 引导用户配第二个模型恢复 diversity。

### 4.1 方案 A：角色表写入 `~/.zcode/AGENTS.md` 的标记小节

**载体**：用户指令文件中的一段可幂等替换的小节，用 HTML 注释定界（AGENTS.md 是纯 markdown，无 frontmatter 语义）。

**示例文件内容**（`/setup-pstack` 产出，仅替换定界符之间内容，文件其余部分不动）：

```markdown
（用户原有内容……）

<!-- pstack-models:start v1 -->
## pstack models

One line per role. Delete a line to fall back to the default (`inherit-parent`).
A value is `<providerId/modelId>` optionally followed by `@<thoughtLevel>` (e.g. `deepseek/deepseek-chat@max`),
or `inherit-parent` (omit the spawn `model` parameter). Panel roles take a comma-separated list;
one subagent runs per entry.

- budget: large (thoughtLevel: high)
- feature, refactoring: inherit-parent
- bug-fix: inherit-parent
- perf-issue: inherit-parent
- hillclimb: inherit-parent
- judgment and prose: deepseek/deepseek-chat@max
- hardest tasks: deepseek/deepseek-chat@max
- how explorer: inherit-parent
- how explainer: deepseek/deepseek-chat@max
- why investigators: inherit-parent
- why synthesizer: deepseek/deepseek-chat@max
- reflect tooling: inherit-parent
- reflect judgment, divergent, synthesizer: deepseek/deepseek-chat@max
- swarm workers: inherit-parent
- arena runners: deepseek/deepseek-chat@max, inherit-parent
- arena cross-judge pool: deepseek/deepseek-chat@max, inherit-parent
- architect runners: deepseek/deepseek-chat@max, inherit-parent
- interrogate reviewers: deepseek/deepseek-chat@max, inherit-parent
<!-- pstack-models:end -->
```

**/setup-pstack 改造**：

- 步骤 1 检测源改为：ListModels（可用时，逐行校验 `providerId/modelId` 与 `reasoningLevels`、剔除 `disabled`）→ 降级读 `[本机] ~/.zcode/v2/model-providers.json`（列出已配置 provider 的 models）→ 再降级问用户粘贴（对齐原 L14「If you cannot detect any, ask the user to paste the slugs」）。`inherit-parent` 保留为永远合法的别名（对齐 L14 末句）；删除 `auto` 或声明二者等价（ZCode 无 Auto，保留两个别名徒增文案负担，建议只留 `inherit-parent`）。
- 步骤 3 budget 改为「给每个真实模型选 thoughtLevel」：目标档 max/xhigh/high/medium → 按 `[ZDocs-config]` 各模型档位表取「≤ 目标的最高档」（GLM 系 max 上限即 max；GPT/Claude 有 xhigh；无档位模型跳过并声明）——这是原 effort-token 阶梯（L29）的直译。
- 步骤 5 写入改为编辑 AGENTS.md 定界小节（先读原文件，缺失则创建含小节的新文件）。
- 步骤 6 告知：AGENTS.md 新会话加载（对齐原「applies to new sessions」）。

**读取方改法**（9 个文件统一替换句式）：「the `X` line in `~/.cursor/rules/pstack-models.mdc`」→「the `X` line in the `pstack models` section of `~/.zcode/AGENTS.md`」；值解析按上表语法；spawn 时把 `<id>@<level>` 拆成 Agent 工具的 model 与 reasoning 档参数（档位参数名 [需实测]，见 4.5）。

**diversity 面板**：面板列表逐项 spawn，各项带各自 model 覆盖；cross-judge「Prefer a different model family from the parent's」（`arena:28`）改译为「prefer an entry whose providerId differs from the session model's providerId」。

**优缺点**：

- 优点：最接近 Cursor `alwaysApply` 语义（主会话每轮可见，模型策略在上下文里自我说明）；不依赖 agent 文件机制；载体在仓库外，上游合并零额外冲突。
- 缺点：AGENTS.md 默认注入**每个子代理**（`injectAgentsMd` 默认开，`[ZDocs-subagents]`）——17 行表进所有子代理上下文，纯 token 成本，还可能诱导子代理自行"读表换模"；setup 要编辑用户全局文件，对一个插件而言侵入性高；与用户手写内容混在一个文件里，定界符损坏即解析失败。

### 4.2 方案 B：每角色预设 agent 文件（`~/.zcode/agents/pstack-*.md`）

**载体**：ZCode 原生子代理定义。`/setup-pstack` 为每个标量角色写一个文件；模型钉在 frontmatter，`inherit-parent` 即**不写 `model` 键**。

**示例**（`~/.zcode/agents/pstack-code.md`，正文取自 poteto-agent）：

```markdown
---
name: pstack-code
description: "pstack code-role delegate for feature/refactoring/bug-fix/perf/hillclimb implementation during a poteto-mode run. Spawn when the pstack models config pins a model for the code role."
model: deepseek/deepseek-chat
thoughtLevel: max
injectAgentsMd: false
---

You are operating as poteto-mode's full agent style. Read the `poteto-mode` skill's `SKILL.md` in full before doing any work…
（poteto-agent.md 正文原样移植，路径搜索段改为 ZCode 安装路径）
```

inherit 变体即删去 `model`/`thoughtLevel` 两行。面板角色的两个默认 seat：

```markdown
---
name: pstack-panel-a
description: "pstack diverse-panel seat A (arena runners / architect runners / interrogate reviewers). Spawn one per panel entry when configured."
model: deepseek/deepseek-chat
thoughtLevel: max
injectAgentsMd: false
---
（同上正文）
```

**/setup-pstack 改造**：步骤同方案 A 的检测与 budget（budget 写进每个文件的 `thoughtLevel`）；步骤 5 从写单文件变成写/删一组文件（`pstack-code`、`pstack-judgment`、`pstack-explorer`、`pstack-explainer`、`pstack-investigator`、`pstack-synthesizer`、`pstack-tooling`、`pstack-worker`、`pstack-panel-1..N`、`pstack-judge`）；面板列表长度 = 写几个 `pstack-panel-*` 文件（对齐原「list length sets the count」，setup L31）；重跑时先清点旧 `pstack-*.md` 删除孤儿文件（对齐原「Drop it」的退役角色清理）。

**读取方改法**：各技能从「读表 + spawn 传 model」改为「按角色名 spawn 对应 agent」：how explorer → `pstack-explorer`；why synthesizer → `pstack-synthesizer`；arena runner i → `pstack-panel-i`；poteto-mode 的 playbook 委派在角色表钉了模型时 → `pstack-code`/`pstack-judgment`，否则保持 `poteto-agent`（不钉模型）。

**关键缺陷**：`poteto-mode/SKILL.md:97` 的按作业 ±1 档调档与 `-fast` 决策要求**逐 spawn** 改档，frontmatter 是静态的；若 Agent 工具 spawn 时不接受档位覆盖（[需实测]），方案 B 只能放弃调档机制（固定档运行），损失 pstack 的一等机制。

**优缺点**：

- 优点：模型选择成为 ZCode 一等公民（frontmatter `model`+`thoughtLevel`，官方文档明载）；description 驱动自动选取；单角色钉模型不依赖每个技能的读表纪律；配置即 agent，`@pstack-code` 可手动引用。
- 缺点：面板/调档表达笨拙（文件数随面板长度膨胀）；agent 文件改动需新会话生效（重跑 setup 后必须新开会话，比 pstack 原语义多一步等待）；写入用户 agents 目录的名字空间（本机已有 deepseek-flash、vision 等，需 `pstack-` 前缀隔离）；同样有 AGENTS.md 注入问题（须逐文件 `injectAgentsMd: false`）；对 spawn 时 model 覆盖的依赖最小但没消除（面板按臂指定模型仍要覆盖）。

### 4.3 方案 C：独立角色表数据文件 + spawn 时 model/thoughtLevel 覆盖（推荐）

**载体**：一个纯数据文件 `~/.zcode/pstack/models.md`（新目录仅作数据存放，无 ZCode 内置语义；技能运行时 Read，等价于 pstack 技能读 .mdc 的方式）。不进任何常驻上下文、不注入子代理。

**示例文件内容**：

```markdown
# pstack model configuration

One line per role. Delete a line to fall back to the default (`inherit-parent`).
Value syntax: `<providerId/modelId>` optionally `@<thoughtLevel>`, or `inherit-parent`
(omit the spawn `model` parameter; runs on the session model). Panel roles take a
comma-separated list; one subagent runs per entry, alias entries included.

budget: large (thoughtLevel: high)

feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: deepseek/deepseek-chat@max
hardest tasks: deepseek/deepseek-chat@max
how explorer: inherit-parent
how explainer: deepseek/deepseek-chat@max
why investigators: inherit-parent
why synthesizer: deepseek/deepseek-chat@max
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: deepseek/deepseek-chat@max
swarm workers: inherit-parent
arena runners: deepseek/deepseek-chat@max, inherit-parent
arena cross-judge pool: deepseek/deepseek-chat@max, inherit-parent
architect runners: deepseek/deepseek-chat@max, inherit-parent
interrogate reviewers: deepseek/deepseek-chat@max, inherit-parent
```

**spawn 传递路径**（本方案核心）：技能把每行的 `<id>@<level>` 拆开，经 Agent 工具 spawn 参数传给**通用子代理**——

- 委派类（playbook 内）：spawn `poteto-agent`（插件自带，见下）+ spawn 时 model/档位覆盖；
- 评审/探索类：spawn 不钉模型的通用代理（省略 model 的预设 agent，或主会话默认子代理）+ 同样覆盖；
- `inherit-parent` 项：省略覆盖参数。

**插件自带的两个 agent 文件**（吸收方案 B 的最小子集，随插件分发、不随 setup 变化）：

- `agents/poteto-agent.md`：原文件删去 `is_background: true`（L4），加 `injectAgentsMd: false`，**不写 model**；正文 L10 的 `~/.cursor/plugins/` 搜索段改为 ZCode 插件缓存路径约定（`~/.zcode/cli/plugins/cache/**/skills/poteto-mode/SKILL.md`，取版本最高）。
- `agents/comment-sicko.md`：原样（本就不钉模型）。
- `pstack/.cursor-plugin/plugin.json` 的 `"agents": "./agents/"` 声明保留；[需实测] ZCode 是否识别 `.cursor-plugin/` 目录名，否则需并行提供 `.zcode-plugin/plugin.json`（配置指南 L77 只列了 `.zcode-plugin`/`.claude-plugin`/`.codex-plugin` 兼容名）。

**/setup-pstack 改造**（与方案 A 的检测/budget 完全相同，仅写入目标不同）：写 `~/.zcode/pstack/models.md` 整文件覆写（对齐原 L39 幂等要求）；立即生效（spawn 参数逐次传递，无新会话等待——优于原 pstack 语义）。

**回退链重写**（替代 1.4 的三级家族回退，写进各技能）：

> If the Agent tool rejects a configured model id, retry once on another detected model with the same providerId prefix; if none, omit `model` (the subagent runs on the session model) and say so. Never treat an `inherit-parent` entry as a rejected model. If a table default is rejected, open a separate PR to update the default table. Do not block the work on the model issue.

（前两句为 arena/how/why/reflect/swarm 通用版；interrogate 变体把「omit model」终点换成 Reviewer 默认，对齐 `interrogate/SKILL.md:36` 的结构。）

**调档机制改写**（替代 1.5，写进 poteto-mode Subagents 节）：

> Before each spawn, start from the role's line or default. The `/setup-pstack` budget sets each role's starting thoughtLevel. Raise it one step, up to the model's top level, for the hardest or subtlest work. Lower it one or more steps for routine work; a model with no levels ignores this. Keep the model id the role names, so a diverse panel stays diverse. Verification stays on the `swarm workers` model. A role on `inherit-parent` stays on the session model. If the Agent tool rejects the adjusted level, do not try another adjusted level. Use the role's line or default and say so.

（`-fast` 的"紧急才用快档"句删除——ZCode 无速度维度；如需保留紧迫性语义，可译为「降一档 thoughtLevel」并在文档标注为行为近似。）

**diversity 面板**：arena/interrogate/architect/reflect 逐项 spawn 各带覆盖参数；cross-judge 选 providerId 不同于会话模型 providerId 的池项（对齐 `arena:28`「Prefer a different model family from the parent's」的意图）；「Use the same model N times when the work is generation-bound」（`arena:17`）原样保留。orchestrate L98 的「Tool-error, retry on a different model」直译为「retry on a different configured model id」。

**优缺点**：

- 优点：pstack 架构直译（运行时读表 + spawn 覆盖 + 三段式回退），机制保真度最高；面板列表、按臂指定、逐 spawn 调档全部自然表达；立即生效、无热重载问题；不污染用户全局文件、不进子代理上下文（配 `injectAgentsMd: false`）；setup 的「检测-预算-确认-校验-覆写」五步流程几乎原样保留。
- 缺点：依赖 Agent 工具 spawn 时接受 model 覆盖（`[宿主事实]` 确认有 model 参数；**档位覆盖参数 [需实测]**——若不支持，`@<level>` 降级为提示文字「spawn 后无法改档，档位由 setup 表固定」，损失调档）；`~/.zcode/pstack/` 是自造目录约定（无 ZCode 背书，但纯数据文件无妨）；每个技能的读表纪律靠 prompt 维持（与 pstack 现状相同，非新增风险）。

### 4.4 上游 merge 冲突面（三方案对比）

仓库为 cursor/plugins 稀疏检出（`git remote -v`：upstream=cursor/plugins；`.git/info/sparse-checkout` 限 `/pstack/` 与 `/docs/`）。**仓库内必须修改的文件三方案基本相同**（模型语义都在技能正文里）：

| 类别 | 文件（行号见第一部分） |
|------|------------------------|
| 核心（三方案等价必改） | `skills/setup-pstack/SKILL.md`（检测源、写入目标、值语法、回退全部重写）；`skills/poteto-mode/SKILL.md`（L93-97：Task→Agent 措辞、model 语义、调档规则） |
| 路由技能（读表句式+回退句式替换） | `arena`（L17,22,28）、`architect`（L31）、`how`（L11）、`why`（L11,13,49,79）、`reflect`（L25,27,29-33,39）、`swarm`（L25,30,32）、`interrogate`（L27,29-36）、`no-comments`（L19）、`figure-it-out`（L31）、`blast-radius`（L38） |
| Playbook（默认 slug 提法替换） | `feature.md:12`、`bug-fix.md:9`、`perf-issue.md:17`、`hillclimb.md:12`、`refactoring.md:11`、`multi-phase-plan.md:7,13`、`eval.md:20`、`orchestrate.md:15,16,98`（嵌套深度约束另计） |
| agents | `agents/poteto-agent.md`（删 L4 `is_background`、改 L10 路径、加 `injectAgentsMd`）；`agents/comment-sicko.md`（不动或加 `injectAgentsMd`） |
| 机制解释文案 | `poteto-help/SKILL.md`（L27,30-33,38,43,45,53-57,136）、`README.md`（L11,25,30,129,262-264）、`docs/guide/01-setup.md`（L23-29,39,45-46,60）、`02-poteto-mode.md:99`（cloud subagent）、`04-design.md:31,69`、`07-overnight.md:68`、`10-recipes-and-pitfalls.md:150` |

差异点：

- 方案 A/B/C 的配置载体均在仓库外（AGENTS.md / agents 目录 / `~/.zcode/pstack/`），**不产生额外仓库冲突**。
- 方案 B 额外把「读表后传参」改成「按名 spawn 预设 agent」，poteto-mode 与各路由技能的改动更深（subagent_type 语义重写），上游每次改这些段落都会冲突得更碎；方案 A/C 的改动是「路径与值语法替换」，diff 更局部。
- 三方案共同的最大冲突热点是 `setup-pstack/SKILL.md`（上游活跃演进：0.15.x 连续改过 budget 逻辑）与 `poteto-mode/SKILL.md:95-97`。

### 4.5 对比与推荐

| 维度 | A（AGENTS.md 小节） | B（预设 agents 文件） | C（数据文件+spawn 覆盖） |
|------|--------------------|----------------------|--------------------------|
| 机制保真（角色表/spawn 覆盖/调档/面板） | 中（表常驻，调档靠 spawn 覆盖） | 低-中（静态 frontmatter，调档难） | **高**（pstack 架构直译） |
| ZCode 原生程度 | 中（AGENTS.md 原生但混入插件数据） | **高**（model+thoughtLevel 官方机制） | 中（spawn 参数为宿主事实，文件为约定） |
| 生效及时性 | 新会话 | 新会话（agent 文件） | **立即** |
| token 成本 | **高**（注入所有子代理） | 低（须逐文件关注入） | **低** |
| 侵入用户环境 | 高（编辑全局 AGENTS.md） | 高（写 agents 目录，文件数多） | 低（自建目录单文件） |
| 上游冲突面 | 基线 | 略大（spawn 措辞重写更深） | 基线 |
| 主要风险 | 定界符损坏/子代理读表干扰 | 调档机制丢失、面板文件膨胀 | 档位覆盖参数 [需实测] |

**推荐：方案 C**，并吸收 B 的两个插件级 agent 文件（poteto-agent、comment-sicko，不钉模型）。理由：pstack 模型系统的本质是「spawn 时决策」而非「定义时钉死」（1.7、1.10），ZCode 的 spawn 时覆盖路径（`[宿主事实]`）与省略即继承语义（`[ZDocs-subagents]` 原文）恰好一一对应；C 同时保住三大易碎机制——面板列表定 fan-out、逐 spawn 调档、cross-judge 异家族优先。A 可作为迁移期临时形态（在 C 的读表技能落地前，先往 AGENTS.md 贴一份表），但不应是终态。

### 4.6 需实测清单（方案 C 落地前逐项验证）

1. **Agent 工具 spawn 时的 model 参数**：格式是否 `providerId/modelId`（ListModels schema 说该格式用于 `subagent_model`；Agent 工具的 model 参数格式未逐字确认）。
2. **Agent 工具 spawn 时是否接受 thoughtLevel / `$<level>` 后缀**：CreateWorkflow 的 `subagent_model` 明确支持 `$<level>`（`[宿主事实]`）；Agent 工具未确认。不可用则 C 的调档降级为「档位由表固定」。
3. **subagent_type 如何指名插件 agent**：裸名（`poteto-agent`）还是限定名（`pstack:poteto-agent`，类比技能的 `plugin:skill` 形式）；documents/pdf 两插件同名 `visual-judge` 的优先级规则。
4. **`.cursor-plugin/plugin.json` 是否被 ZCode 识别**为 manifest（配置指南 L77 未列该兼容名）；不识别则需加 `.zcode-plugin/plugin.json`（并入上游 merge 冲突面）。
5. **子代理 frontmatter 未知键**（如保留的 `is_background`）是否确实静默忽略（文档在 thoughtLevel 段说未识别键被忽略，泛化到全部键 [需实测]）。
6. **ListModels 在主会话的可用性**：本会话返回 `model_catalog_unavailable`；主会话可能同样缺失——setup 检测必须按 2.5 的三级降级链实现。
7. **`~/.zcode/v2/model-providers.json` 的 `models` 数组与实际可 spawn 性一致**（它含 `apiKey` 的 provider 才真实可用；setup 不得复述密钥内容）。
8. **省略 model 的子代理在主会话换模后即时跟随**（文档明说，建议一次实测确认，因为它支撑「inherit-parent 动态语义」这一默认策略）。

---

## 附录：本次逐文件核过的引用位置索引

pstack（仓库内，全部一手读取）：`skills/setup-pstack/SKILL.md`（全文）、`skills/poteto-mode/SKILL.md`（全文，重点 L93-99）、`skills/arena/SKILL.md`（全文）、`skills/swarm/SKILL.md`（全文）、`skills/architect/SKILL.md`（L27-35）、`skills/interrogate/SKILL.md`（全文）、`skills/how/SKILL.md`（L11）、`skills/why/SKILL.md`（L11,49,79）、`skills/reflect/SKILL.md`（L25-39）、`skills/no-comments/SKILL.md`（L19）、`skills/poteto-help/SKILL.md`（全文）、`skills/figure-it-out/SKILL.md`（L31）、`skills/blast-radius/SKILL.md`（L38）、`skills/architect/references/runner-prompt.md`、playbooks（feature:12、bug-fix:9、perf-issue:17、hillclimb:12、refactoring:11、multi-phase-plan:7,13、eval:20、orchestrate:15,16,98）、`agents/poteto-agent.md`（L1-10）、`agents/comment-sicko.md`（L1-4）、`README.md`（L11,25,30,129,200-204,262-264）、`docs/guide/01-setup.md`（L23-29,39,45-46,60）、`docs/guide/02-poteto-mode.md`（L99）、`docs/guide/04-design.md`（L31,69）、`docs/guide/07-overnight.md`（L68）、`docs/guide/10-recipes-and-pitfalls.md`（L150）、`.cursor-plugin/plugin.json`。

ZCode：`[ZDocs-subagents]`、`[ZDocs-config]`、`[本机] ~/.zcode/agents/deepseek-flash.md`、`[本机] ~/.zcode/agents/vision.md`、`[本机] documents 插件 agents/visual-judge.md 与 .zcode-plugin/plugin.json`、`[本机] pdf 插件 agents/visual-judge.md`、`[本机] zcode-guide/0.3.0/skills/zcode-configuration-guide/SKILL.md`、`[本机] ~/.zcode/v2/model-providers.json`（schema，密钥不复述）、`[本机] ~/.zcode/cli/config.json`（顶层键）、`[宿主事实]` 本会话 ListModels 调用结果与 CreateWorkflow/ListModels 工具 schema 原文。
