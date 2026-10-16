# 保存的 dynamic workflow：存储格式与再生成机制调研

日期：2026-10-16。目标：让 `/pstack-setup-pstack` 写完 `~/.zcode/pstack/models.md` 后能自动检测并重新生成过期的保存 workflow，消除第一轮已知限制「面板 pin 真模型后需手动重新生成」。本机为零安装状态（`~/.zcode/workflows/` 为空，属正常——第一轮保存的 workflow 已撤除），格式依据来自官方技能文档 + 本机 draft 残留实证 + 第一轮调研文档。

## 来源标注

- `[S-§N]` = 本机内置技能 `C:\Program Files\ZCode\resources\glm\packages\bundled-skills\skills\dynamic-workflows\SKILL.md`（1594 行全文通读）。
- `[工具描述-<名>]` = 本会话宿主实际提供的工具 schema 原文。
- `[D-arena]` / `[D-swarm]` = 本机残留的第一轮面板 workflow 草稿：`.zcode/workflow-drafts/README-badge-评审面板.dwf.ts`（135 行）、`.zcode/workflow-drafts/四模块并行蜂群.dwf.ts`（79 行）——CreateWorkflow inline script 的落盘副本，与保存版共享脚本正文。
- `[cap-§N]` = 第一轮调研 `docs/research/zcode-workflows-capability.md`（其结论引上游源码 `docs/dynamic-workflow/*.md`，来源键见其文首）。
- `[audit-§E]` = `docs/research/adaptation-audit.md` 第五节 E（票#7）。
- `[sess-残留]` = `~/.zcode/cli/agents/sess_e7fae3dd.../task.output`（此前一次 headless 权限调研的会话残留，引 `save-workflow.ts:286`）。
- `[推断]` = 文档未明说、由证据推出的结论，均单独标注。

## 一、结论速览

1. **格式**：保存的 workflow 是单个 TypeScript 文件：`/* zcode-workflow` YAML 元数据块 + 脚本正文 verbatim。全局在 `~/.zcode/workflows/<name>.dwf.ts`，项目级在 `.zcode/workflows/<name>.dwf.ts`（随仓库提交）[S-§16.5]。pstack 面板保存名与位置：`pstack-arena`、`pstack-swarm`、`pstack-interrogate`，均 global（三个技能正文各自明写 "global scope"）[skills/arena/SKILL.md L24、skills/swarm/SKILL.md L29、skills/interrogate/SKILL.md L31]。
2. **技能内调用可行**：SaveWorkflow 是宿主工具，任何技能正文都能指示 agent 调用它（pstack 技能本来就以「正文指示调工具」的形态工作）。唯一硬前置：**会话内必须先有一次成功的 `Skill(dynamic-workflows)` 调用**，否则 SaveWorkflow 被拒（业务码 428）[S-§16 开头五工具清单][工具描述-SaveWorkflow][cap-§6]。`ListSavedWorkflows` 不在该清单内，其描述亦无前置要求 → 无技能门。
3. **重生成的正确姿势**：**用 SaveWorkflow 同名再保存**——正文明说 "Saving over an existing name replaces that workflow... reuse a name to update"，确认窗会显示是新建还是覆盖 [S-§16.5]。内容已变，天然走 inline `script`；`script_path` 的本义是「不重发脚本正文」，不适用于内容重写场景（详见 §四）。
4. **每次保存都弹确认**：SaveWorkflow 带 alwaysAsk 语义（源码 `save-workflow.ts:286`），连 yolo/headless 都不豁免 [sess-残留]——重生成会多一次用户确认，属设计内交互。
5. **检测可全机械化**：第一轮保存版内嵌了两类可比锚点——「仅支持 inherit-parent」守卫（args 默认值 + 运行时 `throw`）与（重生成后的）`model("…")` / `model: "…"` 编译期字面量。models.md 面板行 ↔ 保存文件锚点，正则即可判定新鲜/过期（§五）。
6. **冲突面小而集中**：改动落在 `skills/setup-pstack/SKILL.md` 一个 upstream 文件（+10~20 行英文机制段）；arena/swarm/interrogate 的既有兜底句无需动（§七）。

## 二、保存 workflow 文件格式

### 2.1 位置与命名（文档明说）

- 项目级：`.zcode/workflows/<name>.dwf.ts`，"committed with the repository"；全局级：`~/.zcode/workflows/<name>.dwf.ts`，"available from every project on this machine" [S-§16.5]。
- `<name>` 是 file-safe 标识符（字母、数字、点、连字符、下划线）[工具描述-SaveWorkflow]；文件名即调用名（`CreateWorkflow saved: { name }`）。
- 同名遮蔽：项目保存可 `shadowing: hides_global`（遮蔽同名全局）或被标记 `hidden_by_project` [工具描述-SaveWorkflow]。pstack 面板全在 global，检测时以 `~/.zcode/workflows/` 为准；若用户在项目里建了同名遮蔽版，属用户主动行为，不在 setup-pstack 管辖内。
- 本机现状：`~/.zcode/workflows/` 存在但为空（0 文件）；项目 `.zcode/workflows/` 不存在。零安装撤除所致，正常。

### 2.2 文件结构（文档明说 + draft 实证）

[S-§16.5 原文] "The saved file is valid TypeScript: a `/* zcode-workflow` block of YAML metadata, then the script verbatim."

实证来自两个第一轮 draft 副本（`.dwf.ts` 扩展名与 CreateWorkflow 落盘一致）：

```ts
/* zcode-workflow
description: <一句话描述，含「/pstack-arena 技能的 workflow 执行载体」字样>
args:
  baseRef:
    type: string
    description: ...
    default: HEAD~1
  runners:
    type: json
    description: ...来自 ~/.zcode/pstack/models.md 的 arena runners 行...
    default:
      - inherit-parent
  rubric:
    type: json
    required: true
*/
interface CandidateReport { ... }   // 脚本正文 verbatim
```
（依据 [D-arena L1-32]；[D-swarm] 同构，args 为 briefs/gateCode/workersModel）

metadata 块字段清单：
- **description**：实证在块内 [D-arena L2]。
- **args 声明**（type/description/required/default）：实证在块内 [D-arena L4-31]。`CreateWorkflow saved` 运行前会据此校验参数 [S-§16.1]。
- **name**：由文件名承载（`<name>.dwf.ts`），块内未见 [推断自样例]。
- **scope / whenToUse / run_id**：是 SaveWorkflow 的调用字段 [工具描述-SaveWorkflow]；是否写入保存文件的块内**未确证**（本机无保存产物样例）。`run_id` 自述 "Provenance only... does not change what is saved" [工具描述-SaveWorkflow]。
- 块是机器可解析且可被手改的：手改坏块会让该文件进 `ListSavedWorkflows` 的 `invalid` 列表（"usually a hand-edited metadata block"）[工具描述-ListSavedWorkflows]。
- **`script_path` 保存时块被丢弃**："a `/* zcode-workflow` block in that file is dropped, because the metadata comes from this call's fields" [S-§16.5]。

### 2.3 保存时的编译检查（文档明说）

"The script is typechecked by the same compiler as `CreateWorkflow`, before the user is asked; diagnostics mean nothing was written" [S-§16.5]。即 9010（模型必须编译期字面量）在保存时就会拦截；9011（模型名对宿主模型目录解析）文档保证发生在启动前 [cap-§4]，保存时是否也解析**未确证**。setup-pstack 自身的「检测集校验」（步骤 4）是更靠前的闸门。

## 三、第一轮的实际实现形态（draft 实证，检测方案的事实基础）

第一轮面板 workflow 采用「**守卫版**」形态 [D-arena L59-71][D-swarm L29-36]：

- 模型表经 **args** 传入（`runners`/`judgeModel`/`workersModel`），全继承配置下不需要任何模型字面量——`agent()` 不传 `model` 即会话模型；
- 正文带运行时守卫：

```ts
// 模型必须在脚本声明期可知；本保存版承载全继承配置，真实模型 pin 按 /pstack-arena 技能重新生成并保存。
for (const entry of [...runners, judgeModel]) {
  if (entry !== "inherit-parent") {
    throw new Error(`配置了非 inherit-parent 模型 "${entry}"：按 /pstack-arena 技能，models.md 变更后需重新生成并保存 pstack-arena 工作流`);
  }
}
```
（[D-arena L66-71] 原文；swarm 同构 [D-swarm L33-36]）

- 这就是 audit 记录的 fail-closed：编译器拒绝运行时字符串 pin 模型（9010），故配置真实模型后必须重生成出「**字面量版**」——模型 id 展开为 `model("providerId/modelId$level")` 或 persona `{ model: "literal" }` 编译期字面量 [cap-§4][cap-§7b 约束 1][S-§16.2 facade]。字面量版里 args 只能传「选择哪些 arm」的键，不能再传新模型 slug [cap-§7b]。
- architect 不单独保存 workflow：Phase B 委托 pstack-arena，「Take the runners from the `architect runners` line, in place of the `arena runners` line」[skills/architect/SKILL.md L31]。字面量闭集下这意味着 `architect runners` 行的模型也须进入 `pstack-arena` 的闭集，或以键选择（**设计口径待第二轮拍板**，见 §五注）。

## 四、技能内触发重生成的正确姿势

### 4.1 前置加载规则（文档原文）

- [S- 开头 L11-12 原文] "`CreateWorkflow`, `AmendWorkflow`, `FillWorkflowHole`, `SaveWorkflow` and `EvalWorkflowSnippet` refuse to run until this skill has been loaded."（§16 重述：refuses "until this skill has been loaded **in the session**"）
- [工具描述-SaveWorkflow 原文] "Load the `dynamic-workflows` skill with the Skill tool first... The call is refused until that skill has been loaded in this session."
- 拒绝方式：业务码 428；**会话压缩后技能文本掉出上下文，门会重新关上** [cap-§6，引 AU-"The skill gate"]。
- 豁免：运行 saved workflow（`CreateWorkflow saved:`）不需要技能门 [S-§16.1 "Running a saved workflow is the one call that does not need this skill loaded"]。`ListSavedWorkflows` 不在五工具清单 [S-§16 开头]，其描述无前置要求 → **检测（枚举/读文件）零门槛**。
- 技能正文写法范例（pstack 已有）：arena/swarm/interrogate 的 "Load the `dynamic-workflows` skill, generate the workflow and save it once (`pstack-arena`, global scope)... regenerate and re-save when the configured models change" [arena L24 等三处]。setup-pstack 沿用同款句式，把「regenerate 时机」从「下次跑面板技能时」提前到「本技能写完 models.md 后立即」。

### 4.2 重生成调用形态

首选（文档直给）：

1. `Skill(dynamic-workflows)`（会话内开门）；
2. 按对应面板技能的生成流程产出**新脚本体**（全继承 → 守卫版；含真实模型 → 字面量表版）；
3. `SaveWorkflow`：同名（`pstack-arena` 等）、同 description/args 语义、`scope: "global"`、inline `script`。同名保存即替换（"reuse a name to update" [S-§16.5]）。

关于两条 script 来源：
- **inline `script` 是重生成的自然路径**：内容本来就变了，不存在「不重发」的节省（那 20k token 优化针对的是修订同一脚本重交场景 [S-§13]）。
- **`script_path` 指向已保存文件属次选**：文档语义是「saves a draft a CreateWorkflow or AmendWorkflow result named without re-emitting it」[S-§16.5]，指向非 draft 的已保存文件是否被接受**未确证**（schema 措辞更宽："A file holding the script body" [工具描述-SaveWorkflow]）。若走此路：先 Edit `~/.zcode/workflows/<name>.dwf.ts` 的正文字面量，再 `script_path` 同名重存——块会被自动丢弃、元数据以调用字段为准 [S-§16.5]，且 Edit 用户文件本身要过权限窗，反而更贵。
- schema 的 `overwrite` 布尔（默认 false，"Replace existing generated files"）与正文「同名即替换（确认窗显示 new/overwrite）」的精确关系文档未细说：**保守写法**是技能正文指示 "reuse the name（工具要求时传 overwrite: true）"，实施时一次实测确证。

### 4.3 交互与许可边界

- SaveWorkflow 是 alwaysAsk 工具（`save-workflow.ts:286`），每次保存/覆盖都弹确认，yolo 与 headless 均不豁免 [sess-残留]；SKILL.md 亦要求 "Never unsolicited... that is their decision" [S-§16.5]。
- 对 setup-pstack 的含义：用户运行 `/pstack-setup-pstack` 并确认新配置 = 对「按此配置更新衍生工件」的委托，且重生成是**覆盖**用户先前已同意保存的文件（非新建）；但仍应在步骤 3(c) 的确认里预告「将重新生成保存的 workflow：pstack-arena、pstack-swarm…」，把交互收敛为「一次配置确认 + 每文件一次覆盖确认」[建议，依据 S-§16.5 的同意语义]。
- headless 场景（CI 等无用户应答）SaveWorkflow 会被拒 [sess-残留]——setup-pstack 是交互式技能，不构成阻碍，但集成正文应写明「被拒即如实报告跳过」，不重试死循环。

## 五、变更检测方案（机械可执行）

输入：`~/.zcode/pstack/models.md` 的面板行（`arena runners`、`arena cross-judge pool`、`swarm workers`、`architect runners`、`interrogate reviewers`，格式 `providerId/modelId[@<level>]` 或 `inherit-parent`，setup-pstack 步骤 5 定义）＋ `~/.zcode/workflows/pstack-{arena,swarm,interrogate}.dwf.ts`。

1. **解析面板行** → 每行得模型 id 列表；`@<level>` 归一化为 workflow 字面量的 `$level` 后缀（`providerId/modelId$xhigh`），`inherit-parent` 记为别名。
2. **对每个保存文件**（不存在 → 跳过；不主动新建，新建仍是用户决定 [S-§16.5 "Never unsolicited"]）：
   - 提取 `guardEvidence`：正文含「仅支持 inherit-parent」标记（description/args 注释）或 `throw new Error(...inherit-parent...)` 运行时守卫——第一轮保存版必然含此二锚 [D-arena L11-12/25-27/66-71]；
   - 提取 `pinEvidence`：正则 `model\("([^"]+)"\)` 与 `model:\s*"([^"]+)"` 的字面量集（`$level` 归一化）——字面量版必然可 grep [S-§16.2 facade：model id literal or ModelRef][cap-§4]。
3. **判定**（期望口径须实现时定死，建议）：
   - 该 workflow 服务的面板行**全 `inherit-parent`**：新鲜 ⇔ 有 `guardEvidence` 且 `pinEvidence` 为空；
   - 面板行**含真实模型**：新鲜 ⇔ `pinEvidence` == 该 workflow 服务行的模型并集。建议口径：`pstack-arena` ← `arena runners` ∪ `arena cross-judge pool` ∪ `architect runners`（architect 复用 arena 的保存版 [architect L31]）；`pstack-interrogate` ← `interrogate reviewers`；`pstack-swarm` ← `swarm workers`；
   - 其余情形（含「配置降回全继承但文件是字面量版」）→ 过期 → 按 §四重生成。
4. **附加保险（可选）**：`ListSavedWorkflows` 核对该名是否存在、是否进 `invalid` 列表（手改坏块）[工具描述-ListSavedWorkflows]。
5. 检测全程 Read + grep，零副作用、零技能门（§4.1）；`Skill(dynamic-workflows)` 只在确有过期文件待重生成时才加载（省 ~30k token 技能文本）。

**开放设计点（第二轮拍板，本调研不实施）**：`architect runners` 与 `pstack-arena` 闭集的口径——并集入闭集（architect 传键选 arm）或 architect 行变更也触发重生成。两种都自洽；并集口径下检测规则如上 3。

## 六、setup-pstack 集成点建议（信息性）

落点：步骤 5（写文件与预设）之后、步骤 6（确认）之前，新增一个机制段（英文，与正文一致）：

1. Read 三个保存文件（存在者），按 §五检测；
2. 全新鲜 → 直接进步骤 6（幂等重跑零保存、零确认窗）；
3. 有过期 → 对每个：`Skill(dynamic-workflows)`（首次）→ 按对应面板技能的保存段重新生成脚本体 → `SaveWorkflow` 同名、global、覆盖；
4. 步骤 6 的报告句扩展：检测了哪些、重生了哪些、哪些因未保存而跳过。

容错两句（正文各一行）：
- "If `SaveWorkflow` is refused with the skill-gate error (428), load the `dynamic-workflows` skill again and retry once"——防长流程中途压缩把门关上 [依据 cap-§6 的门语义；重试句本身为建议]。
- "If the save confirmation is refused (e.g. headless), report which saved workflows are stale and continue"——fail-closed 与第一轮守卫的语义一致 [audit-§E]。

## 七、上游同步冲突面评估（只评估，不实施）

- **落点文件**：`skills/setup-pstack/SKILL.md`（upstream subtree 文件；第一轮已重写 72 行，audit 列为 5 个重度文件之一）。本次新增约 +10~20 行英文机制段。ADR-0002 纪律核对：英文 ✓、纯机制段（ZCode 特有 workflow 生命周期，上游无对应文本）✓、不动上游既有句子 ✓、无顺手改写 ✓。
- **冲突形态**：纯新增块。上游若重写 setup-pstack 步骤 5/6 邻近文本，冲突概率低-中；相对该文件既有的 72 行重写面，增量不显著抬升合并风险。
- **不动 arena/swarm/interrogate**：三处 "regenerate and re-save when the configured models change" 是运行时兜底（面板技能跑到一半发现过期也能自救），与 setup-pstack 的主动检测互补。保留原句 → 三个文件零新增 diff。
- **纯新增零冲突件**：本调研文档、后续新 ADR（docs/adr/0008-*）、GLossary 词条（如需）。
- 总评：小而集中的 diff，符合 ADR-0002「same workflow, different editor」的可审读性。

## 八、未确证清单（第二轮实施时一次真实保存即可全部确证）

1. 保存产物的 metadata 块是否含 scope/whenToUse/run_id（本机零样例；§2.2）。
2. `overwrite` 布尔与「同名即替换」的精确关系（§4.2）。
3. 9011（模型名对目录解析）发生在保存时还是仅启动时（§2.3）。
4. `script_path` 指向已保存文件（非 draft）是否被接受（§4.2）。
5. `architect runners` 闭集口径（§五开放设计点）。
