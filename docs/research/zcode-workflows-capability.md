# ZCode 动态工作流（dynamic workflows）能力研究：能否替代嵌套子代理编排、能否承载多模型并行面板

日期：2026-10-15。调研对象：ZCode dynamic-workflow 功能全貌（本机技能文档 + github.com/zai-org/ZCode 源码与规格文档 + 本宿主会话工具面），对照 pstack v0.15.24（本仓库 `pstack/`）的 orchestrate/autopilot/swarm/arena 需求。

## 来源标注约定

- `[S-§N]` = 本机内置技能 `C:\Program Files\ZCode\resources\glm\packages\bundled-skills\skills\dynamic-workflows\SKILL.md`（全文 1594 行已通读），§N 为其分节。
- `[P-#N]` = 同目录 `patterns.md` 模式 #N。
- `[E-#N]` = 同目录 `examples.md` 示例 #N。
- `[EE-<节名>]` = 开源仓库 `apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`（执行引擎规格，Status: implemented）。
- `[CC]` = 仓库 `docs/dynamic-workflow/concurrency.md`（并发规格）。
- `[AU-<节名>]` = 仓库 `docs/dynamic-workflow/authoring.md`（编写面规格）。
- `[LA-<节名>]` = 仓库 `docs/dynamic-workflow/launch.md`（启动面规格）。
- `[WAT]` = 源码 `apps/zcode-cli/packages/bootstrap/src/app/workflow-actor-tools.ts`。
- `[SCR]` = 源码 `apps/zcode-cli/packages/bootstrap/src/app/script-workflow-child-runtime.ts`。
- `[TI]` = 源码 `packages/core/src/tool/handlers/index.ts`、`packages/core/src/runtime/helpers/runtime-tools.ts`、`packages/core/src/runtime/methods/subagent.ts`。
- `[宿主事实]` = 本会话宿主实际提供的工具 schema（CreateWorkflow/AmendWorkflow/ResumeWorkflowRun/GetWorkflowRun/ListWorkflowRuns/ListSavedWorkflows/SaveWorkflow/FillWorkflowHole/ResolveWorkflowQuestion/EvalWorkflowSnippet 均在场）。
- pstack 侧：`pstack/skills/poteto-mode/SKILL.md`、`pstack/skills/poteto-mode/playbooks/orchestrate.md`、`.../autopilot-full.md`、`pstack/skills/swarm/SKILL.md`、`pstack/skills/arena/SKILL.md`、`pstack/agents/poteto-agent.md`（均逐字读过）。

## TL;DR

1. **工作流不是「提前写死的脚本」**。CreateWorkflow 的 inline `script` 允许主代理在对话中当场编写、当场类型检查、当场（经用户确认后）启动；FillWorkflowHole 让运行中的工作流停在「洞」处由主代理现场续写代码；AmendWorkflow 可以在运行中/出错/完成后携带修订脚本重启并按名字+指令哈希导入已完成工作为零成本缓存。**运行时动态修改是设计目标而非漏洞**[S-§13/§15/§16.4]。
2. **编排者是脚本不是子代理**。循环、条件、扇出、流水线全部是 TypeScript 控制流，子代理（actor）只是脚本里 `agent().ask()` 的调用对象[EE-"From script to sandbox input"]。因此「脚本 → actor」这层天然绕开「子代理不能再 spawn 子代理」的限制——但也**只绕开这一层**：actor 自己仍然不能 spawn 子代理（runtime 显式 `subagents: { enabled: false }`）也不能提交新工作流（CreateWorkflow/AmendWorkflow 在减法表里）[SCR L143][WAT L36-48]。有效模型上下文深度 = 主代理 → actor，共 2 层；但编排逻辑深度不受限，因为它住在确定性代码里。
3. **多模型并行面板是强匹配**。每个 `agent()` 可单独指定模型（persona `{ model }`，支持 `model()` 路由表、字符串字面量联合、`$reasoningLevel` 后缀），全部模型在启动前经编译器闭集校验并在确认窗向用户公示[LA-"Models the script names"]。arena/swarm/interrogate 式「N 模型互查」可以直接映射。
4. **orchestrate depth-3 映射成立但要改造**：poteto-agent 的「编排职责」（排队、派生、上下文转递、验证门控）上移到脚本；「判断职责」（brief 质量、冲突裁决）下移到脚本内的判断 actor 或经 `escalate`/hole 交给主代理。worker 跑自包含 brief（GOAL/SCOPE/ACCEPTANCE/VERIFY 单文档）没问题；跑「需要继续派生」的 playbook（sub-coordinator、swarm-verify 的 owner）不行——那些派生决策必须由脚本表达。
5. **主要缺口**：无 cloud environment 等价物（actor 全部本地跑）；模型闭集约束（运行时不能凭目录任意挑模型，只能在已声明集合内路由）；「显式请求才启动工作流」+「技能门」两道软/硬闸（pstack 命令需要在其技能文本里显式要求加载 dynamic-workflows 技能并点名工作流）；多天级滚动项目的交互模型（每个增长步都要主会话填洞或 amend）。

---

## 必答问题逐条

### 1. 脚本是「提前写好」还是「运行时动态生成」？

**两者都是，且三层机制都支持运行时演化：**

- **当场编写当场启动**：CreateWorkflow 三个互斥来源之一 `script` 是「a one-off workflow written inline」——主代理在对话中写好 TypeScript，工具先做类型检查（编译错误以诊断形式返回，标注到落盘文件 `.zcode/workflow-drafts/` 的行号），干净编译后弹确认窗（窗内展示真实脚本、阶段图、命令集、模型表），用户确认即在后台启动[S-§16.1][LA-"Input and output"]。落盘路径意味着修订只需 `Edit` 那个文件再以 `path` 重交，不用重发全文[S-§13]。
- **运行中续写（FillWorkflowHole）**：脚本可声明 `hole<T>(name, prompt)`——一个「类型化缺口」。运行到达未填充的洞时该分支停驻，**其余分支继续跑**，主代理收到通知（含洞 site id、提示词带实时值、草稿路径），只发送「洞函数体的语句」，工具把它拼接进原位编译执行，运行继续[S-§15][EE-"Holes"]。引擎侧实现：填充代码经 `eval` 在洞的词法作用域内执行，能看到洞之前声明的所有绑定[EE-"The vm cell"]。官方推荐的「生长模式」是尾洞链：种子脚本只写已知部分，每次 fill 做一步、留下一个新尾洞，直到某次 fill 返回值收链[S-§15 "Grow by tail holes"][P-#14]。**这说明 ZCode 官方把「运行中逐步决定工作流形状」当作一等公民用法**。
- **运行中修订（AmendWorkflow）**：对任何状态的 run（运行中/完成/出错/停止）都能「edit the run's script file and call AmendWorkflow」——同一调用内停掉旧 run（标 superseded）、按名字+指令字节相同匹配导入已完成的 ask 为缓存（零 token 结算）、启动修订版[S-§13/§16.4][EE-"Amend-resume"]。运行中的 run 出错时「repair it while it is still going. … do not wait for it and do not stop it first: call AmendWorkflow on it」[S-§13]。修订还有便宜的调参形态：只改 `max_concurrency` 的 amend 对活 run 原地生效，不产生新 run[CC-"Retuning a live run"]。
- **确定性根基**：这一切可行的前提是引擎对「同脚本+同参数+同世界应答」确定性，重放按 settle 顺序回放调度本身，因此恢复/修订不重跑已完成步骤[EE-"Resume by replay"/"Replaying the settle order"]。脚本内禁 `Date.now()`/`Math.random()`/`fetch`/`fs`/动态 import，一切世界观察走 Boundary A 并进 journal[S-§12][EE-"The vm cell"]。

结论：用户假设「workflow 只是提前写好的 ts 脚本」**低估了它**——inline script + hole + amend 三件套合起来是「运行时演化的编排程序」。

### 2. 编排模型：脚本就是 orchestrator 吗？是否绕开嵌套限制？

**是。脚本就是 orchestrator，且这是绕开 depth-1 限制的唯一合法通道。**

- 架构三层边界：脚本在独立 Node 进程的 `vm.createContext` 沙箱里跑（`node --max-old-space-size=256 <cwd>/.zcode/workflow-runs/<runId>.mjs`），经 NDJSON 与 harness 通信；引擎核心是纯函数（只经 journal 端口做 I/O）；actor 会话由 bootstrap driver 用 `AgentRuntime` 建在**主进程**里[EE-"The shape of a run"/"The sandbox"]。降级表（lowering）显示 `agent()` → `__host.createActor(...)`、`x.ask()` → `__host.ask(...)`，即**每个 facade 调用都是沙箱向引擎的一次请求**，编排逻辑（for/while/if/Promise.all/channel/future）全部留在沙箱里的普通 TS 控制流中[EE-"From script to sandbox input"]。
- 因此「主代理 → 脚本 → actor」中，脚本**不是一个模型会话**，不占模型上下文深度。skill 文档明说：「**No nesting.** Subagents cannot call `CreateWorkflow`; model a big sub-task as more subagents here.」[S-§2]——把大任务建模为脚本里更多的 actor，而不是 actor 里的嵌套。
- 反向确认（源码级）：actor 自己**不能**再编排——
  - dwf actor runtime 显式 `subagents: { enabled: false }` + `taskType: "workflow_child"`[SCR L143-144]；
  - 工具注册规则是「Agent/Task 工具仅当 `includeAgent === true` 才注册」，而该开关只随 `subagentPort` 存在而开[TI: `runtime-tools.ts` L53 + `handlers/index.ts` L230]；
  - 减法表再删 `CreateWorkflow`/`AmendWorkflow`/`EnterPlanMode`/`ExitPlanMode`/`ReadSessionContext`/`ResolveWorkflowQuestion`，child runtime allowlist 另删 `SaveWorkflow`/`ResumeWorkflowRun`[WAT L36-48][EE-"Subagent sessions" L317]。
  - 规格文档明言「workflows do not nest, so `nested_workflow_child` is an unused enum value」[EE-L831]。
- 与普通 Agent 工具 spawn 的关系：普通子代理同样在 spawn 时被配 `subagents: { enabled: false }`[TI: `methods/subagent.ts` L305-308]——这就是 ZCode depth-1 禁令的实现。工作流的价值正是把这层禁令「外包」给确定性代码。

### 3. workflow 子代理的能力边界

**工具面：父会话全集中减一张小减法表。**

- 「The subagent's tool surface is the parent's minus tools that would let it steer the parent or start workflows of its own」——删 `EnterPlanMode`/`ExitPlanMode`/`CreateWorkflow`/`ReadSessionContext`/`ResolveWorkflowQuestion`，child allowlist 另删 `SaveWorkflow`/`ResumeWorkflowRun`；**Bash/Edit/Write/搜索/web 照常保留**（"actor 就是要干活的"）[EE-L317][WAT L28-48]。
- 新增两个控制工具：`submit_result`（typed ask 的结构化提交通道，schema 由脚本声明的 interface 合成，宽限解码 + 3 次拒绝后 ValidationFailed）和 `escalate`（向主代理提问，无超时停驻，仅提问的 actor 停、其余照跑）[EE-"Typed asks and submit_result"/"Escalation"]。
- `AskUserQuestion` **保留**：2026-09-23 起经父会话镜像送达用户，不再悬挂[WAT L7-8][EE-L317][LA-"Permissions inside a run" Questions 段]。
- 权限：actor 跑启动会话的权限模式（Build/Edit/YOLO/Guarded/Auto，plan 剥掉），权限窗经父会话路由、带「子智能体 · <名> (<siteId>@<ordinal>)」来源徽标；模式在 run 创建时一次性定格并随 journal 跨恢复保持[LA-"Permissions inside a run"]。基线 YOLO，dwf actor 经 configOverrides 覆盖为 run 记录的模式[SCR L141-143]。
- MCP/插件工具：`workflowActorToolPolicy` 的注释说明该减法表「只覆盖内建工具；MCP/plugin 工具的过滤留待生产接线时处理（同一个工厂 seam）」[WAT L53-55]。即 dwf policy 不剥夺 MCP 工具（本宿主会话 MCP 工具齐全，actor 继承父面）。Browser Use 还给 dwf actor 派生子端口（tab 归 actor 自己的 sessionId，run dispose 时连 tab 一起关）[SCR L103-110][create-app.ts L712-715 注释]。

**技能：能读，含插件技能，唯独不给 dynamic-workflows 技能本身。**

- 「A subagent's skill port lists the skills the parent's does, including the plugins' … minus the bundled `dynamic-workflows` skill: a subagent cannot start workflows, so teaching it how to write one would only lead it to tools it does not have.」[EE-L327]
- 源码 `createWorkflowChildSkillPort`：用户配置技能根 + 插件技能根（2026-09-30 修复补上插件根），禁用路径照主会话[SCR L275-293]。这对 pstack 关键——poteto-agent 的第一条指令就是「Read the poteto-mode skill's SKILL.md in full before any work」[poteto-agent.md L10]，actor 能通过 Skill 工具/文件读取完成同样的事。

**再派生：不能**（见问题 2 的源码三连）。

**类型化中间结果传递：**

- `ask<T>` 的 T 必须是脚本内声明的 interface/type alias；harness 从类型合成 JSON Schema，actor 以 `submit_result` 提交合规值，违规逐行回报（`<path>: expected <X>, got <Y>`）并在同一 turn 内自我修正[S-§4][S-§16.2][EE-"Typed asks"]。
- 结果在脚本里就是普通 TS 值：插值进下一个 prompt、经 `Promise.all` join、经 `channel<T>()` 在阶段间流式传递（无界 FIFO，`for await` 消费，close 由生产方在 finally 里负责，死锁被 `ChannelDeadlock` 检测器点名）[S-§7][S-§16.2]。
- 传递风格规约：「Pass paths, not file contents」——actor 有自己的文件工具，4 万行文件插值进 prompt 是双重 token 浪费[S-§4]。
- 每个 ask 结束附带引擎注入的质量后记（不进缓存哈希）[EE-L248]；actor 上下文跨 ask 保留（同一 `agent()` 变量 = 同一会话，FIFO 排队）[S-§2]。

### 4. 模型控制

三层优先级 + 全程用户可见：

- **优先级**（运行时解析顺序）：persona 的 `model` > run 的 `subagent_model`（CreateWorkflow/AmendWorkflow 参数）> resume pin（上一次实际跑的模型，防漂移）> 父会话当前模型[EE-"Subagent sessions" L301-317][create-app.ts L662-671 注释]。
- **每个 agent() 可单独指定**：`agent("评审员", { system: "…", model: "GLM-5.3-Flash" })` 或经 `model()` 表：`const MODELS = { light: model("GLM-5.3-Flash"), strong: model("GLM-5.3$high") }`，再按 typed 路由键索引——「路由器只能在被声明的模型里选，永远不会写出模型名」[AU-"Choosing a model per subagent"][P-#13]。
- **闭集校验**：persona.model 的类型必须是 `ModelRef`、字符串字面量或字面量联合（诊断 9010 拒绝 `let`/模板串/宽化变量）；每个名字在启动前对着宿主模型目录解析，解析不到是诊断 9011（列出候选 id），不开窗不运行[LA-"Models the script names"]。**运行时只能在启动时批准的闭集内选择**。
- **`$<level>` 后缀语义**：`providerId/modelId` 或裸 model id 可带可选 `$reasoningLevel`（如 `GLM-5.3$high`），`resolveInput` 解析后规范化为 canonical `providerId/modelId[$reasoningLevel]` 写入确认窗与 journal 的 `run-launched` 事件[LA-"Input and output"][AU-"Choosing a model per subagent"]。本宿主的 ListModels 工具描述同款：「Append `$<level>` to pick a reasoning level from that row's `reasoningLevels`」[宿主事实]。
- **模型与缓存解耦**：「The model is not part of a subagent's cache identity: an amend that changes only the model a named subagent runs on keeps its finished work, and its next live ask runs on the new model」[AU L209-212]。换模型不重跑已完成工作——对 pstack 的「retry on a different model」失败策略是直接支撑[orchestrate.md L98]。
- **约束**：fill 的函数体只能使用 run 启动时已绑定的模型，新模型名是 9011，要加模型必须 amend[S-§16.7][LA-"Models the script names" L224-231]。并发治理按 provider key 分桶，指向其他模型的 run 不挤占主代理的桶[CC-"The governor"]。

### 5. 生命周期：后台、通知、失败、恢复、跨重启、journal 语义

- **后台运行 + 完成通知**：干净编译 + 用户确认后 run 在后台启动，「Do not poll it. The completion notification arrives on its own with the final return value and every reported item」[S-§13]。本会话可阻塞等待的只有 TaskOutput（限本会话启动的 run）；GetWorkflowRun 是即时快照（可查别的会话的 run）；ListWorkflowRuns 枚举项目全部 run[S-§13][宿主事实]。
- **三种终态**[EE-"Terminal states"]：
  - `completed`：脚本 return。不可 resume。
  - `errored`：脚本自身失败（未捕获 throw、超 cap、缺产物源文件）。**不可 resume**（重放必然同样失败），出路是编辑脚本文件后 AmendWorkflow。
  - `stopped {reason}`：可原样 resume（ResumeWorkflowRun），reason 词汇：`user`（用户主动停，别动）、`model`（主代理 TaskStop）、`provider`（确定性 provider 错误——登录过期/配额/模型不在计划，`<error>` 块给修法，修好再 resume）、`interrupted`（宿主进程退出，通常该 resume）、`superseded`（被 amend 取代，不可 resume，继任者接管）。
- **报告抢救**：`report(item)` 的条目被记录，在 errored/stopped 的 run 上也随完成通知送达；resume 后不重复发送[S-§10][P-#8]。
- **跨应用重启存活：是**。
  - journal 是 SQLite（migration `0019_dwf_journal`，四张表 `dwf_run`/`dwf_actor`/`dwf_node`/`dwf_event`，run 按 `(cwd, time_updated)` 索引）[EE-"Tables"]；run 列表按项目（cwd）枚举、含其他会话的 run[宿主事实-ListWorkflowRuns]。
  - 引擎属于「启动/恢复它的那个会话 App」；App 关闭时它拥有的活 run 被写为 `stopped(interrupted)`（正常 finishRun 尾巴落库），下次该会话激活时孤儿对账 + 冷重放可见并可 resume[EE-"Engine ownership"]。「A restart resumes the chain where it waited, with the finished steps replayed from the journal.」[P-#14]
  - resume 的闸门：completed/errored 拒绝（`not_resumable`）、superseded 拒绝并报继任者 id、脚本哈希不匹配拒绝（`ScriptHashMismatch`——resume 需逐字节同脚本，改脚本是 amend 的事）、facade 演化导致脚本不再过检则 `compile_failed`（出路同样是 amend）[EE-"Resume by replay" L163-172]。
  - 跨会话：resume 走「run 自己的父会话」（父会话重开即恢复）；别的会话对它 AmendWorkflow 可以，但要用户确认[S-§16.4 "Confirmation"]。
- **journal 重放语义：已完成步骤零 token 重放**。
  - 「A resumed run is the same script run again with the journal answering for what already happened」——每个实例重遇到自己的 journal 行：`completed`/`failed` 行直接以 `node-settled {cached: true}` 结算、不调 driver；`running` 行（死时正在跑的）重新执行；世界读（files/git/world.run）按 `{op,args}` 哈希记账，重放直接回放记录结果不再碰文件系统/命令[EE-"Resume by replay"/"World reads"]。
  - 不止回放答案，还回放**结算顺序**（settle-order gate），保证重放时 fan-out 后续绑定的 ordinal 与 journal 一致[EE-"Replaying the settle order"]。
  - amend 导入缓存的精确规则：按 actor 名字（匿名/重名跳过）+ 逐 ask 指令字节相同匹配前缀；**缓存在修订版第一次写工作区时整体关闭**（此后碰过世界的缓存 ask 作废重跑，纯 ask——`worldToolCalls===0`——豁免）；甚至能「继承未完成 ask 的半截 transcript」继续跑[EE-"What is imported"/"How the engine consumes the cache"]。token 统计沿 lineage 累计继承[EE-"Usage across the lineage"]。
- **provider 故障语义**：瞬时限流/过载/网络错误由 runtime 无限重试并自适应降并发，脚本根本看不到；确定性错误停整个 run 为 `stopped(provider)` 等人修[S-§16.3][CC-"Retry budget and the model-error policy"]。20 分钟无成功请求发一次 stall 通知，run 不停[CC-"The stall clock"]。

### 6. 限制清单

- **触发门槛（对 pstack 适配最要紧）**：「Only an explicit request starts a workflow」——必须 `/workflow` 或用户点名「用工作流」；模型不得因为任务「看起来像编排」就自行启动[S-§1][LA-"When the model may call it"]。这是写给模型的行为规则（工具描述+技能路由表执行），不是 API 硬锁；但**技能门是硬锁**：提交 script/path 的 CreateWorkflow、SaveWorkflow、EvalWorkflowSnippet、AmendWorkflow（带脚本的）在会话历史中存在一次成功的 `dynamic-workflows` Skill 调用之前一律拒绝（业务码 428），压缩后技能文本掉出上下文门会重新关上[AU-"The skill gate"]。运行 saved workflow 是唯一豁免。
- **并发**：默认并行度 D = `max(4, min(16, availableParallelism()−2))`，每进程算一次[CC-"Two bounds on a run"]；`max_concurrency` 无上限（用户要 40 就 40，governor 自动升到 2D 或 run bound 并按 429 AIMD 退让）[CC]。运行中可原地调（AmendWorkflow 只带 max_concurrency → retune，不停 run）[CC-"Retuning a live run"]。
- **沙箱**：独立 Node 进程 + vm cell；禁 `Date.now()`/无参 `new Date()`/`Math.random()`/动态 import；无 `process`/`fetch`/`fs`（类型检查直接失败）；`world.run` 定长 argv 无 shell（无管道/重定向/展开），命令名必须编译期字面量（用户在确认窗批准命令集），超时默认 300s 可覆盖、无上限；stdout/stderr 各 256KB cap，超限拒绝[EE-"The sandbox"/"World reads"][S-§16.2][S-§16.3]。
- **类型检查约束**：strict 模式（`noUncheckedIndexedAccess` 关）；禁 `declare`/`export`/`import`；顶层 await + 末尾 `return <value>`；phase 必须覆盖全脚本、每个 phase 至少含一个 ask 或 world.run、phase 名编译期字面量；actor 名 run 内唯一（字面量重复编译错 9005/9006，运行期计算重名直接杀 run）；artifact id/report 标签编译期字面量；hole 必须显式类型参数、await、inline、不得在数组方法回调里（9012）[S-§16.3][AU-"Compile-time rules"]。
- **cap 清单**（拒绝而非截断）：glob 2000 文件、grep 2000 匹配/256KB、git diff 512KB、log 100 提交；report 65536 条/run、1MiB/条、1GiB/run；artifact 32 id/run、16 版本/id、20MiB/文件、256KB/markdown[S-§16.2][S-§5]。
- **产物**：`return` 是给主代理的交接（推荐 WorkflowReport 四字段形状）；`artifact.*`（file/markdown/chart/table/metrics/board）是给用户开的卡片，可标 primary[S-§10]。EvalWorkflowSnippet 是同步试车台（无 agent/hole/phase，不落任何 journal）[S-§6/§16.6]。
- **保存**：SaveWorkflow 写 `.zcode/workflows/<name>.dwf.ts`（project）或 `~/.zcode/workflows/`（global），可带参数声明供按名复跑[宿主事实][S-§16.5]。

### 7. 综合判定

#### 7a. orchestrate depth-3 映射：主代理 → workflow 脚本（顶替 poteto-agent 的编排职责）→ 并行 worker actor——**映射成立，但要把 poteto-agent 的职责拆开搬**

pstack 在 Cursor 上的链路：协调者聊天（本会话跑 playbook）经 Task 工具派 poteto-agent，poteto-agent 跑 playbook 并再派 helper（「nesting works to depth 3, and a nested spawn has the full Task schema」[orchestrate.md L16]；「Agents are spawned, resumed, and drained only through the Task tool」[L15]）。ZCode 里普通子代理 spawn 即 depth 1 封顶，此链路断。工作流的替代方式：

- **编排职责上移到脚本**——orchestrate.md 的每一条编排机制在 workflow 里都有原生对应物：
  | pstack 机制 | workflow 对应物 |
  |---|---|
  | 滚动窗口 spawn（rolling window, 非 blocking batch） | `Promise.all` per-item chaining 或 channel + worker pool（`future` + `for await`）[P-#10/#11] |
  | completion 是队列事件、drain 点批处理 | per-item pipeline（review 落地即进 confirmer）或 channel 消费者；批处理即 join |
  | 上游报告转递进下游 brief（context relay） | typed result 插值进下一个 ask；「CONTEXT 字段 upstream reports pasted in full」→ `JSON.stringify(upstream)` 进 prompt[S-§4] |
  | 验证 ledger / 不同模型族 verifier | verifier actor 换模型（persona model）+ `world.run` 确定性门控[P-#9/#13] |
  | retry by mode（换模型重试等） | 有界循环 + 模型路由 + amend 不丢已完成工作[S-§2][AU] |
  | 状态外置（units.tsv/ledger.tsv，谁都能读） | actor 有完整文件工具可写 store；脚本可 `files.read`/`world.run` 读回分支 |
  | 每 spawn 带完整 standing orders | persona system + 每个 ask 模板拼 STANDING 段 |
  | gates.md 人工闸 | `AskUserQuestion`（actor 可直接问用户）或 `escalate`（问主代理）[LA-"Permissions inside a run"][EE-"Escalation"] |
- **判断职责二选一**：要么做成脚本内的判断 actor（比如一个常驻「分诊员」按一致尺度排优先级[P-#4 calibrated]），要么把判断点留给洞/升级回主代理。poteto-agent 作为「跑 playbook 的模型」被这两个机制瓜分——**playbook 中「按步骤执行且步骤是给人读的规程」的部分可以由 actor 直接执行**（actor 能读技能和文件，把 orchestrate.md 或某 brief 塞进 ask 即可），**「步骤里要求再派子代理」的部分不能**（actor 无 spawn 工具），必须改写为脚本拓扑。
- **worker 跑 pstack brief 的可行性**：worker brief 本身就是自包含合同（GOAL/SCOPE/CONTEXT/ACCEPTANCE/VERIFY/TIMEBOX/FORBIDDEN/REPORT/STANDING 九段[orchestrate.md L38-51]），一个 actor 一次 ask 完全承载；REPORT 的结构化形状（status/branch/SHA/verdict）正好用 `ask<TypedReport>` 强制。autopilot 的 owner 角色（build→open PR→babysit→merge）大体是单线自包含工作，可作为长 ask 的 actor；其 swarm-verify 步骤（fan out independent verifiers per the swarm skill）在 workflow 里反而更顺——一个 phase 扇出。
- **残差缺口**：
  1. **无 cloud environment**。pstack worker 默认 `environment: "cloud"`（「Cloud agents cannot read the local store」的隔离与规模）[orchestrate.md L17]，ZCode actor 全部本地、共享工作区。隔离要靠 SCOPE 约定（每 actor 独占 worktree/路径）而非运行环境，规模受本机与同一 provider 配额约束。
  2. **多天滚动项目的交互模型**。orchestrate 是「standing coordinator chat + 事件驱动 drain」，workflow 是「一次提交的执行（+ 洞/amend 增量演化）」。无生产 wall-clock 超时、跨重启可 resume，多天可行；但每个「根据最新发现决定下一波」的节点要么预先写成有界发现循环[P-#7]、要么洞（主代理必须在场填）、要么 amend（主代理发起）。pstack 的「human checking in twice a day」在 ZCode 侧变成「主会话每天回来填两次洞/调两次 amend」——可行但角色不同：主代理成为常驻判断节点。
  3. **无限 drain 自由度**。orchestrate 的 coordinator 在 drain 点可以完全重新规划（改 track、改分解）；workflow 的形状自由度 = 脚本内控制流 + 洞 + amend，均需主代理参与。纯脚本内自适应（hunter/confirmer 循环、反馈环[P-#12]）覆盖常见情形，但不能「运行中发现全新的项目结构后整体重组」而不惊动主代理。
  4. 行为门槛：orchestrate 入口必须显式要求工作流并先加载 dynamic-workflows 技能（pstack 适配层可在自己的技能文本里写死这两步，见问题 6）。

**结论 7a：映射成立。** depth-3 链「主代理 → poteto-agent → helper」改写为「主代理 → 脚本（编排）→ N actor」，其中 poteto-agent 的模型判断拆给脚本内判断 actor + 主代理的洞/升级，helper 变 actor。**只有当某个 playbook 步骤的本质是「让一个代理继续自由派生代理树」时才真正不可映射**（orchestrate 的 sub-coordinator 角色如此，但其产出——分解与派生决策——可以由脚本+洞表达）。

#### 7b. 模型面板映射（arena/swarm 式 N 模型并行互查）：**成立，且是工作流的最强用例之一**

- 机制齐备：per-agent `model`（字面量或 `model()` 表）+ typed 路由[P-#13] + 独立评审面板[P-#4 independent] + 交叉评审（cross-judge 换模型族）+ `Promise.all` 扇出。arena 的六阶段（Frame/Fan out/Cross-judge/Pick/Graft/Verify）每一步都是直白的 phase：candidates 用 `MODELS.runners` 表扇出、cross-judge 用不同族的声明模型、pick 是一个 typed ask、graft/verify 是收尾 actor + `world.run` 门[arena/SKILL.md]。swarm 的 partition/race/mixed 形状即 P-#1（扇出）与 race（同 brief N 路不同模型）[swarm/SKILL.md]。
- 比预设 agent 更贴合的三点：
  1. **模型闭集在确认窗公示**——arena 的「每个 arm 的模型 up front 声明」从纪律变成机制（用户批准的就是这个模型表，运行期谁也改不出去）[LA-"Models the script names"]。
  2. **换模型不丢缓存**——「retry on a different model」「调整 panel 配置」经 amend 换模型，已完成工作零成本保留[AU L209-212]。
  3. **并发治理按 provider key 分桶**——面板打到 N 个不同模型不会互相挤占，也不会拖累主会话[CC-"The governor"]。
- 两个约束要在适配层处理：
  1. **闭集 vs pstack-models.mdc 动态配置**：`~/.cursor/rules/pstack-models.mdc` 的角色行（如 `arena runners: claude-opus-5-5-xhigh, grok-4.7-xhigh-fast`）不能在运行时以任意字符串传给 `agent({model})`（9010 拒绝）。适配方式：适配层读配置文件后**生成脚本**时把配置展开成 `model()` 表（字面量），或保存为带固定模型表的 saved workflow、用 args 传「选择哪些 arm」的键。`args` 的值可以索引 `MODELS[key]`（P-#13 的 route.tier 模式），所以「按配置选 arm」没问题，问题是「配置出现新模型 slug」需要重新生成/amend 脚本。
  2. **reasoning level/快慢速**：`$<level>` 后缀覆盖 pstack 的 xhigh/fast 微调语义（同族不同档）；pstack「只调档不换族」的纪律映射为「同 modelId 只改 `$level`」，amend 免费。
- 结论：**评审面板（interrogate/swarm/arena 的多模型互查）应优先做成 workflow**（或 saved workflow 按名复跑），而不是 N 个预设 agent + 主代理手工聚合——后者在 ZCode 上仍可行（Agent 工具 + per-spawn model），但没有类型化结果、确定性门控、断点续跑和模型表公示。

#### 7c. 什么时候是杀鸡用牛刀

技能文档的路由表就是答案[S-§1]：

- 「One thing delegated to one agent → `Agent`」；「A few independent lookups, nobody reading anybody's answer → `Agent`, in parallel」；单文件 tdd 循环（plan→edit→test→refactor 的短环）属于前者——一个 actor 会话内自己迭代即可，Agent 工具一次 spawn 更省（无确认窗、无脚本编写、无 phase 图）。
- pstack 侧对照：poteto-mode 的普通 code playbook（feature/bug-fix 的单任务委托）、`/correct`、单文件重构——继续走普通子代理。**例外**：即便任务小，「用户点名要工作流」就必须用工作流（「An explicit request is binding … the smallest task gets a small workflow」[S-§1]）——适配层要小心别把 pstack 每个命令都翻译成「点名工作流」，那会把小委托全变成重流程。
- 判别式（综合 §1 路由表）：需要 (a) 结果互相喂给下一步、(b) 有界循环/类型分支、(c) 确定性命令做门控、(d) 多模型面板——四条中两条以上才值得上工作流；只有「并行查几样东西」用 Agent 并行即可。

## 给 pstack 适配的落地建议（信息性）

1. **orchestrate/autopilot**：适配层技能第一步 `Skill(dynamic-workflows)`，第二步按当前 program 生成 inline 脚本（brief 模板展开进 ask 文本、STANDING 拼进 persona/ask、worker 模型展开成 `model()` 表）；长程用尾洞链生长[S-§15]；崩溃/重启靠 `stopped(interrupted)` + resume；改计划靠 amend。多天滚动窗口建议显式 `max_concurrency`（orchestrate 的「in-flight cap roughly ten」直接映射）。
2. **swarm/arena/interrogate**：做成 saved workflow（`.zcode/workflows/`，参数化 N/race 规则/arm 选择键），模型表在生成/保存时由 pstack-models 配置展开；每次 `/swarm` 等命令经 `saved` 来源复跑（这是技能门唯一豁免路径，且无需每次重新生成脚本）。
3. **worker 环境差异**：文档里写明「无 cloud 环境，actor 与主会话共享本机与工作区」，SCOPE/FORBIDDEN 字段承担隔离；涉及大仓库 rebase 的单位（orchestrate「Chain rebases run in cloud」）需重新评估本机代价。
4. **需要实测的点**（本次无法在本会话验证）：确认窗在 pstack 常见扇出规模下的可用性；MCP 工具在 dwf actor 面上的实际保留集（源码注释称未接线过滤，[WAT L53-55]）；saved workflow 在别的机器上模型名 9011 的行为（文档已声明会失败，候选列表最多四十行）。

## 附：关键事实速查

| 事实 | 值 | 来源 |
|---|---|---|
| 默认并行度 D | max(4, min(16, cores−2))，无上限可调 | [CC] |
| actor 模型上下文深度 | 1（actor 不能再派生） | [SCR L143][TI] |
| actor 工具面 | 父全集 − {EnterPlanMode, ExitPlanMode, CreateWorkflow, AmendWorkflow, SaveWorkflow, ResumeWorkflowRun, ReadSessionContext, ResolveWorkflowQuestion} + {submit_result, escalate, AskUserQuestion} | [WAT][EE-L317] |
| actor 技能面 | 父全集（含插件技能）− dynamic-workflows | [EE-L327][SCR L275] |
| 模型指定 | run 级 `subagent_model` + per-agent persona.model（闭集，$level 后缀），启动前校验并在确认窗公示 | [LA][AU] |
| 恢复 | 仅 `stopped`（user/model/provider/interrupted）；errored/completed 走 amend；跨重启 journal 存活，已完成步骤零 token 重放 | [EE-"Terminal states"/"Resume by replay"] |
| 修订 | AmendWorkflow 对任意状态 run；按 actor 名+指令哈希导缓存；首写工作区关缓存；纯 ask 豁免 | [EE-"Amend-resume"] |
| 硬门槛 | 会话内须有成功的 dynamic-workflows Skill 调用（428 业务码）；saved 复跑豁免 | [AU-"The skill gate"] |
| 软门槛 | 仅显式请求启动工作流（/workflow 或点名） | [S-§1][LA] |
| 沙箱 | 独立 Node 进程 vm cell；禁随机/时钟/网络/fs；world.run 定长 argv、命令名字面量 | [EE-"The sandbox"] |
| run 所有权 | 归父会话 App；关闭即 stopped(interrupted)；列表按项目（cwd）跨会话可见 | [EE-"Engine ownership"] |
