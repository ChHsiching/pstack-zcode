# ZCode 技能自动触发控制机制调研（第二轮）

日期：2026-10-16。承接第一轮 `pstack-zcode-adaptation.md` 映射表 #5（Cursor `disable-model-invocation` → ZCode 仅靠 description 文字约束）与 `adaptation-audit.md` 的「仅显式调用 ⚠️」项。

依据来源分级标注：**[本地文档]** = 本机第一方插件文档；**[源码]** = github.com/zai-org/ZCode（main 分支，2026-10-16 查证）；**[官方文档]** = zcode.z.ai / code.claude.com；**[实测]** = 本机会话第一手观察；**[推断]** = 上述依据推论，非明文。

---

## 1. 结论速览

1. ZCode 技能 frontmatter **只识别 5 个键**：`name`、`description`、`when_to_use`、`license`、`metadata`（[源码] `SAFE_FRONTMATTER_KEYS`）。`disable-model-invocation` **不在其中**，写了会被当未知键忽略——但不会导致技能被丢弃，也无任何运行时后果。
2. `when_to_use` 是**纯软引导**：与 `description` 以 `" - "` 拼接后**共享同一个 250 字符截断窗口**，注入到技能清单里给模型看。没有独立召回器、没有 ranking、没有门控（[源码] context/sections/skills.ts）。
3. **ZCode 当前没有任何硬门控等价物**。`disable-model-invocation` 在 ZCode 设计文档中是 **P1/P2 预留字段，P0 未实现**（[源码] design doc）。全仓库 `disableModelInvocation` 零命中。
4. 触发机制：每轮把**所有已启用技能**的元数据注入 `meta_user` 上下文段，模型自主决定调 `Skill` 工具；清单按名称字母序排序。总预算默认 **20,000 字符**，超限**降级为仅名称**（description 与 when_to_use 全部不注入）。
5. **本机当前已处于降级态**：本调研会话（子代理）注入的技能清单只有「名称 + 文件路径」，无任何 description——即在本机当前技能数量下，任何 description/when_to_use 措辞收紧**实际不会生效**（[实测]，与降级代码路径逐字吻合）。
6. 唯一真正的硬控制是 **enable/disable**（Settings→Skills 或 config.json `skill.<绝对路径>.enable=false`），但那是完全禁用（不注入、也不可调用），**不是**「仅显式」。
7. 现成的「仅显式」硬等价物是**把技能改写为 command**（`.zcode/commands/*.md`）：command 只能由用户 `/` 触发，不进模型的技能清单（[本地文档]+[推断]）。
8. Claude Code 对比：`when_to_use` 语义一致（追加进 description 展示，但计入 1,536 字符上限而非 250）；`disable-model-invocation` 在 Claude Code 是**硬门控**（工具层直接拒绝模型调用）。ZCode 兼容 `.claude/skills` 目录格式但**不继承该门控语义**。

---

## 2. frontmatter 字段清单（含依据）

解析器实现：`apps/zcode-cli/packages/adapters/src/skills/index.ts`（[源码] <https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/skills/index.ts>）。平铺 YAML：只读顶层 `key: value` 标量行，缩进行跳过，多行值需 `>` 或 `|` 块语法。

| 字段 | 必填 | 语义 | 依据 |
|---|---|---|---|
| `name` | 是（有 frontmatter 时） | 技能名；无 frontmatter 的手写技能回退为目录名 | [源码] parseSkill；[本地文档] diagnosing-skills §2 |
| `description` | 是（有 frontmatter 时） | 触发判定的**主要**依据；上限 1024 字符，超出整技能丢弃；注入时截到 ~250 字符 | 同上 + [官方文档] zcode.z.ai/en/docs/skill |
| `when_to_use` | 否 | 追加到 description 预算中（见 §4）；解析进 `SkillMetadata.whenToUse` | [源码] SAFE_FRONTMATTER_KEYS + parseSkill；[源码] 设计文档 P0 frontmatter 清单原文「`when_to_use`：可选，追加到描述预算中」 |
| `license` | 否 | 仅 metadata，无行为 | [源码] SAFE_FRONTMATTER_KEYS + 设计文档「仅 metadata」 |
| `metadata` | 否 | string map，无行为 | 同上 |
| 其他任意键（`disable-model-invocation`、`icon`、`user-invocable` 等） | — | **静默忽略**，不影响加载；仅把 `safeToAutoLoad` 置 false | [源码] parseSkill 注释「这些字段不影响加载，不再作为 warning 暴露，只保留 safeToAutoLoad 的保守判断」 |

两处需要修正/收紧第一轮的说法：

- 第一轮「未知键被跳过（推断）」→ **已证实**：未知键不报错、不丢弃，仅影响 `safeToAutoLoad` 标志。
- **`safeToAutoLoad` 本身无运行时门控效果**：全仓库消费点只有 CLI `zcode skills inspect` 的展示输出（[源码] 搜索 safeToAutoLoad，命中仅 skills-command.ts / contracts / adapters / 测试）。设计文档 2026-05-08 核对明确：「当前 `Skill` tool 的权限声明仍是 tool-level low-risk 自动允许，没有根据 unsafe frontmatter……动态升级为 ask」。即写 `disable-model-invocation: true` 在 ZCode 里**唯一后果**是 inspect 里显示 `safeToAutoLoad: no`。

设计文档另列 **P1/P2 预留（未实现）字段**（[源码] design/v2/skill.md）：`allowed-tools`、`model`、`effort`、`context: inline | fork`、**`disable-model-invocation`**、`policy.allow_implicit_invocation`、`dependencies.tools`、`interface`。其中 `policy.allowImplicitInvocation` 在契约（contracts/src/skills/index.ts）已建模，但 adapter 对每个技能**硬编码 `true`**，且 Skill 工具处理器不检查它——是给未来留的口子，现在无效。

---

## 3. 触发机制

两层加载（[源码] 设计文档「核心原则」；[本地文档] diagnosing-skills §2）：

1. **metadata 注入**：`core/src/context/sections/skills.ts` 把技能清单渲染成 `meta_user` 上下文段（`cacheHint: "dynamic"`，每轮动态）。行格式（[源码] formatSkillLine，逐字）：

   ```
   - {name}: {description} - {whenToUse} (file: {绝对路径})
   ```

   即 `when_to_use` 与 `description` 拼成一条、共截 250 字符（`MAX_DESCRIPTION_CHARS = 250`）。
2. **正文加载**：模型自主调用 `Skill` 工具（输入技能名）后才读 SKILL.md 正文（≤100KB，dynamic-workflows 特例 200KB）。

关键事实：

- **无关键词匹配器、无召回器、无相关性排序**：清单按 `name.localeCompare` 字母序排（[源码] buildSkillsContent）。[本地文档] diagnosing-skills 原文「There is no keyword matcher — a description that clearly states "when to use this" is what makes a skill discoverable to the model」。
- **预算与降级**：`DEFAULT_SKILL_METADATA_BUDGET = 20_000` 字符；超限整段降级为仅名称行 `- {name} (file: {path})`（[源码] buildSkillsContent）。[官方文档]：「全部技能的元数据共享一个固定预算」，超预算「注入会降级为只保留技能名」，且「元数据被降级则自动触发率骤降」。
- **[实测] 本机已降级**：本调研子代理会话注入的清单形态为 `- name (file: path)`（仅名称），与降级代码路径逐字吻合。本机装了 200+ 技能（plugin 缓存 + `~/.agents/skills`），必然超 20k。含义：**在本机当前状态下 description/when_to_use 措辞对模型不可见**，误触发与否只取决于技能名本身。
- **预算可调**：config.json `skills.metadataBudget`（正数）、`skills.enabled`、`skills.includeInstructions`、`skills.roots`（[源码] adapters/src/config/schema.ts skillsSchema）。主会话与子代理上下文（core/src/subagent/context-builder.ts）共用该机制。
- **显式调用路径**（用户侧）：输入框 `$` mention（`$skill-name 任务`）、`/` 菜单 Skills 分组、`/skill <name> [task]`（command-center 改写为「先调 Skill 工具」的显式指令）（[官方文档] + [源码] 设计文档 Manual Command 节）。
- **/ 面板与模型看到同一份清单**：[官方文档] 原文「/ 面板与模型看到的是同一份技能清单，不存在『只给面板、不给模型』的开关」。停用的技能「不注入上下文、也不能被调用」。因此**不存在「不在模型清单但用户可调」的状态**——要么双方都可见可调，要么彻底停用。
- Skill 工具的防误用约束在工具描述文本里（软约束）：「Only invoke a skill that appears in that list, or one the user explicitly typed as `/<name>`……When a skill matches the user's request, this is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response」（[源码] core/src/tool/handlers/skill.ts 的 description 字段）。注意后半句在**推动**模型主动调用，与「仅显式」目标方向相反——凡 description 看起来匹配，模型被系统提示要求抢先调用。

---

## 4. `when_to_use` 准确语义（问题 1/2 的直接回答）

**存在，且已被解析和注入；但它是纯软引导，不是门控。**

- 数据流：SKILL.md frontmatter → `parseFlatYaml` → `SkillMetadata.whenToUse` → 技能清单行 `{description} - {whenToUse}` → 250 字符总截断 → `meta_user` 注入（全部 [源码]，见 §3）。
- 不影响：加载成败、排序、预算分配（共享一条）、权限、任何工具层判定。模型看到它时与 description 无格式区分——就是同一行里的一段文字。
- [官方文档] zcode.z.ai 技能页**未提及** when_to_use（中英文版均只讲 name/description），只在建议把触发条件写进 description。该字段属于「源码实现有、官方文档没写」的状态。
- Claude Code 对照（[官方文档] <https://code.claude.com/docs/en/skills>）：`when_to_use` = "Additional context for when Claude should invoke the skill, such as trigger phrases or example requests. Appended to `description` in the skill listing and counts toward the 1,536-character cap."。语义同构（追加进 description 展示、计入上限），仅上限不同（1536 vs ZCode 的 250 注入窗口/1024 存储上限）。ZCode 的 250 字符拼接窗口是**两者中更紧的**——description 与 when_to_use 合计只有 250 字符可见，这是措辞设计的第一约束。

---

## 5. 硬门控等价物有无（问题 3 的直接回答）

**没有。** 逐项排查：

| 候选 | 状态 | 依据 |
|---|---|---|
| frontmatter `disable-model-invocation` | **未实现**。设计文档 P1/P2 预留；全仓库 `disableModelInvocation` 零命中；写入被当未知键忽略 | [源码] 设计文档 + GitHub code search |
| `policy.allowImplicitInvocation` | 契约存在，adapter 硬编码 `true`，Skill 工具处理器不读取 | [源码] adapter + skill handler |
| `user-invocable: false` / `skillOverrides "user-invocable-only"` | Claude Code 专属（settings 层），ZCode 无对应物 | [官方文档] code.claude.com；ZCode config schema 无此键 [源码] |
| hidden / internal 类字段 | 不存在。`metadata.internal: true` 是 pstack 侧 skills CLI 的约定，ZCode 不读 | [本地文档] round-1 skills-cli-distribution.md；[源码] SAFE_FRONTMATTER_KEYS |
| `safeToAutoLoad`（未知键的副作用） | 无运行时效果，仅 CLI inspect 展示 | [源码] 消费点搜索 + 设计文档核对 |
| enable/disable 开关 | 唯一硬控制，但是**全有或全无**：停用后用户也调不了 | [官方文档] + [源码] adapter disabledPaths |
| Skill 工具层的调用拒绝 | 无：handler 只按名字 load，不区分调用来源（模型 vs 用户改写） | [源码] core/src/tool/handlers/skill.ts 全文 |

关于「user-invocable 清单」的澄清（回应第一轮笔记里的提法）：ZCode 里没有独立的 user-invocable 段。Skill 工具描述说的是「Available skills are listed in system-reminder messages……Only invoke a skill that appears in that list」——这个 list 就是全部已启用技能（与 / 面板同一份）。技能不在这个清单 = 已停用 = 用户同样无法调用。Claude Code 那套「user-invocable-only（留在 / 菜单、对模型隐藏）」在 ZCode **无对应物**。

**推论**：在 ZCode 现版本，「仅显式调用」无法用任何开关达成。可用的替代梯度：

1. **软收紧**（保技能形态）：description 去触发化 + when_to_use 显式限定（§6 模板）。
2. **硬隔离**（改形态）：改写为 command（`.zcode/commands/<name>.md`）。command 由文件名即命令名、用户 `/` 触发，不进模型技能清单——这是 ZCode 现成的「仅显式」等价物（[本地文档] zcode-configuration-guide 五资源表 + diagnosing-commands；模型侧无 command 调用工具为 [推断]，依据是 command 不在 Skill 清单、工具集里也无 Command 工具）。代价：失去 `Skill` 工具按需加载正文、`(file: path)` 引用等技能机制；command 还支持 frontmatter `skills:` 字段挂载技能（[本地文档] diagnosing-commands §3「`skills` are auto-mounted」），可做「命令壳 + 技能正文」组合。

---

## 6. 落地建议（问题 4）

### 6.1 前置检查：先确认注入形态，否则一切措辞收紧是空谈

在投入措辞前，确认目标环境技能清单**未降级**（注入行含 description）。方法：看任一会话 system-reminder 里技能行是否带描述（本机现在**不带**，已降级 [实测]）；或数启用技能（`zcode skills list`）估算 `Σ(名称+路径+min(描述,250))` 是否超 20,000 字符。若已降级，两条路：

- 调 `~/.zcode/cli/config.json` 的 `skills.metadataBudget`（[源码] 可配置项）——但会常驻增加每轮 token 开销；
- 接受现状：降级态下模型只见技能名，误触发天然骤降（[官方文档]），对「仅显式」目标反而是利好，只是不可控、不该依赖。

### 6.2 措辞模板（250 字符窗口是硬约束）

原则：description 是模型匹配的**主**依据（[本地文档]/[官方文档] 均明说），when_to_use 只是同一段文字的延伸。要降误触发，**先改 description，再补 when_to_use**，两者合计控制在 ~250 字符内、关键排除词前置（截断发生在第 250 字符）。

对 pstack 这类「原 Cursor 技能、声明 runs only when you type /x」的场景，建议双字段模板（英文，与注入语境一致）：

```yaml
---
name: some-pstack-skill
description: "Manual workflow for <X>. Not auto-triggered; loaded only when the user explicitly names it."
when_to_use: "Explicit invocation only (/name or $name). Do not invoke from a matching task description."
disable-model-invocation: true   # ZCode 忽略；Cursor/Claude Code 侧生效，双栖无害
---
```

要点：

- description 用**名词性、非触发式**开头（"Manual workflow for X"），不用 Cursor 常见的 "Use when..." 句式——后者正是 ZCode 官方建议的**提高**自动触发可靠性的写法，方向相反。
- when_to_use 写**否定式触发条件**（"Do not invoke from a matching task description"）。参考本机第一方先例：bundled `dynamic-workflows` 技能的 `when_to_use: "Only for CreateWorkflow scripts. A single delegation or a few independent lookups belong to the Agent tool instead."`（[本地文档] `C:\Program Files\ZCode\resources\glm\packages\bundled-skills\skills\dynamic-workflows\SKILL.md` 同款缓存于 `C:\Users\Administrator\.zcode\cli\plugins\cache\zcode-plugins-official\zcode-guide\0.2.0\skills\dynamic-workflows\SKILL.md`）——官方自己的收窄手法就是「限定 + 反例排除」。
- 保留 `disable-model-invocation: true`：ZCode 侧唯一副作用是 `safeToAutoLoad=false`（无运行时后果，[源码]），Cursor/Claude Code 侧是硬门控。双栖仓库应保留。
- 名称也可利用：清单降级态下**只有名字可见**，名字里带前缀（如 `pstack-`）能显著降低语义撞车概率。

### 6.3 诚实评估：软约束能降多少

- **不能归零，也无法量化**。官方与源码均无任何数据；机制上模型读到「匹配的 description」时系统提示反而要求它抢先调用（§3 末条），措辞只是在与这段指令对抗。语义高度重叠的请求（用户没点名、但任务恰是某技能领域）仍可能被自动触发。
- 合理预期：非触发式 description + 否定式 when_to_use 能把「顺带触发」压到低水平（模型对明显写着 explicit-only 的行有相当服从率——同为文字约束，工具描述的 BLOCKING REQUIREMENT 也依赖同一服从机制），但**这不是保证**，审计口径应标「尽力降低」而非「保证仅显式」。
- 需要保证的场合（如 pstack 中破坏性/长流程 playbook）：走 §5 的 command 改写（硬），或在 AGENTS.md 工作区指令里加一条全局「不得主动调用 pstack-* 技能」——后者仍是软约束，但作用在系统层、优先级高于清单行，可作为第二道软闸。

### 6.4 对第一轮映射表 #5 的修订建议

原文「ZCode 无此开关。技能仍可从 / 菜单显式调用，但模型也可能自动触发 | 语义降级可接受……如需硬隔离可改为 commands」——**方向正确，可升级为**：

- 「已证实无硬开关（源码 disableModelInvocation 零命中，设计文档列为 P1/P2 预留）；软收紧 = description 非触发化 + when_to_use 否定式限定（共享 250 字符注入窗口）；注意技能总量超 20k 字符预算时清单降级为仅名称，措辞不生效；硬隔离 = 改写为 command（仅用户 / 触发）；`disable-model-invocation: true` 建议保留以兼容 Cursor/Claude Code，ZCode 侧无害」。

---

## 附：主要来源

- [本地文档] `C:\Users\Administrator\.zcode\cli\plugins\cache\zcode-plugins-official\zcode-guide\0.3.0\skills\diagnosing-skills\SKILL.md`、`...\zcode-configuration-guide\SKILL.md`、`...\diagnosing-commands\SKILL.md`
- [源码] <https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/skills/index.ts>（frontmatter 解析、SAFE_FRONTMATTER_KEYS、disabledPaths、safeToAutoLoad）
- [源码] <https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/core/src/context/sections/skills.ts>（清单注入格式、250 截断、20k 预算、names-only 降级）
- [源码] <https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/core/src/tool/handlers/skill.ts>（Skill 工具：无门控检查、BLOCKING REQUIREMENT 文案）
- [源码] <https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/contracts/src/skills/index.ts>（SkillMetadata/SkillPolicy 契约）
- [源码] <https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/docs/design/v2/skill.md>（P0/P1/P2 字段划分、两层加载、预算策略、权限规划）
- [源码] <https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/config/schema.ts>（skills.enabled/includeInstructions/metadataBudget/roots）
- [官方文档] <https://zcode.z.ai/en/docs/skill>、<https://zcode.z.ai/docs/skill>（中文）
- [官方文档] <https://code.claude.com/docs/en/skills>（Claude Code when_to_use / disable-model-invocation / user-invocable）
- [实测] 本调研会话技能清单注入形态（names-only 降级）；本机 bundled `C:\Program Files\ZCode\resources\glm\packages\bundled-skills\skills\dynamic-workflows\SKILL.md` 的 when_to_use 先例
- Claude Code 硬门控佐证（工具层拒绝）：本机 `C:\Users\Administrator\.zcode\agents\claude-code\node_modules\@anthropic-ai\claude-agent-sdk\cli.js` 中 `if(H.disableModelInvocation)return{result:!1,message:\`Skill ${z} cannot be used with ${ND} tool due to disable-model-invocation\`...}`（属 ZCode 内嵌的 Claude 兼容子系统，非 ZCode 原生技能系统）
