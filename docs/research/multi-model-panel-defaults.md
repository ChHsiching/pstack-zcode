# 多模型面板默认值：tier-2 检测可靠性与「开箱即问」落地方案

日期：2026-10-16。第二轮迭代调研。研究问题：setup-pstack 的三级降级检测（模型目录 → 本机 provider 配置 → 问用户）能否可靠识别可用模型清单与家族，从而在检测到 ≥2 个异家族模型时主动提议多样性默认面板（用户可拒绝保持全继承）。

来源标注约定：

- `skills/...:L12` = 本仓库技能文件行号（一手读取）。
- `[本机]` = 本机文件实地读取（2026-10-16，全部只读；敏感值一律 `<redacted>`）。
- `[宿主事实]` = 本会话宿主提供的系统提示/工具 schema 原文（任务方许可引用）。
- `[实测]` = 本会话实际调用工具得到的结果。

---

## 1. 结论速览

1. **ListModels（tier-1）在本宿主仍不可用**（2026-10-16 实测返回 `model_catalog_unavailable`，与第一轮 2026-10-15 相同，[实测]）。三级降级不是可选项，tier-2 本机配置是主路径。
2. **tier-2 可行，但当前 SKILL.md 指定的文件是错的（会严重过检）**：`~/.zcode/v2/model-providers.json` 是 9 个 provider 的**模板目录**（含 openrouter 的 24 个模型、moonshot 的 kimi 系模型，均无密钥），把它当「已配置 provider 的模型清单」会列出大量用户实际跑不了的模型。真正反映用户实配的是另外两个文件：`~/.zcode/v2/provider_config.json`（GUI 设置侧，含 access/modelOrder/enabled）与 `~/.zcode/v2/config.json`（CLI 侧，含 enabled/systemDisabledReason/逐模型 reasoning variants）。二者互补、部分重叠，须取并集。
3. **本机实证可拼出 ≥2 个异家族可用模型**：GLM 系（会话模型 `account:bigmodel-individual-coding-plan/GLM-5.3`，另有多个 GLM provider 实配）+ DeepSeek 系（`deepseek/deepseek-v4-pro`）+ 本地 Qwen（`new-provider/Qwen3.6-35B-A3B`，本地 llama.cpp，有可用性保留）。kimi 在本机**无任何实配**（仅模板），当前不可提议。→ 「检测到 ≥2 异家族即提议」在本机成立。
4. **家族判定必须以 modelId 优先、providerId 兜底**：实证同一个 provider 可挂多家族模型（微信大赛 CodingPlan provider 同时挂 GLM-5.2 与 Deepseek-v4-flash），providerId ≠ 家族。
5. **屏蔽要求（红线）**：deepseek 系 flash 付费模型（本机两处现身：官方 `deepseek/deepseek-flash`、微信 CodingPlan `42c7e100…/Deepseek-v4-flash`）**绝不能出现在任何提议里**，应按 `/deepseek[-_]?v?\d*[-_]?flash/i` 硬排除。
6. **面板写入形态已明确**：4 个面板行（`arena runners`、`arena cross-judge pool`、`architect runners`、`interrogate reviewers`）是逗号分隔列表，一项一个子代理，支持 `@<level>` 后缀；多样性面板的最小形态是 `inherit-parent` + 一个异家族实模（既保留会话模型跟随语义，又给 cross-judge 提供异 provider 候选）。
7. **提问 UX**：在 budget 问题（3a）之后、逐角色确认（3c）之前插一个 AskUserQuestion 三选一（异家族面板(推荐) / 保持全继承 / 逐角色自定义）；拒绝或缺答即回落 ADR-0005 现状（全 inherit-parent），幂等重跑语义不受影响。

---

## 2. provider 配置文件实证（路径 / 格式 / 字段，脱敏）

调研中发现 **5 个相关文件 + 2 个旁证文件**。`~/.zcode/cli/config.json` 顶层只有 `plugins` 与 `mcp` 两键，无 provider 数据（[本机]）。

### 2.1 tier-1 复测：ListModels 仍不可用

2026-10-16 本会话实际调用 ListModels 返回：

> `model_catalog_unavailable: this session cannot list models — the host did not provide a model catalog.`（[实测]）

与第一轮 2026-10-15 记录一致（`model-system-mapping.md` §2.4）。结论：检测降级链必须内建，tier-2 是事实上的主路径。

### 2.2 `~/.zcode/v2/model-providers.json` —— provider 模板目录（当前 tier-2 指定文件，**会过检**）

- [本机] 格式：JSON 数组，9 项。每项字段：`id`、`name`、`endpoints{anthropic,openai,gemini}`、`apiKey`、`models[]`（字符串数组）、`modelSupportedFormats`、`providerMappings.claude{haiku,sonnet,opus,reasoning}`（把 anthropic 档位名映射到本 provider 模型）、`createdAt/updatedAt`。
- [本机] 内容（脱敏）：`builtin:bigmodel`、`builtin:zai`（仅此一个嵌有 apiKey `<redacted>`）、`builtin:zapi`（内网地址，models 为空）、`default-openrouter`（24 个模型：`anthropic/claude-*`、`x-ai/grok-*`、`openai/gpt-*`、`google/gemini-*`、`moonshotai/kimi-k2.6`、`z-ai/glm-*`、`deepseek/deepseek-v3.2`、`xiaomi/mimo-*`、`minimax/*`、`qwen/*`，无密钥）、`default-moonshot`（`kimi-k2.6`、`kimi-k2.5`、`kimi-k2-turbo-preview`，无密钥）、`default-minimax`、`default-deepseek`、`default-mimo`、`default-qwen`（均无密钥）。
- 文件时间戳 2026-04-30（[本机] ls），是安装时铺的模板，非用户意图。
- **判定：模板目录 ≠ entitlement。** 9 个 provider 里 8 个无密钥；若按当前 `skills/setup-pstack/SKILL.md:14` 的措辞「read `~/.zcode/v2/model-providers.json` and list every configured provider's models」执行，会把 openrouter 的 claude/grok/gemini 与 moonshot 的 kimi 全部列为「可用」——用户一选就在 spawn 时被目录校验拒掉（运行期有兜底：arena `skills/arena/SKILL.md:17`「If a configured model fails validation against the model catalog, run that seat on the session model and say so」，但提议本身就失效了）。第一轮 §2.5 标的 `[需实测]` 一致性问题就此坐实。

### 2.3 `~/.zcode/v2/provider_config.json` —— GUI 设置侧实配（**tier-2 应改读的主文件**）

- [本机] 时间戳 2026-10-12（五文件中最新，最贴近用户近期意图）。格式：`{schemaVersion, config}`，`config` 下三块：
  - `providerOrder[]`：provider id 顺序。
  - `providerConfigRules.providerRules[]`：每项 `{providerId, providerName, templateId?, config{group, access{type:"api-key", apiKey}, api{type:"openai-chat-completions", baseUrl?}, personalModelIds[], modelOrder[]}}`。`access.apiKey` 含真实密钥（本报告 `<redacted>`；setup 任何输出不得复述，包括嵌套对象）。
  - `modelConfigRules.providerModelRules[]`：每项 `{modelId, providerId, config{enabled?, properties{contextWindow, inputFormat, …}, optionSpecs{maxOutputTokens}}}`——**这里出现 `enabled: false`**，是模型级停用开关。
- [本机] 实配 4 个 provider（结构脱敏）：

| providerId | providerName | baseUrl | modelOrder / personalModelIds | 备注 |
|---|---|---|---|---|
| `42c7e100-ae54-4b64-8d9d-45ae140c57db` | 2026 微信小程序开发大赛 CodingPlan Token | `https://chatapi.weixin.qq.com/openai/v1` | `GLM-5.2`、`Deepseek-v4-flash` | **同一 provider 挂两个家族**；Deepseek-v4-flash 在屏蔽名单 |
| `bigmodel-standard-api` | BigModel API | （默认 open.bigmodel.cn） | 23 个 GLM 系模型：`GLM-5.3`、`GLM-5.3-Flash`、`GLM-5V-Turbo`、`GLM-5.1`…`GLM-4.5-Air`、`codegeex-4`、`charglm-4` 等 | 个人 API key |
| `deepseek` | DeepSeek | `https://api.deepseek.com` | `deepseek-flash`、`deepseek-v4-pro` | `deepseek-flash` 在屏蔽名单；`deepseek-v4-pro` 是可提议的异家族候选 |
| `new-provider` | llama.cpp | `http://127.0.0.1:8027/v1` | `Qwen3.6-35B-A3B`（enabled: true）、`Qwen3.8-27B`（**enabled: false**） | 本地服务，提议时有「服务是否在跑」的保留 |

### 2.4 `~/.zcode/v2/config.json` —— CLI 侧 provider 注册表（含 reasoning variants）

- [本机] 格式：顶层只有一个键 `provider`，是 providerId → 对象的映射：`{name, kind: "anthropic"|"openai-compatible", options{apiKey <redacted>, baseURL}, enabled: bool, source, systemDisabledReason?, models}`。`models` 是 modelId → `{name?, reasoning{enabled, variants[], defaultVariant}, limit{context,output}, modalities{input[],output[]}, zcode{modified,priority}}` 的映射——**逐模型 reasoning 档位就在这里**（正是 tier-1 ListModels 会给的 `reasoningLevels`，tier-2 也能拿到）。
- [本机] 内容（脱敏摘录）：
  - `builtin:bigmodel`（enabled: **true**）：`GLM-5.3`、`GLM-5.3-Flash`（均 variants `["low","max","high"]`，default `max`，context 1M）、`glm-5v-turbo`（variants `["enabled","off"]`）。
  - `builtin:bigmodel-coding-plan`（enabled: **true**）：`GLM-5.3`、`GLM-5.3-Flash`、`GLM-5.2`、`GLM-5-Turbo`。
  - `builtin:zai`、`builtin:zai-coding-plan`、`builtin:zai-start-plan`（enabled: **false**，`systemDisabledReason: "oauth_provider_inactive"`）。
  - `builtin:bigmodel-start-plan`（enabled: **false**，`coding_plan_not_entitled`）。
  - `42c7e100…`（微信大赛 token，kind openai-compatible，无 enabled 字段）：`GLM-5.2`（context 200k）、`Deepseek-v4-flash`（variants `["off","high","max"]`）。
  - `5274e50d-f4b8-43f4-82e1-c8b24aebad40`「智谱 GLM」：`GLM-5.2`。
- **关键缺口：与 provider_config.json 不重叠**。`deepseek`、`bigmodel-standard-api`、`new-provider`（llama.cpp）只存在于 provider_config.json；builtin 系只存在于本文件。两个注册表服务不同 UI/路径，tier-2 必须**取并集按 providerId 去重**，不能只读其一。

### 2.5 `~/.zcode/v2/credentials.json` 与 `~/.zcode/v2/coding-plan-cache.json` —— account 系 provider 与 entitlement

- [本机] credentials.json（结构脱敏）含：`account-provider:coding-plan:account:bigmodel-individual-coding-plan:account:<id>:api-key`、`account-provider:coding-plan:account:bigmodel-team-coding-plan:…:api-key`、`oauth:bigmodel:access_token`、`oauth:active_provider`。即会话模型 `account:bigmodel-individual-coding-plan/GLM-5.3` 的 provider（`[宿主事实]` 系统提示原文）由 OAuth 账号体系驱动，**其模型目录不在任何本地配置文件里**（运行时拉取）。setting.json 的 `providerFamilyConnectionSelections: {zai/bigmodel: {kind: "individual-coding-plan"}}`、`modelProviderFamilyModes: {zai/bigmodel: "oauth"}` 佐证（[本机]）。
- [本机] coding-plan-cache.json：`builtin:bigmodel-coding-plan: available`；zai 两档与 `builtin:bigmodel-start-plan`: `unavailable (coding_plan_not_entitled)`。entitlement 的缓存态可读，但只覆盖 coding-plan 系 builtin。
- 旁证：`bots-model-cache.v2.json`（[本机]）里一个 WSL 工作区的模型选择器历史，`option value` 形如 `builtin:bigmodel-coding-plan/GLM-5.2`，附 `modelProviderId/Name` 与 thought_level 选项（`max/high/nothink`）——证明「选择器地址 = `providerId/modelId`」是宿主原生约定，与 `[宿主事实]` ListModels/CreateWorkflow schema 一致。

### 2.6 kimi 的实际情况

对 `~/.zcode/v2/*.json` 与 `~/.zcode/cli/config.json` 全量 grep `kimi|moonshot`：**只有 model-providers.json 模板命中**（[本机]）。即本机当前没有任何带密钥的 kimi/moonshot 实配。用户记忆中的「还有 kimi」可能指：(a) 模板里见过；(b) BigModel 账号计划目录里的 `kimi-k2.6`（account 系目录本地不可枚举，无法证实）。无论哪种，**tier-2 当前检测不到 kimi，多样性提议不得包含它**。

---

## 3. 家族判定规则建议

### 3.1 判定顺序：modelId 优先，providerId 兜底

实证依据：provider `42c7e100…` 同时挂 `GLM-5.2` 与 `Deepseek-v4-flash`（§2.3）——providerId 单独不足以定家族；反例方向也成立：`builtin:bigmodel`/`account:bigmodel-*` 的模型 id 未必以 `glm-` 开头（实配里有 `codegeex-4`、`charglm-4`，§2.3）。故规则定为：

1. **先按 modelId 正则判家族**（大小写不敏感）；
2. modelId 无命中时，**按 providerId 前缀兜底**（builtin/account 模板系必有默认家族）；
3. 仍无命中 → 家族记 `unknown`，不参与「异家族」计数，但可出现在自定义选项里（用户自担）。

### 3.2 modelId 判定表（覆盖本机实配 + 常见家族）

| 家族 | modelId 正则（不区分大小写） | 本机实例 |
|---|---|---|
| glm | `^glm[-_ ]?\d` 或 `^glm-` | `GLM-5.3`、`GLM-5.3-Flash`、`GLM-5.2`、`GLM-5-Turbo`、`glm-5v-turbo` |
| deepseek | `^deepseek[-_ ]?` | `deepseek-v4-pro`、`deepseek-flash`、`Deepseek-v4-flash`（后两者屏蔽） |
| kimi | `^kimi[-_ ]?` 或 `^k\d(\.\d)?([-_ ]\|$)` | 仅模板（`kimi-k2.6` 等），本机无实配 |
| qwen | `^qwen` | `Qwen3.6-35B-A3B`（本地 llama.cpp） |
| claude | `^claude` | 无实配（仅 openrouter 模板 `anthropic/claude-*`） |
| gpt/openai | `^gpt`、`^o\d`、`^codex` | 无实配 |
| grok | `^grok` | 无实配 |
| gemini | `^gemini` | 无实配 |
| minimax | `^minimax` | 无实配 |
| mimo | `^mimo` | 无实配 |
| codegeex | `^codegeex` | `codegeex-4`（bigmodel-standard-api 实配；可单列或并入 glm 系——建议单列，训练谱系不同） |
| （openrouter 双段 id） | `^<vendor>/` 取 vendor 段再套上表 | `moonshotai/kimi-k2.6` → kimi；`x-ai/grok-4.20` → grok |

### 3.3 providerId 兜底表（本机实证前缀）

| providerId 模式 | 兜底家族 | 本机实例 |
|---|---|---|
| `^builtin:bigmodel` / `^builtin:zai` / `^account:bigmodel` | glm | `builtin:bigmodel-coding-plan`、`account:bigmodel-individual-coding-plan` |
| `^deepseek` / `^default-deepseek` | deepseek | `deepseek` |
| `bigmodel-standard-api` | glm | （modelId 已能判定，兜底几乎不用） |
| `default-moonshot` | kimi | 模板 |
| `default-qwen` | qwen | 模板 |
| UUID 自定义（`new-provider`、`42c7e100…`） | **无兜底**（多家族实证） | 必须靠 modelId |

### 3.4 本机可用模型清单（家族视角，脱敏，2026-10-16）

| 家族 | 可用（enabled 且有 access） | 说明 |
|---|---|---|
| glm | `account:bigmodel-individual-coding-plan/GLM-5.3`（会话模型，[宿主事实]）；`builtin:bigmodel/GLM-5.3`、`builtin:bigmodel/GLM-5.3-Flash`；`builtin:bigmodel-coding-plan/GLM-5.3`、`/GLM-5.3-Flash`、`/GLM-5.2`；`bigmodel-standard-api/GLM-5.3` 等 23 个 | zai 系全 disabled；GLM 家族冗余多，提议时选一个代表即可 |
| deepseek | `deepseek/deepseek-v4-pro` | **屏蔽**：`deepseek/deepseek-flash`、`42c7e100…/Deepseek-v4-flash`（付费 flash，明令排除） |
| qwen | `new-provider/Qwen3.6-35B-A3B` | 本地 llama.cpp（127.0.0.1:8027），服务在跑才可用；`Qwen3.8-27B` enabled: false |
| kimi | （无） | 仅模板，不可提议 |

**结论：本机满足「≥2 异家族可用」（glm + deepseek，可加 qwen 作带保留的第三家）**，异家族面板提议在本机成立。

---

## 4. 面板写入形态（models.md 里面板行长什么样）

### 4.1 现状格式（来源：`skills/setup-pstack/SKILL.md:41-62` 写入模板 + 各消费方）

- 值语法：`inherit-parent`（省略 spawn `model`，跑会话模型）或 `providerId/modelId[@<level>]`（实模 + 档位；`skills/setup-pstack/SKILL.md:43` 注释行原文）。面板角色是逗号分隔列表，**一项一个子代理，别名项也占 fan-out 名额**（L31 原文「one subagent runs per entry, alias entries included, so the list length sets the count」）。
- 4 个面板行及其消费方：
  - `arena runners`：`skills/arena/SKILL.md:17`——缺失时默认**一个** `inherit-parent` 项；「Use the same model N times when the work is generation-bound」。
  - `arena cross-judge pool`：`skills/arena/SKILL.md:30`——列表但只**选一**，且「Prefer an entry whose model's provider differs from the parent's when possible」（按 provider 差异，非家族差异——见 §6 风险）。
  - `architect runners`：`skills/architect/SKILL.md:31`——缺失时默认**两个** `inherit-parent` 项（Phase B 硬要求 ≥2 个结构不同候选）。
  - `interrogate reviewers`：`skills/interrogate/SKILL.md:27`——一项一个 reviewer（Reviewer A/B/…），缺失时单个 `inherit-parent`。
- `swarm workers` 是标量不是面板（`skills/swarm/SKILL.md:22`），race 才按臂指定模型。
- 面板 fan-out 走 dynamic workflow，逐项 pin 各自 model+level（`skills/arena/SKILL.md:22`、`skills/swarm/SKILL.md:27`、`skills/interrogate/SKILL.md:27`）。

### 4.2 多样性默认面板的写入形态（建议）

以本机为例（budget=large 映射后 GLM 系顶档是 `max`，DeepSeek v4-pro 无本地档位记录则不带 `@`）：

```
arena runners: inherit-parent, deepseek/deepseek-v4-pro
arena cross-judge pool: inherit-parent, deepseek/deepseek-v4-pro
architect runners: inherit-parent, deepseek/deepseek-v4-pro
interrogate reviewers: inherit-parent, deepseek/deepseek-v4-pro
```

要点：

- **第一席用 `inherit-parent` 而非钉死 GLM**：保留「跟随会话模型」的动态语义（ADR-0005 的核心资产），用户换会话模型时面板自动换第一席；第二席钉异家族实模，保证异 provider 互查。cross-judge 的「prefer provider differs from the parent's」在此形态下天然成立：父是 GLM → 选 deepseek 席；父是 deepseek → 选 inherit 席（GLM）。
- 只写 4 个面板行，**其余 13 行保持 `inherit-parent`**——不扩大第一轮决策的改动面（ADR-0005：标量角色差异须预设 agent 文件、新会话才生效；面板行是列表直接点名模型，不生成预设，`skills/setup-pstack/SKILL.md:64` 原文「except the panel roles, whose lists name models directly」）。这是「面板先行」的最大结构性优点：**面板多样性不需要任何预设 agent 文件，spawn 参数即时生效**。
- 档位遵循 budget 步骤（3b）统一施加：`@<level>` 取「≤ 目标的最高档」（`skills/setup-pstack/SKILL.md:29`）；tier-2 数据源里 `v2/config.json` 的 `reasoning.variants` 提供 GLM 系 `low/high/max`；`deepseek-v4-pro` 无档位记录则省略 `@`（同 L29「a model with no levels keeps its own default」）。
- 本地 Qwen 第三席（可选）：`new-provider/Qwen3.6-35B-A3B` 仅当用户在提议里明确接受「本地 llama.cpp 需在跑」的保留时才写入。

---

## 5. setup-pstack 集成点与提问 UX 草案

### 5.1 检测步骤（步骤 1）的修订建议

现状原文（`skills/setup-pstack/SKILL.md:14`）：

> 「query the model catalog tool first… When no catalog is available, read `~/.zcode/v2/model-providers.json` and list every configured provider's models (never quote its API keys). When neither source yields models, ask the user to paste the model ids they have access to.」

问题：tier-2 只读 model-providers.json 会把 8 个无密钥模板的模型全当可用（§2.2）。建议改为三级中的第二级拆成两读一滤：

1. tier-1：ListModels（可用时最准，含 `[current]`/`disabled` 标记，`[宿主事实]` schema 原文）。
2. tier-2（改）：读 `~/.zcode/v2/provider_config.json`（`providerRules[].config.modelOrder ∪ personalModelIds`，须有 `access`）∪ `~/.zcode/v2/config.json`（`provider[].models` 键，须 `enabled !== false` 且无 `systemDisabledReason`），按 providerId 去重成 `providerId/modelId` 清单；**`~/.zcode/v2/model-providers.json` 降级为家族兜底元数据（providerMappings/模板 id），不再当可用清单**。`reasoning.variants` 一并记录作档位数据。任何输出不得复述 `access.apiKey`/`options.apiKey`（嵌套对象也不行——本次调研实证该字段藏在 `access{apiKey}` 里）。
3. tier-3：问用户粘贴（现状保留）。
4. **屏蔽过滤（新增，写进技能正文）**：检测集永远剔除 `/deepseek[-_]?v?\d*[-_]?flash/i`（用户明令：GLM 平台付费 deepseek-flash 系绝不提议）。
5. **会话模型家族（tier-0 常量）**：从会话自身系统提示读当前 `providerId/modelId`（`[宿主事实]`），不需任何文件——异家族判定以它为基准。

### 5.2 提议触发条件

- 可用清单（过滤屏蔽后）含 ≥2 个**不同家族**，且至少 1 个非会话家族的实模 → 触发提议。
- 本机今日快照：glm + deepseek（+ qwen 带保留）→ 触发。
- 只有单家族（如只有 GLM 系多个 provider）→ 不问，静默保持全继承（第一轮 ADR-0005 语义不变）。

### 5.3 提问 UX 草案（插在步骤 3(a) budget 之后、3(c) 确认之前）

沿用技能现有 AskUserQuestion 风格（固定标签 + 破折号说明，参照 `skills/setup-pstack/SKILL.md:22-27` 的 `unlimited — max reasoning` 系列与 AskUserQuestion schema 约束：标签 1-5 词、推荐项列首位标注 "(Recommended)"）：

- **问题**："检测到 2 个可用模型家族（GLM、DeepSeek）。要不要用异家族默认面板？面板行第一席跟随会话模型，第二席用另一家族交叉互查——更抗盲区，也更花 token。"
- **选项**（单选）：
  1. `异家族面板 — GLM × DeepSeek (Recommended)` — 描述：4 个面板行写 `inherit-parent, deepseek/deepseek-v4-pro`；其余角色保持 `inherit-parent`。运行期面板即生效。
  2. `保持全继承 — 单模型` — 描述：所有角色 `inherit-parent`（现状默认）。以后随时重跑 `/pstack-setup-pstack` 换。
  3. `逐角色自定义` — 描述：跳过预设，直接进步骤 3(c) 逐角色确认，检测到的模型 + `inherit-parent` 都可选。
- 措辞原则：选项标签里**写具体模型 id**（让用户看清要花谁的钱）；描述里给退路（重跑可换）；不推销第三席本地 Qwen，除非用户主动问（本地服务可用性不可保证）。
- **回退**：用户拒答/工具不可用/选 2 → 一律按全继承走（等于现状）。被拒的提议**不写入任何状态**，幂等重跑（L29「keep any role you changed」只保留用户改过的）不受污染——注意实现上「拒绝」不能被记成「用户把面板行改成了 inherit-parent」，否则违背 L18 的「无文件即默认」语义。

### 5.4 与现有步骤的衔接

- 提议采纳后：步骤 3(b) budget 照常施加（面板实模一并调档），步骤 3(c) 确认表里 4 个面板行显示两席列表，步骤 5 写入时面板行带列表、不生成预设文件（L64 已有此豁免）。
- ADR-0005 的表述需要一条增量：「默认全 inherit-parent」升级为「默认全 inherit-parent；setup 检测到 ≥2 异家族可用时**主动提议**面板双席，用户可一键拒绝回到全继承」——开箱单模型 → 开箱即问，决策权仍在用户。

---

## 6. 风险

| # | 风险 | 证据 | 缓解 |
|---|---|---|---|
| 1 | **tier-2 过检**（把模板当实配）：现状 SKILL.md L14 指定读 model-providers.json，会列出 openrouter 24 模型/kimi 等跑不了的 | §2.2；8/9 模板无密钥 | 检测改读 provider_config.json ∪ v2/config.json（§5.1）；model-providers.json 降为家族元数据 |
| 2 | **家族误判**：一个 provider 挂多家族（42c7e100 同时挂 GLM 与 Deepseek）；`bigmodel-standard-api` 挂 codegeex 等边缘 id | §2.3 | modelId 优先判家族、providerId 只兜底（§3.1）；unknown 家族不进异家族计数 |
| 3 | **屏蔽模型漏网**：deepseek-flash 有两个现身形态（`deepseek/deepseek-flash` 官方、`42c7e100…/Deepseek-v4-flash` 微信计划），大小写/版本号变体多 | §2.3 | 检测集硬过滤 `/deepseek[-_]?v?\d*[-_]?flash/i`，写进技能正文并在提议文案里声明该家族 flash 系被排除（用户明令） |
| 4 | **本地 provider 运行期不可用**：llama.cpp（127.0.0.1:8027）配置了但服务器未必在跑 | §2.3 new-provider | 提议默认只用云端/API 系；本地模型仅在用户明确选择时写入，并在确认表标注「需本地服务在线」 |
| 5 | **account 系目录不可枚举**：会话模型 provider（account:bigmodel-*）的模型清单不在本地文件，ListModels 又不可用 | §2.5；§2.1 | 第一席用 `inherit-parent` 表达会话模型（不需枚举其目录）；只对配置文件里实证的模型写裸 id |
| 6 | **cross-judge 按 provider 而非家族选异**：`arena:30` 措辞是「provider differs」——若面板是 `builtin:bigmodel/GLM-5.3` + `account:bigmodel…/GLM-5.3`（同家族不同 provider），cross-judge 会认为已满足「异」而失去家族互查意义 | `skills/arena/SKILL.md:30` | 提议形态用 `inherit-parent + 异家族实模` 规避；中期可把 arena 措辞的 provider 比较升级为家族比较 |
| 7 | **用户拒答后的回退与幂等**：拒绝若被记成显式选择，重跑时 L29 的「keep any role you changed」会永远锁定全继承，用户后来想采纳也不被再问 | L18/L29 语义 | 拒绝只影响本次运行；重跑且检测条件仍满足时允许再问（或 models.md 里不写面板行即代表未决策） |
| 8 | **提问本身扰民**：每次重跑都问 | setting.json `askUserQuestionAutoResolutionEnabled: false`（[本机]，问题不会被自动消解，必须真人答） | models.md 已存在且面板行非默认时不再问；只在「无文件」或「面板行仍为默认值」时问一次 |
| 9 | **密钥泄漏面**：tier-2 数据源含 `access.apiKey`（嵌套）、`options.apiKey`；本次调研实证嵌套对象最易被 stringify 带出 | §2.3 | 技能正文保留「never quote its API keys」并扩到嵌套字段；检测产物只保留 `providerId/modelId`、enabled、reasoning variants |

---

## 附：本次一手读取的文件清单

- 仓库：`skills/setup-pstack/SKILL.md`（全文）、`skills/arena/SKILL.md`（全文）、`skills/swarm/SKILL.md`（全文）、`skills/architect/SKILL.md`（全文）、`skills/interrogate/SKILL.md`（全文）、`skills/poteto-help/SKILL.md`（grep 定位 L27-43,87,132-134）、`skills/poteto-mode/SKILL.md`（grep 定位 L92-96）、`docs/adr/0005-model-roles-hybrid.md`（全文）、`docs/research/model-system-mapping.md`（全文）。
- 本机（只读、脱敏）：`~/.zcode/v2/model-providers.json`、`~/.zcode/v2/provider_config.json`、`~/.zcode/v2/config.json`、`~/.zcode/v2/setting.json`（顶层键+ provider 相关键）、`~/.zcode/v2/credentials.json`（仅键名结构）、`~/.zcode/v2/coding-plan-cache.json`、`~/.zcode/v2/bots-model-cache.v2.json`、`~/.zcode/v2/model-provider-display-order.json`、`~/.zcode/cli/config.json`（顶层键）、`~/.zcode/agents/`（目录列表）。
- 工具实测：ListModels（2026-10-16，`model_catalog_unavailable`）。
