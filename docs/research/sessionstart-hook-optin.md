# SessionStart hook 常驻模式 opt-in 可选件调研

- 调研日期：2026-10-16（第二轮迭代）
- 任务：查证 ZCode SessionStart hook 的机制与 opt-in 安装形态，为「常驻模式」（poteto-mode 精简摘要常驻注入）设计一个用户显式安装的可选件。
- 边界确认：本报告只做调研；未修改用户任何配置、未安装任何 hook、未改动仓库其他文件。
- 与第一轮 Q8 的关系：Q8 否决的是「默认全局常驻」（`docs/research/adaptation-audit.md` L85 把常驻模式标记为 ⚠️ 降级实现）。本报告设计的是**用户显式一行安装、一行卸载的可选件**，仓库默认分发形态不变，与 Q8 决策不冲突。

## 来源标记

| 标记 | 来源 |
|---|---|
| S1 | 本机第一方文档：`C:\Users\Administrator\.zcode\cli\plugins\cache\zcode-plugins-official\zcode-guide\0.3.0\skills\diagnosing-hooks\SKILL.md` 与 `...\zcode-configuration-guide\SKILL.md`（全文已读） |
| S2 | 官方 web 文档 `zcode.z.ai/en/docs/hooks`（2026-10-16 抓取） |
| S3 | ZCode 上游仓库 `github.com/zai-org/ZCode` 源码与规格（经 `gh api` 取原文；本机 ZCode 版本 3.15.3，实测自启动日志 `version=3.15.3`） |
| S4 | 本仓库文件 |
| S5 | 本机实测（2026-10-16） |

引用 S3 时附文件与行号（行号以上游 main 当前版本为准，3.15.3 发布后上游可能有少量漂移，论断以字段名与结构为准）。

## 0. 结论速览

1. **机制存在且成熟**：SessionStart 是 ZCode 七个 hook 事件之一，`additionalContext` 在首轮模型请求前注入会话消息历史，本会话开头收到的 example-plugin 提示语就是活样本（S5）。
2. **注入是常驻成本**：注入内容成为会话 messageHistory 的一个 `hook_context` 条目，整段会话都在上下文里，每个新会话各付一次；有多层体积护栏（stdout 默认 32768 字节、合并注入截断 24000 字符）（S3）。
3. **失败零伤害**：SessionStart hook 不可阻断会话，超时/非零退出是可恢复失败，最坏结果只是「没有注入」，turn 不崩（S2/S3）。
4. **配置位置有分歧**：用户级 `~/.zcode/cli/config.json` 三源一致确认可用（需 `hooks.enabled: true`，无信任门）；workspace 级 `.zcode/config.json` 官方 web 文档说整体忽略，上游规格说「rollout 开启 + Settings 持久信任后条件执行」（S1/S2/S3 分歧，见 §1.4）。**推荐用户级，绕开分歧**。
5. **本机现状是白纸**：`~/.zcode/cli/config.json` 现有顶层键只有 `plugins` 与 `mcp`，无 `hooks` 键（S5）。
6. **运行时选 node 不选 bun**：本机 `node v24.9.0` 在 PATH，`bun` 未安装（`where.exe bun` 无结果）（S5）。hook 用 `type: "process"`（argv 直执行、无 shell），Windows 下最稳（S1/S2）。
7. **推荐配方**：仓库新增 `scripts/resident/`（安装器 + 注入脚本 + 摘要正文三个文件），`node scripts/resident/install.mjs` 写用户级配置，注入脚本按会话 cwd 探测「本项目是否装有 poteto-mode」决定注入与否——天然做到「装了 pstack 的项目才常驻」，卸载精确删除自己加的条目。
8. **体积量级**：example-plugin 样例约 40 token/会话；poteto-mode 全文 SKILL.md 约 20.5KB（≈5000 token）不可全量注入；建议摘要两档：迷你 ≈300 token（路由器+指针）、标准 ≈600-900 token（+核心原则+行文纪律）。
9. **主要让步**：摘要与 SKILL.md 是两份文本，有漂移风险（缓解：CI lint + 指针式设计）；摘要不能放进 `skills/poteto-mode/`（违反 ADR-0002 最小差异原则，上游 subtree 路径），因此 `npx skills add` 的分发联动是个未决问题。
10. **compaction 对已注入条目的留存行为未验证**，实施票需实测（§5 风险 4）。

## 1. ZCode hook 规范（查证结果）

### 1.1 本仓库 round-1 的先例（问题 1）

round-1 的 PreToolUse hook 是 benny 包的线程守卫（票 #11 / ADR-0007）：

- **脚本**：`automations/benny/hooks/enforce-thread-posts.js`（node 脚本，读 stdin JSON 的 `tool_name`/`tool_input`，对无 `thread_ts` 的 Slack 频道根帖 `exit 2` 拒绝）（S4）。
- **配置位置与注册方式**：`automations/benny/skills/setup-benny/SKILL.md` §Install the thread guard（L164-194）指示把 hook 合并进**目标仓库的 `<repo>/.zcode/config.json`**，形态为顶层 `hooks` 键（S4）：

```json
{
  "hooks": {
    "enabled": true,
    "events": {
      "PreToolUse": [
        {
          "matcher": "^mcp__slack__",
          "hooks": [
            {
              "type": "process",
              "command": "node",
              "args": ["${ZCODE_PROJECT_DIR}/.zcode/automations/benny/hooks/enforce-thread-posts.js", "<SOURCE_CHANNEL_ID>"],
              "timeoutMs": 5000
            }
          ]
        }
      ]
    }
  }
}
```

- 这证明本仓库已采用「config 文件 hook + process 类型 + `${ZCODE_PROJECT_DIR}` 模板变量」的形态；常驻 hook 只需换事件名为 `SessionStart`。注意：round-1 该 hook 面向的是 benny 的目标仓库（另一台机器/仓库的场景），它在**本仓库**是否真的跑过未经实测；且 workspace 级配置的执行前提见 §1.4 的分歧。

### 1.2 事件与配置 schema（问题 2）

事件全集恰为七个：`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、`PostToolUseFailure`、`Stop`（S1 §2、S2、S3 `apps/zcode-cli/packages/core/src/runtime/methods/hooks.ts` L18 也硬编码同一组 source 值）。

**SessionStart 专属语义**：

- 触发时机：新会话开始、首轮模型请求之前（S2；S3 上游规格 `docs/hooks-runtime-contract.md` L171-179 的事件效果表：SessionStart「不可阻断、不可修改、`additionalContext` 注入首轮前」）。本机日志实测存在 `turn.phase.started` `phase: "session_start_hooks"` 的阶段记录（S5，`~/.zcode/cli/log/zcode-2026-10-16.jsonl`）。
- 每会话只跑一次：源码 `runSessionStartHooks` 有 `sessionStartHookRan` 守卫（S3 `methods/hooks.ts` L27）。
- matcher 匹配的是 **source**，取值 `startup | resume | clear | compact`（S1 §2、S2、S3 L18/L46 `matchValue: source`）。省略 matcher 匹配全部（S1；S3 `output.ts` L98-112 `matchesHookMatcher`：缺省或 `*` 匹配一切；纯字母数字下划线竖线按精确名列表匹配，否则按正则）。
- stdin 输入（单行 JSON）：基础字段 `session_id`、`transcript_path`（临时文件，hook 结束即删）、`cwd`、`permission_mode`、`hook_event_name`，SessionStart 另带 `source`，可选 `agent_type`、`model`（S2；S3 contract L120-150；S3 `methods/hooks.ts` L34-46 实际下发的载荷还有 `mode`、`timestamp`、`traceId`、`turnId`）。
- SessionStart 触发时会先走 `workspaceHookAdmission.activate(source)`（workspace hook 的信任门，S3 L28），见 §1.4。

**hook 定义两种类型**（S1 §2、S2、S3 `packages/shared/src/workspace-hook-config.ts` L24-46 的 zod schema）：

- `type: "process"`：`command`（可执行文件）+ `args[]`（argv 直执行，**不经过 shell**，跨平台首选）+ `timeoutMs`（毫秒）+ `statusMessage`；另接受可选 `enabled`（缺省 true）。
- `type: "command"`：`command`（shell 字符串）+ 可选 `shell`、`timeout`（**秒**）、`timeoutMs`（优先）+ `statusMessage`。Windows 上 shell 是系统 shell 而非 Git Bash，POSIX 语法会挂——官方明确推荐 process 类型（S1 陷阱 10、S2）。
- 字段混用（process 带 timeout 之类）会导致 hook 被丢弃（S1 陷阱 7）。

**根级字段**：`enabled`（bool）、`timeoutMs`、`maxOutputBytes`、`events.<Event>`（S1 §1、S3 schema L62-80）。默认值：timeout 60000ms、stdout 上限 32768 字节（S1 §2；S3 `workspace-hook-config.ts` L7-8 `DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS = 60_000`、`DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES = 32_768`）。超时解析顺序：hook 的 `timeoutMs` → `command` 的 `timeout×1000` → 根级 `timeoutMs` → 60000（S1 §2、S3 L113-123）。

**模板变量**（展开于 command 与每个 arg，且注入为环境变量）：`${ZCODE_PROJECT_DIR}` / `${CLAUDE_PROJECT_DIR}`、`${CLAUDE_SESSION_ID}`；`${ZCODE_PLUGIN_ROOT}` 仅插件 hook 可用（S1 §2、S2）。

**输出与退出码**（S1 §2、S2、S3 contract L153-189、S3 `output.ts` 全文）：

- 空 stdout = 成功无效果；**非 JSON stdout 只是诊断日志，绝不进入模型上下文**（注意：这与 Claude Code「SessionStart 纯文本 stdout 直接进上下文」不同，ZCode 只认 JSON）。
- 首个非空白字符为 `{` 的合法 JSON 才被解析；未知字段忽略；已知字段类型错或 `hookSpecificOutput.hookEventName` 与事件不符 → **该 hook 可恢复失败**（S3 `output.ts` L53-61）。
- 注入上下文的正解：`{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}`；顶层 `additionalContext` / `additional_context` 也接受（S3 `output.ts` L48-49、L138-141；S2）。
- 退出码：0 = 解析 stdout；2 = 阻断快捷方式（SessionStart 不可阻断，此能力对它无意义）；其他非零 = 可恢复失败，turn 不崩（S1 §2、S2、S3 contract L163-167）。

### 1.3 hook 配置放哪（问题 2 续）

| 作用域 | 文件 | 执行条件 | 依据 |
|---|---|---|---|
| 用户级（全局） | `~/.zcode/cli/config.json` 顶层 `hooks` | 必须设 `hooks.enabled: true`；无信任门 | S1 §1、S2、S3 contract L59-65（「Runtime 执行：是；user hooks 先执行」） |
| 工作区级（项目） | `<repo>/.zcode/config.json` 或 `<repo>/zcode.json` 顶层 `hooks`（从 cwd 向上找到 git 根的每一级都算候选） | **有分歧**，见 §1.4 | S1 §1、S2、S3 `workspace-hook-config.ts` L174-221 |
| 插件级 | 插件目录 `hooks/hooks.json` 或 manifest `hooks` 字段 | 跟随插件启用态；**只要任一插件贡献 hook，runner 自动启用**（不需要 `enabled: true`） | S1 §1、S2 |

- 用户级与插件级 hook 按顺序合并执行：user hooks 先、插件 hooks 后（S2、S3 contract L61）。
- **配置在会话启动时快照**：改完配置只保证新会话生效（S2、S3 contract L52-53）。安装/卸载后必须开新会话验证。
- 单条 hook 可带 `enabled: false` 精确停用而不删除（S3 contract L74-76）。
- 设置页（Settings → 钩子）可以图形化增删改 `.zcode` 的 user/workspace hook（S3 contract L206-233），是免脚本的手工安装替代路径。

### 1.4 workspace 级分歧（重要，影响安装位置选择）

三个来源对 workspace 级 config hook 的说法不一致：

- S1（本机 skill 文档）说：workspace config hook 与用户级一样，`hooks.enabled: true` 即可运行，且「无信任门」。
- S2（官方 web 文档）说：workspace 的 hooks「整体忽略——无论 `hooks.enabled`」，日志记 `config_project_hooks_ignored`，团队共享必须走插件或用户级配置。
- S3（上游源码与规格，2026-08-13 定稿的 `docs/specs/workspace-hook-trust-persistent-only.md` + `docs/hooks-runtime-contract.md`）说：workspace hook 是**条件执行**——「rollout 开启且 exact Trust/policy admission 通过后执行」；未信任的声明被跳过并上报 pending（诊断码 `config_project_hooks_pending_trust`），用户需在 Settings → Hooks 对每条精确声明点「信任」建立持久信任（以 `workspaceIdentity + hookDeclarationDigest` 为键的用户侧 Trust store）；被跳过的 SessionStart **不补跑**，最早在下一个自然 SessionStart 运行。

裁定：S3 是实现规格且最新（2026-08），S1 的 skill 文档描述滞后，S2 的「整体忽略」可能描述 rollout 未开或文档滞后状态。**本报告不依赖 workspace 级：推荐配方走用户级配置，三源一致、无信任门、无分歧**。若后续想提供「项目级安装」变体，需先实测本机 3.15.3 的实际行为（往 `.zcode/config.json` 放测试 hook、开新会话、翻日志找 `config_project_hooks_*`），列入实施票的验证清单。

### 1.5 Windows 下的写法（问题 2 续）

- 用 `type: "process"` + `command: "node"` + 绝对路径脚本：无 shell、无引号问题，官方推荐的跨平台形态（S1 陷阱 10、S2）。本机 node v24.9.0 在 PATH（S5）。
- 路径正反斜杠均可（node 自己处理）；JSON 里反斜杠要转义，建议直接写正斜杠。
- `type: "command"` 在 Windows 走系统 shell（cmd），POSIX 语法、`chmod +x`、shebang 都不可靠（S1 陷阱 4/10）——不采用。
- **bun 不可用**：本机未安装 bun（S5：`where.exe bun` 与 `~/.bun/bin` 均无）。poteto-mode 的工具脚本（`skills/poteto-mode/scripts/bootstrap.ts` 用了 `import.meta.dir`、目录里有 `bun.lock`）确实以 bun 为运行时（S4），但常驻 hook 只需「读一个文件 + 打印 JSON」，零依赖 node 脚本即可，不需要引入 bun。安装器同理用 node。

## 2. 注入机制与体积分析（问题 3）

### 2.1 注入链路（源码级）

`runSessionStartHooks`（每会话一次）→ 各 hook 的 stdout JSON 解析出 `additionalContexts[]` → `injectHookAdditionalContextIntoMessageHistory` 把它们包装成 `systemReminderAttachmentEntry("hook_context", body)` **加进会话 messageHistory**（S3 `methods/hooks.ts` L106-118）。包装格式（S3 L131-140）：

```
SessionStart hook additional context:
#1
<hook 1 的 additionalContext>

#2
<hook 2 的 additionalContext>
```

多 hook 的输出按序拼接，整体截断于 `HOOK_CONTEXT_MAX_CHARS = 24_000` 字符（S3 L15/L136-139）。

### 2.2 体积与成本的四个事实

1. **每个新会话都占**：注入条目是 messageHistory 的正式成员，从首轮前一直存在于上下文，直到会话结束（或被 compaction 摘要化——后者行为未实测，见风险 4）。resume（source=resume）会再触发一次注入进恢复后的会话（S3 L18/L27/L46）。
2. **三层护栏**：单 hook stdout ≤ maxOutputBytes（默认 32768 字节，可配）（S3 schema）；合并注入体 ≤ 24000 字符（S3 硬编码）；JSON 严格 schema（多一个未知键没事，但已知字段类型错=丢弃）（S1 陷阱 8、S3）。
3. **静态文本 or 动态输出皆可**：stdout 是命令的实时输出——既可以是 `cat` 一个静态摘要文件，也可以按 stdin 里的 `cwd`/`source` 动态决定内容（S2/S3）。example-plugin 的注入就是脚本动态拼的字符串（S5）。
4. **会话成本量级**：注入 N 字符 ≈ 英文 N/4 token。护栏之内可自控：example-plugin 样例约 130 字符 ≈ 40 token（含包装）；poteto-mode 摘要按 §4 的两档设计即 300-900 token/会话。

### 2.3 活样本：本会话收到的 example-plugin 注入（问题 3 收尾）

产生链路（S5，全部本机文件实读）：

- 注册：`...\zcode-plugins-official\example-plugin\0.3.0\hooks\hooks.json` 的 `SessionStart` 条目，matcher `startup|clear|compact`，`type: "process"`，`command: "node"`，args 指向 `${ZCODE_PLUGIN_ROOT}/hooks/session-start.mjs`，`timeoutMs: 5000`，带 `statusMessage`。插件 hook 所以不需要 `enabled: true`（runner 自动启用）。
- 脚本：`session-start.mjs` 从 stdin 读事件 JSON（含 `source`、`session_id`），stderr 打诊断，stdout 输出 `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"example-plugin is enabled (hello from example-plugin). Prefer small, reversible edits; keep secrets out of hook stdout."}}`。
- 本会话开头收到的正是这段文本（任务描述里提到的活证据），即 `additionalContext` 经 §2.1 链路注入的结果。
- 本机日志可见 `session_start_hooks` turn phase 记录（S5），佐证该阶段真实执行。

这个样本就是常驻模式的「形态模板」：换掉 additionalContext 的内容、换掉 matcher（加上 resume）、把注册从插件换成用户级 config，其余照抄。

## 3. opt-in 安装/卸载配方草案（问题 4）

### 3.1 设计目标与约束

- 用户显式安装：一行命令装、一行命令卸；不装 = 行为零变化（Q8 兼容）。
- 安装目标是**用户自己的全局配置**（`~/.zcode/cli/config.json`），不是仓库文件——仓库只提供脚本与摘要素材，卸载后不留痕。
- 不依赖 bun；不依赖 shell（process 类型）。
- 注入范围可控：默认「检测到本会话项目装有 poteto-mode 才注入」，避免在无关项目里倾倒 pstack 纪律。

### 3.2 文件布局（仓库内新增，均为本仓库自有基建，参照 `scripts/cursor-residue-lint.sh` 先例）

```
scripts/resident/
  resident-summary.md   # 精简摘要正文（英文，内容见 §4 素材）
  inject.mjs            # hook 脚本：探测 + 读摘要 + 打 JSON
  install.mjs           # 安装器/卸载器：合并/精确移除用户级 config
```

不放 `skills/poteto-mode/` 内：那是上游 subtree 路径，ADR-0002 规定只做 mechanism-swap、不添加内容（S4 `docs/adr/0002`）。

### 3.3 注入脚本 `inject.mjs`（草案逻辑）

```
1. stdin 读事件 JSON（失败也 exit 0——SessionStart hook 永不制造噪音）。
2. 取 cwd（stdin.cwd，回退 env ZCODE_PROJECT_DIR）。从 cwd 向上找 git 根方向逐级探测：
   <dir>/skills/poteto-mode/SKILL.md（本仓库本体）
   <dir>/.zcode/skills/poteto-mode/SKILL.md
   <dir>/.agents/skills/poteto-mode/SKILL.md
3. 命中 → 读安装时烘焙的摘要绝对路径（或 repo 内 resident-summary.md）；
   未命中 → stdout 空、exit 0（无注入，零成本）。
4. stdout 打 {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":<摘要全文>}}；
   诊断只进 stderr；总耗时 <50ms，timeoutMs 给 5000 绰绰有余。
```

要点：`hookEventName` 必须精确等于 `"SessionStart"`（错了整条被丢，S3 `output.ts` L53-61）；stdout 不能混入任何非 JSON 行（S1 陷阱 8）；脚本内不许 console.log 调试残留。

### 3.4 安装/卸载（草案）

安装（用户在 pstack-zcode 仓库里执行一次）：

```
node scripts/resident/install.mjs
```

安装器动作：读 `~/.zcode/cli/config.json`（JSON.parse）；若无 `hooks` 键则创建 `{enabled:true, events:{}}`，若已有则**只合并**（保留全部既有内容，包括已有的其他 hook 与未来的插件状态）；在 `events.SessionStart` 数组追加（幂等：先按 args 特征删除自己的旧条目再追加）：

```json
{
  "hooks": [
    {
      "type": "process",
      "command": "node",
      "args": ["C:/Users/<user>/Git/pstack-zcode/scripts/resident/inject.mjs"],
      "timeoutMs": 5000,
      "statusMessage": "pstack resident: poteto summary"
    }
  ]
}
```

（matcher 省略 = 匹配 startup|resume|clear|compact 全部四种来源；若想恢复会话不重复注入，改成 `"startup|clear|compact"`——取舍见 §5 风险 7。）写回时保留键序、先写临时文件再原子替换（Windows 下 rename 偶发 EPERM，做有界重试——S3 Trust store 同款处理 L217-218 的经验）。装完提示：「配置在会话启动时快照，请新开一个会话生效」（S2/S3）。

卸载：

```
node scripts/resident/install.mjs --remove
```

只删除 `events.SessionStart` 中 args[0] 以 `/scripts/resident/inject.mjs` 结尾的条目；删后数组为空则移除该事件键，`events` 为空则移除 `events`，`hooks` 只含我们写入的骨架则整个移除 `hooks` 键（用户级 config 的 `hooks.enabled: true` 保留与否不影响插件 hook 的自动启用，但干净起见回到安装前形状）。同样原子写回 + 提示新会话生效。手工兜底：Settings → 钩子 里也能删（S3 contract 设置页契约）。

### 3.5 影响面评估

- **装了的机器**：在检测到 poteto-mode 的项目里，每个新会话固定 +摘要 token（§4 两档：≈300 或 ≈600-900）；其他项目零注入、只多一次 <50ms 的探测进程。超时/失败最坏 = 没有注入（S2/S3），会话不受影响。
- **仓库本身**：默认分发（`npx skills add`，ADR-0003）不带 hook、不带安装行为；新增文件限于 `scripts/resident/`，CI lint 词表若涉及需过一遍（`scripts/cursor-residue-allowlist.txt` 机制照走）。
- **与插件 hook 共存**：用户级与插件 hook 顺序执行互不干扰（S3 contract L61）。
- **验证方式**（实施票用）：新会话开头应看到摘要注入（如同本会话看到 example-plugin 文本）；未装项目开新会话无注入；`--remove` 后新会话无注入；日志 `~/.zcode/cli/log/zcode-<date>.jsonl` 查 hook 失败记录（S2）。

### 3.6 备选形态（记录不推荐的理由）

1. **workspace 级安装**（`<repo>/.zcode/config.json`）：贴合 benny 先例、随仓库走，但受 §1.4 分歧影响（可能要在 Settings 里逐条信任、rollout 未必开），且把个人偏好写进团队共享文件。留作实测后的次选。
2. **pstack 做成 ZCode 插件 + `hooks/hooks.json`**：插件 hook 免 `enabled: true` 自动启用（S1 §1），但那等于**给所有插件用户默认常驻**，正面撞 Q8；除非 hook 脚本自检 opt-in 标记文件（如 `~/.zcode/pstack/resident`）才注入——形态可行但当前分发渠道是 skills CLI 不是插件（ADR-0003），引入插件分发是另一个量级的决策。不推荐本轮做。
3. **AGENTS.md 直接写摘要**：零机制成本（用户级 `~/.zcode/AGENTS.md` 每会话注入，S1），但它是纯静态指令文件、无按项目探测/动态能力、且改动用户的指令文件比改 hook 配置更显性。作为「极简派」参考，不作为主案。

## 4. poteto-mode 精简摘要素材与体积估算（问题 5）

### 4.1 全量不可行

`skills/poteto-mode/SKILL.md`：148 行 / 20,452 字节 ≈ **5,000 token**；`playbooks/` 23 个文件共 90,911 字节 ≈ 22,000 token（S5 实测 wc）。全量注入每会话 5k token 起步，恰好违反 poteto 自己的 **Guard the Context Window** 原则。摘要必须是「路由器 + 指针」，细节留给 skill 文件按需加载。

### 4.2 摘要应包含的素材骨架（只列素材，不写最终文案）

来源：`skills/poteto-mode/SKILL.md` 全文（S4）。

**A. 身份与入口指针**（必须，≈30 token）
- 一句定位：poteto 模式精简版，完整规则在 `skills/poteto-mode/SKILL.md`，playbook 在 `skills/poteto-mode/playbooks/<title>.md`；任何歧义以全文为准。

**B. 触发路由核心**（必须，≈120-180 token；自 SKILL.md L17-35 的 14 条触发提炼）
- 非平凡变更/架构决策 → pstack-how；函数边界跨越 → pstack-architect；并行扇出 → pstack-swarm / bakeoff → pstack-arena。
- AskUserQuestion 前先分类：能靠跑一次代码观察到的答案（行为/时序/布局/性能）不是人类的问题——用 Prototype playbook 让结果说话；只有真产品/偏好取舍才问人。
- 任何代码先命名数据形状（model-the-domain）；任何 prose（含给用户的回复）→ pstack-unslop；文档/PR 描述 → pstack-technical-writing；评审前 → pstack-no-comments；报性能数字前 → pstack-benchmark-checklist；UI/CLI 交付 → 对应控制面真实验证（bug 先复现）；PR 状态类请求 → Babysit playbook；长自主任务 → show-me-your-work 决策轨迹。
- 非 trivial 多步 → 写 throughput checkpoint 四项（阻塞前置 / 独立并行 / 共享状态先分离 / 最小安全拆分）——Feature playbook step 3。

**C. 原则速查**（可选档，≈150-250 token；自 L41-78 的 24 条原则挑 8-10 条一句话版）
- 核心候选：Laziness Protocol（偏删除与最小变更）、Attack the Premise（两个修复共享前提=先测前提）、Subtract Before You Add、Build the Lever（造工具不手工）、Prove It Works（对真工件验证，不是「能编译」）、Fix Root Causes、Sequence Verifiable Units、Explain the Number、Guard the Context Window、Never Block on the Human。
- 形态：「名字 + 触发时机半句」，全文指针到 `pstack-principle-<title>` skill。

**D. Autonomy 三条**（可选档，≈60 token；自 L80-88）
- 可逆工作直接做、不问；不可逆写（force-push/部署/删数据/客户消息）必停；No 是可接受的答案，candor over sycophancy。

**E. 行文纪律**（可选档，≈100 token；自 L102-114 的 Writing the reply 浓缩）
- 短陈述句；无长破折号；冒号不做句中连接；terse 不等于丢内容（细节/取舍/选择/未决都要在）；每个 claim 同句带证据或标注（measured/inferred/guess）；不造链接不造引用。

**F. playbook 路由表**（可砍项；全表 23 行 ≈ 250 token。建议迷你档不含，标准档收 8 个高频：investigation、bug-fix、feature、refactoring、prototype、babysit、shipping、opening-a-pr；其余以「全表见 SKILL.md」指针带过）

### 4.3 体积两档估算

| 档 | 内容 | 字节 | ≈token/会话 | 说明 |
|---|---|---|---|---|
| 迷你 | A+B | ~1.2KB | **~300** | 只做路由器：把模型推向正确的 skill/playbook，自身不含原则正文 |
| 标准 | A+B+C+D+E（+F 精选） | ~2.5-3.5KB | **~600-900** | 路由 + 核心原则 + 自主性 + 行文纪律；即使模型不读全文也有底线行为 |
| （反例）全文 | SKILL.md 原文 | 20.5KB | ~5,000 | 否决：每会话 5k token 常驻，违反 guard-the-context-window |

护栏对照：标准档 3.5KB 远低于 stdout 32KB 与合并 24k 字符上限（S3）；摘要用英文（与 SKILL.md 一致，且 ~4 chars/token 比中文更省）。

## 5. 风险与让步

1. **workspace 级 hook 状态三源分歧**（§1.4）：主配方已绕开（用户级）；若做项目级变体必须先在 3.15.3 实测（测试 hook + 新会话 + 查日志 `config_project_hooks_*`）。S1 skill 文档与 S2 web 文档至少一方滞后，实施时以实际行为为准。
2. **ADR-0002 张力与分发缺口**：摘要放 `scripts/resident/` 合规（自有基建路径），但 `npx skills add` 只分发 `skills/` 目录（ADR-0003），所以**别的项目装了 pstack skills 也拿不到 resident-summary.md**，v1 常驻实际只覆盖本机/本仓库（探测器命中 `.zcode/skills/poteto-mode` 的项目时摘要文件不在场 → no-op）。要让 skills-add 用户也能常驻，需要把摘要纳入分发面的决策（改 ADR 或放行 subtree 内新文件），这是产品取舍不是技术问题，留给下一轮拍板。
3. **双文本漂移**：resident-summary.md 与 SKILL.md 是两份要同步的文本。缓解：(a) 摘要设计成路由器+指针，正文依赖面小；(b) 给 `scripts/cursor-residue-lint.sh` 同级的 CI 加一条「SKILL.md 变更必须重看 resident-summary」检查或提醒；(c) 上游 sync（`scripts/sync-upstream.sh`）后的 checklist 里加一行。这正是 poteto 的 Encode Lessons in Structure 原则的适用场景。
4. **compaction 行为未实测**：注入条目在上下文压缩后是否保留/摘要化未验证（messageHistory 条目大概率参与 compaction，但保留程度未知）。对超长会话，常驻纪律可能在压缩后弱化——这其实与 AGENTS.md 的命运相同，可接受，但要在文档里明说。
5. **node 依赖**：配方假设 node 在 PATH（本机 v24.9.0 ✅，S5）。换机器安装时安装器应先探测 `node --version` 并给出清晰报错；不引入 bun 依赖（本机没有）。
6. **静默失败难察觉**：hook 失败/超时只是「没注入」+ 日志记录（S2/S3），用户可能以为常驻在生效。缓解：`statusMessage` 常显（S3 字段支持）；安装器结尾打印「新会话应看到摘要开头第一行」的自检指引。
7. **resume 的双刃**：matcher 含 resume 则恢复的会话再注入一次（一致性好、多一次成本）；不含则 resume 后常驻纪律消失。example-plugin 选择了不含 resume（S5）。建议默认含（常驻语义优先），文档记录一行关闭法。
8. **Q8 合规性再确认**：本方案 (a) 不改 `skills/` 上游内容，(b) 不改默认安装产物，(c) 安装是用户显式命令且写入的是用户自己的全局配置，(d) 卸载一行还原。与「否决默认全局常驻」不冲突；但 README/文档若宣传此功能，措辞必须是「可选件」而非推荐默认。
9. **上游演进风险**：S3 引用的行号与 24000 字符常量可能随版本变化（本机 3.15.3）；实施票落地时以当时源码复核一次关键字段（`hookSpecificOutput`、`additionalContext`、maxOutputBytes 默认值）。

## 附录：本次调研新引用的上游文件（gh api 取原文）

- `packages/shared/src/workspace-hook-config.ts`（361 行全文：schema、默认值、发现规则）
- `apps/zcode-cli/packages/core/src/hooks/output.ts`（160 行全文：stdout 解析、事件效果、matcher）
- `apps/zcode-cli/packages/core/src/runtime/methods/hooks.ts`（160 行全文：SessionStart/UserPromptSubmit/Stop 触发、注入与 24k 截断）
- `docs/hooks-runtime-contract.md`（252 行全文：配置来源表、matcher/stdin/stdout 契约、设置页契约）
- `docs/specs/workspace-hook-trust-persistent-only.md`（236 行全文：workspace hook 持久信任模型）
- `docs/specs/workspace-hook-trust.md`（首 2KB 预览：指向 persistent-only 为最新语义）
