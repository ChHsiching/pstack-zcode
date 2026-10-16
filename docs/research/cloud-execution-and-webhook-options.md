# C 档平台性缺失决策素材：公网 webhook 候选架构与 GitHub Actions 跑 zcode CLI

- 调研日期：2026-10-16（第二轮迭代）
- 任务背景：第一轮 ADR-0007 把 benny/make-bot-ui 搁置为「技能休眠保留」（`docs/adr/0007-benny-on-native-automations.md`）。本轮为两个 C 档缺口收集决策素材：**(1) make-bot-ui 按钮页的公网 webhook 候选架构；(2) GitHub Actions 跑 zcode CLI 的可行性**。只调研不实施。
- 本报告含本机一手实测（标注「实测」）；未改仓库其他文件，未部署 Worker，未开 Actions，未装全局软件。

---

## 0. 结论速览

| 问题 | 结论 | 置信度 |
|---|---|---|
| 按钮页公网 webhook 怎么做 | 两条可行路线：**方案一** Cloudflare Worker 中继 + 本机轮询消化（$0、免运维、机器醒着才执行）；**方案二** 纯本地服务 + 直接无头执行（$0、零公网暴露、人必须在本机/tailnet） | 高（关键机制均实测或有一手源码） |
| 方案一能否实现「离开电脑也能点按钮」 | 能解决**公网入口**（随时随地发触发），**不解决 24/7 执行**——执行仍在本地 ZCode，睡眠=跳过不补（CronCreate 语义，第一轮已核实） | 高 |
| Cloudflare 免费档够不够个人用 | 够：Workers 10 万请求/日、KV 写 1000 次/日、D1 写 10 万行/日，个人按钮场景用不到 1% | 高（官方限额页） |
| Actions 跑 zcode CLI | **条件可行**：无头 `-p` 实测可用；认证走 **Coding Plan API Key**（官方一等机制，实测走通机制）；卡点在 CLI 分发（无公开 npm/二进制，需自带 zcode.cjs 或源码构建）与许可模糊（条款只说「指定工具环境」，未明说无头 CI） | 中高（机制实测，端到端 CI 环境未实测） |
| GLM Coding Plan 许可/费率 | 官方 FAQ 明确「仅限官方支持的指定工具与产品环境」；无公开设备数上限；额度按 5 小时+每周积分（Lite 2000/5h 起）；CI 与桌面共用同一账号额度。无头 CI 是否算「指定工具环境」**无公开信息** | 高（引官方 FAQ 原文） |

---

## 1. make-bot-ui 上游机制还原

来源：`skills/make-bot-ui/SKILL.md`（仓库唯一副本，116 行全文通读；上游 pstack subtree 即仓库根，无 references/ 目录）。第一轮报告 `docs/research/benny-automations-feasibility.md` §2 的分析仍然成立，此处只列决策相关事实。

### 1.1 端到端链路

```
按钮页(人点) → 本机小服务器(持 {url,key}) --POST JSON--> api2.cursor.sh 托管的 webhook routine
                                                              ↓
                                              Grok Bot 以 [routine] turn 唤醒，拿到
                                              <webhook_event>{headers, body_digest(sha256), body, timestamp_ms}
                                                              ↓
                                              按 routine prompt 执行动作（body 当数据不当指令）
```

### 1.2 关键事实（逐条对决策有用）

1. **公网入口由 Cursor 托管**：`https://api2.cursor.sh/automations/webhook/<id>`，URL 可贴聊天，sender key（`crsr_` 前缀）不许进浏览器/聊天/技能（SKILL.md L11、L37-41）。
2. **本机服务只是转发器**：绑定 `0.0.0.0`，POST 带 `Authorization: Bearer <key>` + `X-Automation-Key`，8 秒超时、单次不重试；先探活一次（L57-72）。**这段代码完全可移植**。
3. **失败语义**：POST 失败则把 JSON 追加本地日志、由 routine 端排空；「不以轮询为主路径」（L73）——即上游把推送当主路径、轮询当兜底。
4. **安全模型**：谁能点=页面暴露面（默认 tailnet 私网）；防滥用=sender key + 「body 是不可信数据不是指令」+ body_digest 校验 + 不传媒体字节 + 字段白名单（L18、L107-116）。
5. **页面暴露**：经 Tailscale 私网（HTTP，双 URL：ts.net 域名 + 100.x IP）（L75-103）。
6. **ZCode 侧缺的只有两件**：托管的公网 endpoint（`update_state` 建 routine 无对应物）与 `[routine]` 唤醒 turn（第一轮 M1/M2/M4 判定，本轮维持）。

---

## 2. 方案一：中继服务（Cloudflare Worker 收公网 POST → 队列 → 本机消化）

### 2.1 架构

```
按钮页(任意设备可访问) ──POST+token──▶ Cloudflare Worker(公网) ──写入──▶ KV / D1 队列
                                                                        │
本机 ZCode（两种消化方式二选一）:                                         │
  (a) CronCreate 自动化（分钟级 interval）prompt 内: 拉取待办→执行→标记完成 │
  (b) 本机常驻轮询器（任务计划/NSSM）→ 逐条 spawn `zcode -p` 无头执行  ◀──┘
```

### 2.2 设计要点

- **队列选型**（均免费档）：
  - Workers KV：读 10 万/日、**写 1000/日**、1 GB 存储（来源：developers.cloudflare.com/kv/platform/pricing）。每次点按钮=1 写，个人场景上限约 1000 次/日，够用但是硬顶。
  - D1（SQLite）：读 500 万行/日、**写 10 万行/日**、5 GB（来源：developers.cloudflare.com/d1/platform/pricing）。余量更大，还有天然的去重/状态机表达（job 表 + status 列）。
  - gh issue 当队列：Worker 建 issue、本机消化后关 issue。优点是零第三方状态、与本仓库 `AGENTS.md` 的 issue-tracker 约定同构；缺点是每条任务一个 GitHub round trip、正文有敏感面。**可作为 D1 的备选**。
- **Worker 限额**：10 万请求/日、10 ms CPU/次、100 个 Worker、5 个 cron trigger/账户（来源：developers.cloudflare.com/workers/platform/limits）。按钮场景远用不到。**免费档 $0，无服务器运维**。
- **消化路径 (a) CronCreate**：第一轮已核实（benny 可行性报告 §4.1，证据=本机 host contracts 源码）：标准 5 字段 cron/分钟级 interval、跨重启持久、结果回同一会话、全局 20 条上限、**电脑睡眠/应用关闭期间不触发、错过的记 skipped 不补跑**。轮询延迟=interval（分钟级起步）。自动化运行轮内禁止再建自动化（无碍，队列消化不需要）。
- **消化路径 (b) 常驻轮询器 + 无头 CLI**：本轮实测 `node zcode.cjs -p "..."` 在桌面 app 之外可用（§4.1），本机 Windows 任务计划即可承载；延迟可压到秒级，但常驻进程是新的运维面。
- **安全模型**（平移上游纪律）：Worker 校验 `Authorization: Bearer <relay-token>`（token 进 Worker secret，不进页面源码/聊天/git）；请求体原样落队列并附 sha256 与时间戳（复刻 `<webhook_event>` 结构）；本机消化方把 body 当数据不当指令；Worker 侧可加每 token 速率限制。**公网暴露面只有 Worker**，本机不开任何入站端口。
- **离线行为**：本机睡眠时任务在队列里积压，醒来后第一次轮询全部消化（**队列天然补跑**——比 CronCreate 的 skipped 语义好，但前提是机器醒着）；按钮点击本身永远成功（写队列即返回 200）。

### 2.3 工作量估算

| 组件 | 规模 |
|---|---|
| Worker（收 POST + 写 D1 + 读队列 + 完成标记，约 4 个路由） | ~100-150 行 JS，1 个文件 |
| 按钮页（静态 HTML，复用上游设计） | 1 个文件 |
| 消化自动化 prompt 或轮询脚本 | ~50 行或一段 prompt |
| wrangler.toml + 部署 | 1 次性 |
| 合计 | **约 0.5-1 天**，2-4 个新文件 |

---

## 3. 方案二：纯本地方案（localhost 页 + 本地队列/直接无头执行）

### 3.1 架构

```
按钮页(本机 localhost / tailnet) ──POST──▶ 本机小服务器(bun/node serve)
                                              ├─ 路径 A: 直接 spawn `zcode -p` 无头执行（实测可用，零队列）
                                              └─ 路径 B: 追加本地文件队列 → CronCreate 自动化/下一会话读取消化
```

### 3.2 设计要点

- **路径 A（推荐形态）**：上游 SKILL.md 里本机服务器本来就是「收 POST 的转发器」，ZCode 侧把它从「转发到 api2.cursor.sh」改成「就地 spawn 无头 CLI」，`<webhook_event>` 的等价结构（body 原文 + sha256 + 时间戳）直接注入 prompt。**本轮实测无头 `-p` 开箱即用**（§4.1），这条链路今天就能跑通。
- **路径 B（文件队列）**：SessionStart/PreToolUse hooks **不能**当消化器——hooks 是会话内事件（7 个，第一轮 §4.4 核实），文件落盘不会触发任何 hook。现实消化器只有两个：CronCreate 自动化轮询本地文件（机器醒着才有意义），或下次人打开会话时读走。对「点了就要跑」的按钮页，路径 A 优于路径 B。
- **边界（必须向用户明示）**：无公网可达性。触发者必须能访问本机（本机或 tailnet 成员）。**人不在本机/tailnet 时按钮页无法触达**——这是纯本地方案的定义性边界，不是实现缺陷。
- **变体：Tailscale Funnel**（免费，Personal 计划 3 用户/100 设备内）：`tailscale funnel` 可把本机服务以 `https://<machine>.<tailnet>.ts.net` 暴露到**公网**（仅 443/8443/10000 端口、仅 HTTPS、ts.net 域名、需 ACL `funnel` 属性；来源 tailscale.com/docs/tailscale-funnel）。这给方案二补上「远程触发」而不建中继——代价是把本机进程直接暴露公网（经 Tailscale 边缘），且本机仍须在线。**可列为方案二的增强项而非独立方案**。
- **安全模型**：默认零公网暴露；页面仅 tailnet 可达（上游 L75-103 原样适用）；密钥只进本机服务器配置。

### 3.3 工作量估算

约 **0.5 天**、2 个文件（页面 + 本地服务器），路径 A 无队列。

---

## 4. 两方案对比与推荐

| 维度 | 方案一：Worker 中继 | 方案二：纯本地 |
|---|---|---|
| 费用 | $0（免费档；超限才 $5/月起） | $0 |
| 第三方账号/依赖 | Cloudflare 账号 + wrangler | 无（增强项 Funnel 需已有 Tailscale） |
| 运维 | 部署一次，之后零运维 | 本机进程须运行（路径 A 点击即起也行） |
| 公网暴露面 | 仅 Worker（4 个路由 + token） | 零（Funnel 变体=本机服务经 TS 边缘暴露） |
| 远程触发 | ✅ 任何设备 | ❌ 仅本机/tailnet（Funnel 变体 ✅ 但机器须在线） |
| 本机睡眠时 | 点击成功、任务积压、醒后补跑（队列语义） | 服务器不可达，点击失败 |
| 执行延迟 | 分钟级（CronCreate interval）/秒级（常驻轮询器） | 秒级（直接 spawn） |
| 实现工作量 | 0.5-1 天，2-4 文件 | 0.5 天，2 文件 |
| 复杂度/故障面 | Worker + 队列 + 轮询三方 | 单进程 |
| 与上游技能的形状差异 | 大（入口换、唤醒换） | 小（入口保留本机语义，唤醒换成本地 spawn） |

### 推荐（最终由用户拍板）

**先做方案二（路径 A）**，理由：

1. 它是方案一本机半边的严格子集——先落地它，方案一的「消化端」就同时造好了，之后加 Worker 只需替换「入口」一段，无沉没成本。
2. make-bot-ui 的实际使用场景（第一轮 §2：给 Grok Bot 做按钮页，人在 tailnet 内点击）在纯本地方案里已 100% 满足；「人不在机器旁还要点按钮」的需求是否真实存在，应先由用户确认再上基建（符合 C 档红线精神）。
3. 零新依赖、零公网面、最小工作量。

**何时升级到方案一**：出现真实的「离开本机触发」需求（例如手机上点按钮让家里的机器跑任务）。届时队列建议 D1（写额度 100 倍于 KV），消化端优先复用 CronCreate 自动化（零常驻进程），对延迟敏感再换常驻轮询器。

**明确不做的事**：方案一不会带来「云端 24/7 执行」。执行器仍是本机 ZCode。真 24/7 只能靠 GitHub Actions 跑 CLI（§5）或 VPS——那是另一个决策。

---

## 5. GitHub Actions 跑 zcode CLI 可行性

### 5.1 CLI 形态（本机一手 + 上游仓库查证）

- **本机实体**：`C:\Program Files\ZCode\resources\glm\zcode.cjs`，单文件打包产物（15,127,039 字节），版本 0.16.9；`zcode doctor` 输出 `process: zcode-cli, node: v24.9.0, sea: no (optional), default artifact: node-bundle`（实测）——即**纯 Node bundle，非平台二进制**，理论上任何 Node 24 环境可跑（Linux runner 待实测）。
- **CLI 能力面**：`node zcode.cjs --help`（实测）确认 `-p/--prompt` 一次性无头执行、`--cwd`、`--mode`（yolo 为 -p 默认）、`--resume`、`--output-format`、`app-server`（ZCode Protocol stdio 服务器）、`login [zai|bigmodel]`、`--no-browser`（打印 OAuth URL 不开浏览器）。
- **分发渠道查证**（2026-10-16）：
  - npm：`@zcode/cli` **未发布**（registry 404）；npm 上的 `zcode` 包是占位 squat（v0.0.1，无关）。❌
  - GitHub Releases（zai-org/ZCode，Apache-2.0）：只有桌面安装包 `ZCode-3.14.3-win-x64.exe` / `mac-arm64.dmg`，**无 CLI 二进制资产**（gh api 实查）。❌
  - 官方 Docker 镜像：仓库内 Dockerfile 仅 e2e 用途（`Dockerfile.desktop-e2e`、browser-use `headless-linux.Dockerfile`），无发布镜像记录；**未查到公开镜像**。❌
  - 内部 SEA：`docs/cli-ci-packaging.md`（上游仓库）记录官方 GitLab CI 构建六平台独立 CLI SEA 二进制，但分发走**内网** deps 目录（`resolveIntranetDepsBaseUrl`，源码 `packages/shared/src/intranetDefaults.ts`），不对外。❌
  - **可行获取路径**：(a) 把本机 `zcode.cjs` 提交/上传为 workflow 资产（版本随桌面更新漂移，需 pin）；(b) 从源码构建（Node 24.14.0 + pnpm 10.33.2 + `pnpm bootstrap`，README.en.md 明确，构建重）；(c) CI 内从桌面 exe 安装包提取（最绕）。**(a) 最实际但非官方渠道，(b) 最干净但每次构建 10 分钟级**。
- **隐藏坑（实测发现）**：干净环境下 CLI 报「无法定位 CLI ZCode Built-in Provider Config」，因为内置 provider 配置路径 `~/.zcode/v2/runtime/provider/.../zcode-builtin.json` 正常由桌面宿主经 `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` 注入。CI 里必须自带该文件（约 8 KB JSON，仓库里可从上游 `packages/shared` 对应产物或本机拷贝）并设同名环境变量。实测：不设=启动即错；设了+无凭据=「ZCode Built-in missing / Model creation failed」（认证缺失，非崩溃）。

### 5.2 认证（CI 场景）

三条路径，按 CI 友好度排序：

1. **Coding Plan API Key（官方一等机制，推荐）**：
   - 内置 provider 模板明示 access type `zhipu-coding-plan-api-key`，Z.ai 侧管理页 `https://z.ai/manage-apikey/apikey-list`、endpoint `https://api.z.ai/api/anthropic`（anthropic-messages 协议）；BigModel 侧 `https://bigmodel.cn/coding-plan/personal/overview`、`https://open.bigmodel.cn/api/anthropic`（本机 `zcode-builtin.json` 一手读取）。官方文档同方向：zcode.z.ai/cn/docs/configuration 写明「切换到 API Key 模式后……用 Coding Plan API Key 连接」。
   - 本机 `~/.zcode/v2/credentials.json` 也确有 `account-provider:coding-plan:account:bigmodel-individual-coding-plan:...:api-key` 条目（结构实测，值未读取）。
   - CI 用法：key 进 GitHub Secret → 生成 `provider_config.json`（结构见本机 `~/.zcode/v2/provider_config.json`，access.type 换 coding-plan key 类型）→ `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE` 指向它。**机制已实测走通**（用等价的 API-key 型 provider 配置端到端完成了一次无头请求，见 5.4）；coding-plan key 本身未在 CI 实测（红线：不实施）。
2. **标准 API Key（按 token 计费）**：同机制，`access.type: api-key`，BigModel standard API（open.bigmodel.cn/api/paas/v4）。不占 Coding Plan 订阅额度，按量付费——若许可顾虑成立，这是合规退路（官方 FAQ 本就要求非指定工具场景用标准 API）。
3. **OAuth 登录凭据搬运（不推荐）**：`zcode login --no-browser` 打印 URL 人工批准后凭据落 `credentials.json`（可 `ZCODE_DATA_BASE_DIR` 重定向，上游 `docs/analysis/credentials-json-code-audit.md` 证实路径规则）。致命点：上游 `docs/oauth/jwt-expiry-reauthentication.md` 明确「**Z.AI / BigModel 当前没有可用于续期 zcodejwttoken 的客户端 refresh 实现**」——过期只能人工重登，CI 里会定期烂掉。另有值级加密，跨机器搬运是否可解密未验证。

### 5.3 许可与成本（公开信息，查不到的如实标注）

- **使用范围**：官方 FAQ（docs.bigmodel.cn/cn/coding-plan/faq）原文：「GLM Coding Plan 仅限在官方支持的指定工具与产品环境中使用」「在除规定工具外调用 API，不可享用 Coding 套餐的额度」「如需在自建应用、网站、机器人、SaaS 产品等场景中通过 API 集成模型能力，请使用智谱提供的标准 API 服务」。
- **ZCode 是指定工具**：coding-plan overview 页兼容工具列表含 ZCode、AutoClaw、Claude Code、Codex、OpenCode 等（docs.bigmodel.cn/cn/coding-plan/overview）。
- **灰色地带**：在 Actions runner 上跑**官方 ZCode CLI 本体**，工具是官方的、环境是自动化流水线——条款没有明说允许也没有明说禁止无头/CI 执行。**无公开信息**裁决此事；保守做法是咨询官方或改用标准 API key。
- **设备/并发**：FAQ 未列设备数上限；「套餐为订阅人专享使用」，禁止账号共享（多人共用才算违规，单人多端未限制——**无明确公开上限**）。并发按档位：Max > Pro > Lite，低峰动态上调，账户级限流错误码 1302（docs.bigmodel.cn/cn/api/rate-limit；具体并发数字未公开）。
- **额度（=CI 的实际成本）**：Lite 2,000 积分/5h + 10,000/周；Pro 12,000/5h + 60,000/周；Max 28,000/5h + 140,000/周（docs.bigmodel.cn/cn/coding-plan/overview）。CI 与桌面共用同一账号额度，无加价但抢同一池子。

### 5.4 结论：条件可行

依据：无头执行 ✅ 实测；API-key 认证机制 ✅ 实测（用个人 deepseek key 型 provider 端到端跑通 `-p` 并拿到正确回复、退出码 0；含 coding-plan key 型 provider 的骨架在干净环境下正确走到「等待有效凭据」一步）；CLI 分发 ❌ 无官方公开渠道（需自带 bundle 或源码构建）；许可 ⚠️ 无头 CI 未被条款明确覆盖。

**最小 POC 步骤清单（不实施，仅供拍板后执行）**：

1. 从本机 pin 一份 `zcode.cjs` + `zcode-builtin.json` 到私有仓库或 release 资产（或fork 上游加「构建 CLI bundle」workflow）。
2.ubuntu runner 装 Node 24，`node zcode.cjs doctor` 验证 Linux 可跑（node-bundle 应平台无关，**需实测**）。
3. GitHub Secret 存 Coding Plan API Key；workflow 内生成 `provider_config.json`（coding-plan key 型）+ 设 `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE`、`ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`。
4. `node zcode.cjs -p "…" --cwd <checkout> --mode <档>` 跑一个只读任务（如 `gh issue list` 后回帖），验证端到端与额度扣减。
5. 观察积分消耗，估算单次 run 成本，再决定是否接 benny/按钮页链路。

---

## 6. 决策问题清单（需用户拍板）

1. **按钮页要不要「远程触发」能力？**（人在本机/tailnet 之外点按钮）——要 → 方案一或方案二+Funnel；不要 → 方案二路径 A 足矣。
2. **若选方案一：队列介质**——D1（推荐，写额度大、可做状态机）/ KV（最简，写上限 1000/日）/ gh issue（零第三方状态、贴仓库约定）？
3. **若选方案一：消化端**——CronCreate 自动化（零常驻、分钟级延迟）还是本机常驻轮询器（秒级、多一个常驻进程）？
4. **方案二是否要顺带上 Tailscale Funnel**（公网直达本机、免建 Worker、但暴露本机进程且仅 ts.net 域名）？
5. **Actions 跑 CLI 是否立项做 POC？**——接受「自带 zcode.cjs + coding plan key + 许可灰色」三个前提吗？还是先向智谱确认无头 CI 的许可口径？
6. **额度共享可接受吗？**——CI run 与日常桌面会话抢同一份 5 小时/周积分（Lite 2000/5h），是否需要在 workflow 里加预算闸（如限定低峰/限量 run）？
7. **CLI 版本策略**（若走 Actions）：pin 本机拷贝（升级靠手动同步）还是源码构建（每 run 慢 10 分钟级）？

---

## 附录：来源索引

### 本地一手（实测/文件）

- `C:\Users\Administrator\Git\pstack-zcode\skills\make-bot-ui\SKILL.md`（上游技能全文，仓库唯一副本）
- `C:\Program Files\ZCode\resources\glm\zcode.cjs`（v0.16.9 node-bundle）——`--help`、`doctor`、`-p` 无头执行、干净环境 provider config 报错，均本轮实测
- `C:\Users\Administrator\.zcode\v2\credentials.json`（结构：oauth:bigmodel、zcodejwttoken、coding-plan api-key 条目；仅看结构未读值）
- `C:\Users\Administrator\.zcode\v2\provider_config.json`（个人 provider 配置结构：API-key 型 provider 实测可驱动无头 CLI）
- `C:\Users\Administrator\.zcode\v2\runtime\provider\...\zcode-builtin.json`（内置 provider 模板：zai-api/bigmodel-api 的 coding-plan key 型 access 与管理 URL、各厂 API-key 模板）
- 第一轮报告 `docs/research/benny-automations-feasibility.md`（CronCreate 语义、hooks 7 事件、20 条上限、app-server 协议——本轮引用未重验）
- `docs/adr/0007-benny-on-native-automations.md`（搁置决策背景）

### 上游仓库（github.com/zai-org/ZCode，gh API 取原文）

- `README.en.md`（CLI 分发形态、`--web`、Node 24.14.0/pnpm 10.33.2 构建）
- `docs/cli-ci-packaging.md`（六平台 SEA 内部构建与内网分发）
- `docs/analysis/credentials-json-code-audit.md`（credentials.json 路径规则、`ZCODE_DATA_BASE_DIR`、值级加密）
- `docs/oauth/jwt-expiry-reauthentication.md`（**无客户端 refresh 实现**，过期必须重登）
- `docs/oauth/jwt-401-auto-logout.md`（401 自动登出机制）
- Releases API（仅桌面 dmg/exe，无 CLI 资产）
- npm registry（`@zcode/cli` 404；`zcode` 为占位包）

### 官方文档与网络

- [developers.cloudflare.com/workers/platform/limits](https://developers.cloudflare.com/workers/platform/limits/)（10 万请求/日、10 ms CPU、5 cron/账户）
- [developers.cloudflare.com/workers/platform/pricing](https://developers.cloudflare.com/workers/platform/pricing)（免费档 $0、付费 $5/月起）
- [developers.cloudflare.com/kv/platform/pricing](https://developers.cloudflare.com/kv/platform/pricing/)（KV 免费：读 10 万/日、写 1000/日）
- [developers.cloudflare.com/d1/platform/pricing](https://developers.cloudflare.com/d1/platform/pricing/)（D1 免费：读 500 万行/日、写 10 万行/日）
- [tailscale.com/docs/tailscale-funnel](https://tailscale.com/docs/tailscale-funnel)（Funnel 公网 HTTPS：443/8443/10000、ts.net 域名、ACL funnel 属性）
- [docs.bigmodel.cn/cn/coding-plan/faq](https://docs.bigmodel.cn/cn/coding-plan/faq)（「仅限官方支持的指定工具与产品环境」、自建应用除外、订阅人专享、5 小时+每周机制）
- [docs.bigmodel.cn/cn/coding-plan/overview](https://docs.bigmodel.cn/cn/coding-plan/overview)（额度积分：Lite/Pro/Max；兼容工具含 ZCode）
- [docs.bigmodel.cn/cn/api/rate-limit](https://docs.bigmodel.cn/cn/api/rate-limit)（并发按档位、动态调整、1302/1305）
- [zcode.z.ai/cn/docs/configuration](https://zcode.z.ai/cn/docs/configuration)（API Key 模式 + Coding Plan API Key 连接）

### 未查到公开信息（如实标注）

- 无头/CI 环境运行官方 CLI 是否属于「指定工具与产品环境」的官方口径
- Coding Plan 各档位的具体并发数字
- 单设备/多设备数量上限的明文条款
- zcode CLI 的公开二进制/npm/Docker 分发渠道（确认不存在公开渠道，非遗漏）
- credentials.json 值级加密的跨机器可解密性
