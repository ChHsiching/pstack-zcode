# pstack-zcode 适配改动审计报告

- 审计日期：2026-10-16
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
- 测试：真机 T5 ✅（arena 实际扇出+cross-judge 独立复核并抓到一个真问题）；T6 覆盖 swarm。已知限制：workflow 编译器拒绝运行时字符串 pin 模型——面板配真实模型后需重新生成保存的 workflow（fail-closed，设计如此）。

### F. orchestrate/autopilot 拓扑（票#8，ADR-0006）
- 编排职责从"子代理嵌套（depth 3）"改为 workflow 脚本拓扑；云端放置→本地 actor+worktree 隔离；escalate 回主会话作兜底。
- 测试：真机 T6 ✅（4 worker 由单脚本编排、零嵌套指令、门控独立复验）。

### G. 会话挖掘（票#9；reflect 36 行、recall 18、automate-me 28、show-me-your-work 14）
- Cursor 转录路径（`~/.cursor/projects/*/agent-transcripts/*.jsonl`）→ `ReadSessionContext`（sess_* id）检索；找不到=明确结论而非编造；automate-me 的落盘路径同改。
- 测试：真机 T7 ✅（含已知限制：ZCode 无历史会话列表，recall 依赖显式 id 或诚实降级——机制如实保留）。

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

## 四、已知残留与让步（全量，无隐瞒）

1. **白名单放行 13 条**（`scripts/cursor-residue-allowlist.txt`，每条带一行理由）：worktree-audit.sh 的转录目录（ReadSessionContext 是查询式 API，无目录机制可换）、make-bot-ui 的 api2.cursor.sh（ADR-0007 搁置）、watch-pr 的 Bugbot 字样、autopilot 的 /loop 字样（ADR-0006）等。
2. recipes 页一处图片 alt 文本仍写 /loop（上游图片本身画着它，改 alt 反而失真）。
3. T7 限制：无会话列表机制，属 ZCode 平台现状非适配缺陷。
4. 面板 pin 真实模型后需重新生成保存的 workflow（编译器安全限制）。
5. 3 处"有意修正"（改名时顺带统一 kebab/冠词），已在票#3 记录。
