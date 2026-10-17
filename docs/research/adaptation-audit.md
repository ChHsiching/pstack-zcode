# pstack-zcode 适配改动审计报告

- 审计日期：2026-10-16
- 第二轮收官更新：2026-10-17（票 #16–#25）：§四 每行增注本轮档位与证据、平台限制注；§五 清理已消除让步。§一–§三 的总量与分层为第一轮收官快照，未随第二轮重算（第二轮增量见各票）。
- 基线：上游 `cursor/plugins` pstack 子树 v0.15.25（提交 `d5f759e`，即同步合并的第二个父提交）
- 对照命令：`git diff d5f759e..main`；网页对照：https://github.com/ChHsiching/pstack-zcode/compare/d5f759e...main
- 总量：**135 个文件，+3536 / −956**。其中 24 个是纯新增的基建文件（ADR、调研报告、脚本、CI 等，与上游内容无关），**对上游内容的实际修改是 111 个文件**

## 一、如何亲自抽查（10 分钟版）

1. 打开上面的 compare 链接，按文件浏览。
2. 抽一个"仅改名层"技能看 diff：例如 `skills/principle-laziness-protocol/SKILL.md` —— 应该只有 frontmatter `name` 一行加前缀（+1/−1）。
3. 抽一个中度技能看机制替换形态：`skills/swarm/SKILL.md` —— 看 Phase A/B 的模型选择与 workflow 扇出段。
4. 抽一个重度技能看整体重写：`skills/setup-pstack/SKILL.md` —— 注意正文结构仍与上游 7 步一致，变的是机制载体。
5. 全库残留检查：`sh scripts/cursor-residue-lint.sh`（exit 0；白名单 13 条逐条带理由，见 `scripts/cursor-residue-allowlist.txt`）。

## 二、技能改动深度分层（54 个技能，全部至少含改名）

| 深度 | 数量 | 含义 | 名单 |
|---|---|---|---|
| 仅改名层（≤2 行） | **27** | frontmatter `name` 加前缀（正文零改动） | 24 个 principle 中的多数、bro、in-your-own-words、sharpen、technical-writing、tdd、benchmark-checklist、no-comments、figure-it-out 等 |
| 轻度（3–10 行） | 11 | 改名 + 描述/正文交叉引用 + 个别措辞 | how、poteto-mode 的多数 playbook、ketchup、make-bot-ui 等 |
| 中度（11–25 行） | 11 | 机制替换集中（spawn 措辞、模型读取、面板参数） | arena 12、swarm 12、interrogate 15、why 16、architect 18、recall 18、reflect 36、teach、blast-radius、create-verification-skill、show-me-your-work |
| 重度（>25 行） | 5 | 实质性重写（机制载体更换） | poteto-help 144、setup-pstack 72、poteto-mode 53、reflect 36、automate-me 28 |

行数为 SKILL.md 单文件相对上游的增删合计；playbook/references 子目录另计。

## 三、逐类改动账目（改了什么 / 为什么 / 测试结果）

### A. 改名层（54 技能，票#3，ADR-0004）
- **改了什么**：frontmatter `name` 加 `pstack-` 前缀；全部技能间交叉引用同步加前缀；3 处有意修正（`Poteto Mode`→`pstack-poteto-mode` 等 kebab 统一）。
- **为什么**：防同名 shadow（本机 mattpocock 集合有 tdd/teach/unslop 同名）；目录名不动保上游合并零结构冲突。
- **测试**：机械 diff 证明每行均为纯前缀插入；真机 T1（菜单共存、两版互不干扰）✅。

### B. spawn 与工具名机制替换（约 25 文件，票#4，映射表）
- **改了什么**：`Task` 工具参数措辞（subagent_type/readonly/run_in_background/environment）→ 编辑器中立子代理语言；`AskQuestion`→`AskUserQuestion`（6 处）；Cursor 内建引用修剪或替换（/loop、Bugbot→review-bot、/create-skill→Authoring playbook、cursor-team-kit→playwright/chrome-devtools）；bugbot-triage.md 改名 review-bot-triage.md。
- **为什么**：这些是 Cursor 专有 API；中立措辞在 ZCode Agent 工具下语义不变。
- **测试**：逐文件 grep 零残留；真机 T2（poteto-mode 委派）、T4（子代理按名 spawn）✅。

### C. 子代理（2 文件 +3/−4，票#5）
- 去掉 `is_background`；`~/.cursor/plugins` 回退搜索改为 ZCode 技能目录序列；generalPurpose→general-purpose。
- 测试：真机 T4 ✅（comment-sicko 实际跑了一次评审并正确杀注释）。

### D. 模型角色系统（票#6，ADR-0005；setup-pstack 重写 72 行）
- **改了什么**：配置载体 `~/.cursor/rules/pstack-models.mdc` → `~/.zcode/pstack/models.md`；默认全 `inherit-parent`；检测三级降级（模型目录→本机 provider 配置→问用户）；仅对用户 pin 的角色生成预设 agent；读者技能（poteto-mode/how/why/reflect/6 个 playbook）改为读新文件。
- **为什么**：ZCode 无 .mdc 规则机制；省略 model 字段=继承父会话模型，与上游 inherit-parent 语义逐字对齐（官方文档核实）。
- **测试**：真机 T3 ✅（问卷、落盘、幂等重跑、18 角色全继承）；预设 agent 的实际 spawn 效果未配真实模型故未跑（设计上仅 pin 时存在）。

### E. 评审面板 workflow 化（票#7，ADR-0005）
- arena/interrogate/swarm/architect：面板改为 dynamic workflow 扇出，每评审员独立模型+档位（从 models.md 面板行读）；异家族互查保留；保存为可按名复跑的全局 workflow；Cursor 家族回退链替换为单一校验回退（无效模型→会话模型并声明）。
- 测试：真机 T5 ✅（arena 实际扇出+cross-judge 独立复核并抓到一个真问题）；T6 覆盖 swarm。已知限制：workflow 编译器拒绝运行时字符串 pin 模型——面板配真实模型后需重新生成保存的 workflow（fail-closed，设计如此；第二轮 #19 已自动化检测+重生成，见 §四 平台限制注）。

### F. orchestrate/autopilot 拓扑（票#8，ADR-0006）
- 编排职责从"子代理嵌套（depth 3）"改为 workflow 脚本拓扑；云端放置→本地 actor+worktree 隔离；escalate 回主会话作兜底。
- 测试：真机 T6 ✅（4 worker 由单脚本编排、零嵌套指令、门控独立复验）。

### G. 会话挖掘（票#9；reflect 36 行、recall 18、automate-me 28、show-me-your-work 14）
- Cursor 转录路径（`~/.cursor/projects/*/agent-transcripts/*.jsonl`）→ `ReadSessionContext`（sess_* id）检索；找不到=明确结论而非编造；automate-me 的落盘路径同改。
- 测试：真机 T7 ✅（含已知限制：ZCode 无历史会话列表，recall 依赖显式 id 或诚实降级——机制如实保留；第二轮 #16 已补列表+搜索，见 §四）。

### H. 生成技能落盘（票#10，仅 4 行路径）
- `.cursor/skills/` → `.zcode/skills/`。
- 测试：真机 T8 ✅（生成→项目级发现→调用，无头 CLI 实证）。

### I. benny 原生自动化（票#11，ADR-0007；automations/ 11 文件 + 新 hook）
- setup-benny 改为用 CronCreate 建定时自动化；Slack 走 MCP、工单走 gh、UI 复现走 browser-use；新增 PreToolUse hook 机械强制"绝不发根帖"；安全契约（线程内回复、只读子代理、fail-closed）原样保留。
- 测试：真机 T9 ✅（缺配置干净拒绝、0 自动化残留）；GitHub 降级链路全程实跑；真实 Slack 环节未跑（需你配 Slack MCP）。

### J. 质量基建（票#12；纯新增）
- lint（20 词）+ 白名单 13 条（每条带理由）+ CI（lint + 每周上游巡检，只报告不作为）。CI 在 GitHub 上真实运行且绿。

### K. 文档（票#13）
- README 重写为 pstack-zcode 前门（安装/差异表 11 行/已知限制）；11 页 guide 逐页机制替换。
- 测试：lint 零 Cursor 操作、断链检查、差异表逐行对码 ✅；guide 逐页"照着走"未人工全走（安装路径与 T1/T8 重合部分已实证）。

### L. 我们的新增基建（24 文件，非适配、自由评审）
- docs/adr×7、docs/research×6、docs/agents×4、scripts×3、hook×1、GLOSSARY、AGENTS.md、CI workflow。

## 四、适配取舍与未成功清单（没有 1:1 平移的功能）

第一轮分档：❌ 未适配（放弃）、⚠️ 降级实现（可用但有损失）、⭕ 丢弃（无功能损失）。决策依据见 ADR 与 grilling 记录。
第二轮收官（#16–#25）逐行增注本轮达到的档位：**完整适配**（机制补齐）/ **可选等效**（opt-in 等效物）/ **平台限制维持**（本轮未升级或结构不可能）；证据=票号+调研文档。

| 档 | 功能 | 上游（Cursor） | pstack-zcode 现状 | 损失 | 依据 | 第二轮档位与证据 |
|---|---|---|---|---|---|---|
| ❌ | **make-bot-ui 按钮页** | api2.cursor.sh 托管 webhook routine | 技能休眠保留，未改造 | 功能整体不可用（除非自建公网 webhook） | ADR-0007 搁置 | **平台限制维持（owner 拍板不建，2026-10-17）**：两路由执行端皆依赖无头入口（非受支持 CLI），owner 否决；免无头的轮询变体亦搁置（凡需主动唤醒 ZCode 的先不做）；技能保留休眠随装随发，将来有空可深度适配 — #26 决定 / #24 / cloud-execution-and-webhook-options.md |
| ⚠️ | **常驻模式** | Option+Enter 全程 Custom Mode | 每任务手动 `/pstack-poteto-mode` | 无"一直开着"体验 | Q8 决策 | **可选等效**：opt-in SessionStart hook 包，默认不装，一行装/一行卸；仅对装了 poteto-mode 的项目注入约 300 token 摘要，且有 CI 锚点 lint 防漂移 — #20 / ADR-0009 / sessionstart-hook-optin.md |
| ⚠️ | **/loop 自主长跑** | Cursor 内建循环唤醒 | workflow 脚本自循环 + Stop hook 3 轮弱等价 | 长跑节奏不同 | ADR-0006 | **可选等效**：三种机制（workflow 自循环+上限 / Stop hook 三轮 / cron 唤醒）成文为长跑配方，含分段夜间组合与完成判据，锚定 /loop 1h 武装短语 — #23 / docs/guide/07-overnight.md |
| ⚠️ | **云端并行执行** | swarm `environment:"cloud"` / Cloud Mac | 本地 actor + worktree 隔离 | 无云端算力与沙箱 | ADR-0006 | **平台限制维持＋结论注**：Actions 跑 zcode CLI 条件可行，卡点 CLI 分发+许可，默认不建（见下"平台限制注"）— cloud-execution-and-webhook-options.md §5 |
| ⚠️ | **自动化 24/7** | Cursor Automations 云端常驻 | 本机 CronCreate；睡眠不触发、错过不补 | 离线窗口漏报 | ADR-0007（明示接受） | **平台限制维持**：睡眠不触发、错过不补照旧；云端替代路径已调研（Actions，条件可行默认不建，见下） — ADR-0007 / cloud-execution-and-webhook-options.md §5 |
| ⚠️ | **多模型面板默认值** | 默认 opus+grok 异家族互查 | 默认全 inherit（单模型），diversity 需自 pin | 开箱多模型评审没有 | Q13 / ADR-0005 | **完整适配**：tier-2 检测改读真实 provider 配置（模板目录不再读）+ blocked 过滤 + 一次性两家族面板提议（拒绝零残留、幂等）；默认仍单模型系 Q13 既定决策而非缺陷 — #18 / ADR-0010 / multi-model-panel-defaults.md |
| ⚠️ | **会话转录挖掘** | 全量扫描 ~/.cursor/projects/*.jsonl | ReadSessionContext 查询式；ZCode 无会话列表，依赖显式 id | 无法主动翻历史 | 票#9；T7 实测 | **完整适配**：会话库只读列表+关键词搜索（mode=ro、目录限定、fail-closed 降级为问 id），recall/automate-me/session-pickup 三入口共用一个 helper；复审发现其文档调用路径按写法不可达（§五-3） — #16 / ADR-0008 / session-db-direct-read.md |
| ⚠️ | **仅显式调用** | disable-model-invocation 硬开关 | 无开关，description 文字约束 | 模型可能自动触发 | 映射表#5 | **可选等效**：平台无硬开关如实成文（250 字共享窗口、200+ 技能降级 names-only、skills.metadataBudget 旋钮）+ 可选 command shim 硬门配方；frontmatter 不动（双栖息保留） — #22 / skill-auto-invocation-controls.md |
| ⚠️ | **评审生态** | Bugbot、cursor-team-kit 内建 | 修剪/近似（playwright、chrome-devtools）；Bugbot 惰性 | 评审工具链弱于原生态 | 票#4 | **平台限制维持**：本轮未动 — 票#4 |
| ⚠️ | **worktree-audit LAST_CHAT** | 从 Cursor 转录取最后会话时间 | `-d` 守卫降级为 "-" | 该列缺失 | 白名单（条目 #17 已删） | **完整适配**：真实末次会话时间入列（同 #16 helper，mode=ro，Windows 8.3 短路径归一；缺库/损坏/无 python 时安静降级 "-"），两条过时白名单随之删除 — #17 / session-db-direct-read.md |
| ⚠️ | **子代理随装** | 插件自带 | skills CLI 不装 agents，手动复制 | 安装多一步 | ADR-0003 | **可选等效**：一命令安装器（raw URL 拉取、逐文件自检、先验后换、幂等重跑、--check 复验）；skills CLI 不装 agent 文件是平台事实 — #21 / ADR-0003 后果行已同步 |
| ⭕ | Custom Mode 徽章 icon/color | 徽章样式 | 移除 | 纯装饰无损失 | 映射表#6 | **维持丢弃**（无损失，本轮无变化） |

### 平台性限制（第二轮收官更新）

- **运行时 pin 模型 → 已缓解（#19，部分）**：真机实验证实 SaveWorkflow 保存时不解析模型（任意 id 可存、启动才校验并给出目录）、同名保存=整文件替换（无需 overwrite 旗标）；setup-pstack 第 6 步现按「守卫 vs 模型字面量 vs 面板行」机械检测过期，经 Skill(dynamic-workflows) 先行 + 同名 SaveWorkflow 重生成、逐次确认（证据：#19 评论 6220311923）。残留两点如实记录：重生成路径仅对两张草稿真跑过检测 dry-run，未对用户实存面板跑端到端重生成；重生成的每模型 @level 必须取该模型支持的档位，否则启动 fail-closed。
- **子代理不可嵌套 → 维持**：ADR-0006 编排改写的动因，本轮无变化。

### 平台限制注（C 档结论归档）

- **GitHub Actions 跑 zcode CLI：条件可行，默认不建。** 无头 `-p` 与 API-key 认证机制已实测走通；卡点为 **CLI 分发**（无官方公开渠道：npm 未发布、Releases 只有桌面安装包、SEA 走内网；需自带 bundle 或源码构建）与**许可**（Coding Plan 条款只覆盖"指定工具环境"，无头 CI 无公开裁决）。Owner 立场（2026-10-17，#26）：无头入口这一前提已被否决，Actions 同样暂不做；拍板入口：cloud-execution-and-webhook-options.md §5 的最小 POC 清单与 §6 决策问题 5–7。
- **make-bot-ui 公网 webhook：owner 拍板不建（2026-10-17，#26）。** 两路由的执行端都以无头入口（`zcode.cjs -p`）spawn 进程，owner 认定那不是受支持的正常 CLI；免无头的 CronCreate 轮询变体也一并搁置（凡需主动唤醒 ZCode 的暂不做，无法以快速最小修改实现）。技能保留在集合中休眠（随装随发、惰性）；将来有空可按 #26 的调研做深度适配。README known-limits 已更新为该结论。

## 五、已知残留与让步（全量，无隐瞒；第二轮收官后）

1. **白名单放行 13 条**（`scripts/cursor-residue-allowlist.txt`，每条带一行理由；lint 对无匹配条目直接 fail，故不可能存在过期条目）：调研文档引述源材料、README 差异表点名被换机制、recipes 图片 alt、ADR-0009 决策语境（#20）、GLOSSARY avoid-list ×2、07-overnight 武装短语（#23）、make-bot-ui ×2（ADR-0007 搁置）、watch-pr 的 Bugbot 字样、autopilot 与 check-plan 的 /loop 字样（ADR-0006，共 3 条）。第二轮净变化：#17 删 2（worktree-audit 转录目录，机制已死）、#20 与 #23 各加 1。
2. recipes 页一处图片 alt 文本仍写 /loop（上游图片本身画着它，改 alt 反而失真）。
3. **session-store helper 的文档调用路径按写法不可达**（独立复审发现，中危；**已修**）：原落地文本写 `python ../poteto-mode/scripts/session-store.py`（相对工作区根解析不到安装位置），fail-closed 保住正确性但列表功能实际不可用。修复：三处（recall/automate-me/session-pickup）改为锚定「本会话技能清单所示 pstack-poteto-mode 目录」，并给出 repo/项目级/全局三种拼法；两种布局拼写均实测可跑（repo 根与模拟 `~/.zcode/skills` 安装各一次，列表结果一致）。
4. **resident 安装器 `--remove` 不回滚自己加进既有 hooks 对象的 `hooks.enabled: true`**（独立复审发现，低危；**已修**）：安装置位时现在写 sidecar（`~/.zcode/cli/pstack-resident.state.json`）记录，`--remove` 按记录回滚（沙箱实测：潜伏 hooks 装后激活、卸后回到潜伏且配置逐键还原；空家目录装卸后 config 归 `{}`；显式 `enabled:false` 全程不动）。已知边界：装后再手动自置 `true` 的用户在卸载时会被一并回滚，卸载输出有提示。
5. 3 处"有意修正"（改名时顺带统一 kebab/冠词），已在票#3 记录。
