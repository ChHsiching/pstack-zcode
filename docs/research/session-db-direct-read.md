# ZCode 会话库 sqlite 只读直读：机制可行性调研

> 调研日期：2026-10-16。环境：Windows 10 / Git Bash / Python 3.11（内置 sqlite3 模块）。
> 目的：为 recall / reflect / automate-me / show-me-your-work / worktree-audit 等技能补上「列出 / 检索历史会话」能力提供第一手依据。
> 所有本机查询均为只读（`mode=ro`），零写入。写库的是正在运行的 ZCode 宿主本身（本调研会话即写入方之一）。

## 0. 结论速览

**可行，且成本低。** 前提是严格只读（`sqlite3.connect('file:...?mode=ro', uri=True)`）并做 fail-closed 探测。

| 问题 | 结论 |
|---|---|
| db 位置与形态 | `~/.zcode/cli/db/db.sqlite`（本机 3.9 GB），WAL 模式（-wal 13 MB / -shm 32 KB 常驻） |
| session/message/part 表 | 存在，结构清晰（DDL 见 §2）；数据量：session 3,979+ / message 226,470+ / part 824,085+ |
| 按时间列会话 | 可行，0.3 s 内（有 title、task_type、directory） |
| 按工作目录反查会话 | 可行：`session.directory` 存 Windows 绝对路径，反查 0.1 s |
| 跨会话文本检索 | 可行但无 FTS：全库 `LIKE` 全扫约 25 s；「先按索引缩会话再搜 part」优化后 0.9 s |
| 每会话/每目录最后活动时间 | 可行，0.02–0.08 s（worktree-audit LAST_CHAT 可落地） |
| session id ↔ ReadSessionContext | **同一形态，零映射**：库里 id 就是 `sess_*`（如 `sess_4b7ea87e-…`、`sess_subagent_agent_…`），与工具 pattern `^(?:current|sess_[A-Za-z0-9._-]+)$` 直接匹配（OSS 源码同款正则，见 §5） |
| 写入方持库时只读并发 | 安全（WAL 读写不互斥）；实测整个调研期间宿主持续写入，读从未失败 |
| schema 稳定性 | 由迁移链管理（0001–0022，drizzle 风格），核心表自 0001 起未破坏性变更；OSS 仓库源码与本地 0.16.9 安装版逐条一致（见 §5） |

## 1. 存在性与文件布局（本机实测）

路径：`C:\Users\Administrator\.zcode\cli\db\`

| 文件 | 大小 | 观察时 mtime |
|---|---|---|
| db.sqlite | 3,908,104,192 → 3,917,262,848 B（调研期间被写入方增长） | 2026-10-16 18:48 / 19:02 |
| db.sqlite-wal | 12,990,392 B（调研全程不变，mtime 随写入方跳动） | 持续更新 |
| db.sqlite-shm | 32,768 B（mtime 全程停在 10-16 00:20，未被我们触碰） | 2026-10-16 00:20 |

- `PRAGMA journal_mode`（mode=ro 连接内查询，本身只读）→ `wal`。
- `page_size=4096`，`page_count≈954,254`（约 3.9 GB 与文件大小吻合）。
- -wal/-shm 常驻说明总有 ZCode 进程持有连接；干净退出后写入方会 checkpoint 并移除 wal/shm（合成实验证实，见 §4）。

## 2. 完整 schema（本机 `sqlite_master` 实测）

### 2.1 表清单（22 张表 + 2 触发器，无 FTS 虚表）

`session`、`message`、`part`、`session_entry`、`session_input`、`session_target`、`session_task_link`、`input_history`、`todo`、`tool_usage`、`model_usage`、`turn_usage`、`permission`、`local_setting`、`schema_migration`、`workflow_run`、`workflow_definition`、`workflow_event`、`workflow_activity`、`dwf_run`、`dwf_node`、`dwf_actor`、`dwf_event`、`sqlite_sequence`。

### 2.2 核心表 DDL（逐列）

```sql
CREATE TABLE session (
  id text primary key,                  -- 'sess_<uuid>' / 'sess_subagent_agent_<uuid>' 等
  project_id text not null,             -- 'proj_c-users-administrator-git-pstack-zcode'（路径 slug 化）
  workspace_id text,                    -- 本机 3,981 行全为 NULL
  parent_id text,                       -- 子 agent 会话指向父会话（非空 3,292 行）
  slug text not null,                   -- 与 id 同值
  directory text not null,              -- 工作目录，如 'C:\Users\Administrator\Git\pstack-zcode'（Windows 反斜杠）
  path text,                            -- 另一路径字段（少量非空，如 'C:\Users\Administrator\ZCodeProject'）
  title text not null,                  -- 会话标题（first_input/generated/custom）
  version text not null,                -- 创建该会话的 ZCode 版本，如 '0.16.9'
  share_url text, summary_additions integer, summary_deletions integer,
  summary_files integer, summary_diffs text, revert text, permission text,
  time_created integer not null,        -- epoch 毫秒
  time_updated integer not null,        -- epoch 毫秒
  time_compacting integer, time_archived integer,
  task_type text not null default 'interactive',        -- interactive/subagent_child/workflow_child/fork/selection_side_chat
  title_source text not null default 'first_input'     -- check(default|first_input|generated|custom)
    check(title_source in ('default','first_input','generated','custom')),
  title_message_id text, time_title_updated integer, trace_id text
);

CREATE TABLE message (
  id text primary key,                  -- 'msg_<nanoid>_<uuid>'
  session_id text not null references session(id) on delete cascade,
  time_created integer not null,        -- epoch 毫秒
  time_updated integer not null,
  data text not null,                   -- JSON：role/time/modelSelection/path.cwd/mode 等
  sequence integer                      -- 消息序号（trigger 自增）
);

CREATE TABLE part (
  id text primary key,                  -- 'part_<nanoid>_<uuid>'
  message_id text not null references message(id) on delete cascade,
  session_id text not null,
  time_created integer not null, time_updated integer not null,
  data text not null,                   -- JSON：{"type":"text|tool|reasoning|step-start|step-finish|file","text":...}
  sequence integer                      -- 消息内 part 序号（trigger 自增）
);
```

辅助表（对检索有用）：

```sql
CREATE TABLE input_history (   -- 用户输入历史；本机仅 100 行（疑似滚动保留）
  id text primary key, project_id text not null, session_id text,
  text text not null, kind text not null, time_created integer not null, attachments text
);
CREATE TABLE schema_migration ( id text primary key, checksum text not null,
  app_version text, time_applied integer not null );  -- 迁移台账
```

可用索引（与检索路径直接相关）：
`session(project_id)`、`session(task_type)`、`session(parent_id)`、`session(trace_id)`；`message(session_id, sequence, time_created, id)`；`part(session_id)`、`part(message_id, sequence)`；`input_history(project_id, time_created desc)`。
**注意：`session.directory` 无索引、`part.data` 无 FTS/索引**——但 session 表仅 4 千行，全扫无感；part 检索见 §3c 优化。

两个 trigger（`message_sequence_autofill` / `part_sequence_autofill`）只服务写入方，只读连接不受影响。

### 2.3 data 列 JSON 结构（样本）

- `message.data`：`{"role":"user"|"assistant","time":{"created":…,"completed":…},"agent":"zcode-agent","modelSelection":{…},"path":{"cwd":"…"},…}`
- `part.data`：text 型 `{"type":"text","text":"实际内容…"}`；tool 型含 tool 调用 JSON。抽样 2,000 行类型分布：tool 485 / step-start 478 / step-finish 466 / text 444 / reasoning 124 / file 3。
- 跨会话检索应以 `part.data LIKE` + `json_extract(p.data,'$.type')='text'` 取正文。

### 2.4 字段值分布（决定过滤策略）

- `task_type`：subagent_child 3,149 / interactive 692 / workflow_child 98 / selection_side_chat 36 / fork 8 → **recall 类技能默认 `task_type='interactive'`**，否则结果会被子 agent 淹没。
- `title_source`：first_input 3,346 / generated 469 / custom 168。
- `directory` 全库 156 个不同值；注意出现 8.3 短路径形态（`C:\Users\ADMINI~1\…`），按目录反查前需归一化（lowercase + realpath）。

## 3. 关键查询可行性（每条附实测）

### 3a. 按时间倒序列出会话 —— 0.32 s

```sql
SELECT id, title, task_type, directory,
       datetime(time_created/1000,'unixepoch','localtime'),
       datetime(time_updated/1000,'unixepoch','localtime')
FROM session ORDER BY time_updated DESC LIMIT 12;
```
样本输出（脱敏保留结构）：
```
('sess_subagent_agent_b51c88d9-…', 'Implement GitHub ticket #291 in repo ChH', 'subagent_child', 'C:\\Users\\Administrator\\Git\\LectureVox-GUI', '2026-10-16 18:49:51', '2026-10-16 18:50:17')
('sess_4b7ea87e-558a-463f-8355-02478ce91527', '第二轮适配', 'interactive', 'C:\\Users\\Administrator\\Git\\pstack-zcode', '2026-10-16 18:44:48', '2026-10-16 18:50:11')
('sess_3b0cb45c-1bf8-4f17-9ea7-76ecb7811920', '第一轮实现-c', 'interactive', 'C:\\Users\\Administrator\\Git\\fontalloy', '2026-10-15 10:29:07', '2026-10-16 18:50:04')
```

### 3b. 按工作目录/worktree 反查会话 —— 0.10 s

```sql
SELECT id, title, datetime(time_updated/1000,'unixepoch','localtime')
FROM session WHERE directory = ? ORDER BY time_updated DESC;   -- 参数: r'C:\Users\Administrator\Git\pstack-zcode'
```
样本：39 行（含子 agent），首行即当前活跃会话。`project_id`（`proj_c-users-administrator-git-pstack-zcode`）是现成的路径 slug，可做大小写无关匹配；`directory` 需注意 8.3 短路径形态（§2.4）。

### 3c. 跨会话文本检索 —— 可行，两条路径

无 FTS 表（`sqlite_master` 无 VIRTUAL TABLE）。`part.data LIKE` 是全表扫描：

| 查询 | 实测耗时 |
|---|---|
| `SELECT COUNT(*) FROM part WHERE data LIKE '%无命中词%'`（最坏情形全扫 824k 行） | **25.68 s** |
| `LIKE '%worktree-audit%' LIMIT 8`（中途命中即停） | 25.25 s |
| **优化模式**：先用索引列缩小 session 集（时间窗 + task_type），再按 `part.session_id` 命中索引搜 part | **0.87 s** |

优化模式 SQL（推荐技能采用）：
```sql
WITH recent AS (
  SELECT id FROM session
  WHERE time_updated > (strftime('%s','now')-60*60*24*30)*1000  -- 30 天窗
    AND task_type = 'interactive'
)
SELECT p.session_id, substr(json_extract(p.data,'$.text'),1,50)
FROM part p JOIN recent r ON r.id = p.session_id
WHERE p.data LIKE '%关键词%' AND json_extract(p.data,'$.type')='text'
LIMIT 8;
```
实测样本（搜 "worktree"）：
```
('sess_e05bee2c-…', '两个主角读完，关键发现：retro 的 SKILL.md 已是完整实现…')
('sess_9f384196-…', 'PR 需要至少一个 commit。先放一个初始化 commit(顺便把 worktree 目录加入…')
```
`input_history` 也可搜（有 text 列、按 (project_id,time) 建索引），但本机仅 100 行、覆盖有限，只当补充。

### 3d. 每会话/每 worktree 最后消息时间（worktree-audit LAST_CHAT）—— 0.02–0.08 s

```sql
-- 每 worktree 目录的最后会话时间（interactive）
SELECT directory, COUNT(*), datetime(MAX(time_updated)/1000,'unixepoch','localtime')
FROM session WHERE task_type='interactive'
GROUP BY directory ORDER BY MAX(time_updated) DESC;

-- 某目录下最后一条 message 的时间
SELECT datetime(MAX(m.time_created)/1000,'unixepoch','localtime')
FROM message m JOIN session s ON s.id = m.session_id WHERE s.directory = ?;
```
样本：
```
('C:\\Users\\Administrator\\Git\\fontalloy', 8,  '2026-10-16 18:52:53')
('C:\\Users\\Administrator\\Git\\pstack-zcode', 3, '2026-10-16 18:52:49')
('C:\\Users\\Administrator\\Git\\video-subtitle', 178, '2026-10-16 18:41:18')
```
两级口径都可用：粗粒度用 `MAX(session.time_updated)`（0.08 s），细粒度用 `MAX(message.time_created)`（0.02 s，message 有 (session_id,time_created) 索引）。

### 3e. session id 与 ReadSessionContext 的映射 —— 零映射

- 库内 3,981 个 id 全部以 `sess_` 开头（prefix 分布实测：`('sess_', 3981)`）。
- 两种形态：主会话 `sess_<uuid>`、子 agent `sess_subagent_agent_<uuid>`，均匹配 ReadSessionContext 的 `^(?:current|sess_[A-Za-z0-9._-]+)$`（下划线与连字符在字符类内，合法）。
- OSS 源码证实：契约里的 `SESSION_ID_PATTERN` 与 id 铸造前缀 `sess_` / `subagent_agent_` 同源（§5），**db 直读得到的 id 可原样喂给 ReadSessionContext**，这是直读方案与现有查询工具的天然衔接点。

## 4. 只读安全性（本机实测 + 合成实验）

**方法**：一律 `sqlite3.connect('file:C:/Users/Administrator/.zcode/cli/db/db.sqlite?mode=ro', uri=True)`；全程零 DML/DDL，连接字符串强制 ro，物理上不可能写。

**实测 1：写入方持库时的并发读。** 调研期间宿主 ZCode 持续写库（session 数 3,979→3,983，db.sqlite 3.908→3.917 GB，均为写入方行为）。我们所有只读查询（含 25 s 全扫）无一失败、无一阻塞。WAL 模式读写不互斥，这是结构安全的。

**实测 2：只读连接对 -wal/-shm 的影响。** 三次采点：-wal 大小恒为 12,990,392 B（mtime 跳动来自写入方）；-shm 大小/mtime 全程未变（32,768 B @ 00:20:24）。只读连接**不会触发 checkpoint、不会改写 wal**；最多按需打开既有 -shm（read-only WAL 访问需 wal-index）。注意细节：`mode=ro` 只约束 db 文件本身——若 -shm **缺失**而 -wal 存在（写入方崩溃残留），只读连接会**重建 -shm**（对目录写，不动库内容），见合成实验 case B。

**实测 3（合成库，TEMP 下，非真库）：三种 -wal/-shm 状态 × 两种打开方式**

| 场景 | `mode=ro` | `mode=ro&immutable=1` |
|---|---|---|
| A. 写入方干净退出（wal/shm 已被 checkpoint 移除） | 成功，正常读 | 成功 |
| 写入方在线（wal+shm 在）——即真库常态 | 成功（真库全程验证） | 能打开，但**有丢最新数据风险** |
| B. wal 在、shm 缺（模拟崩溃残留） | 成功，自动做只读恢复并重建 shm，读到 wal 内已提交数据 | **`no such table: x`——直接漏掉 wal 里全部未 checkpoint 数据** |

结论与注意点：
1. **首选 `mode=ro`，不要 `immutable=1`**。immutable 跳过 wal-index，库正被写入或异常退出时会读到过期快照（合成实验 B 是实锤）。它只在「确定无写入方且要绕开 shm 创建权限问题」时才值得。
2. `mode=ro` 有一个小副作用窗口：shm 缺失时会重建 shm（不算写库，但严格意义动了目录里的文件；真库常态下 shm 常驻，不会发生）。
3. 建议连接后设 `PRAGMA busy_timeout=5000`（实测 ro 连接上可设，纯连接级参数）。WAL 下读几乎不会撞锁，唯一例外是写入方 checkpoint 的 exclusive 阶段瞬时会 BUSY，busy_timeout 即可吸收。
4. 大查询（part 全扫）对写入方无干扰，但自耗时 25 s 量级——技能侧应默认走 §3c 优化模式，且查询要带 LIMIT。

## 5. schema 稳定性（源码证据）

ZCode 已开源（Apache-2.0）：**[zai-org/ZCode](https://github.com/zai-org/ZCode)**，Agent CLI 与运行时源码在 `apps/zcode-cli/`。

- schema 定义处：[apps/zcode-cli/packages/adapters/src/storage/session-store/](https://github.com/zai-org/ZCode/tree/main/apps/zcode-cli/packages/adapters/src/storage/session-store)
  - [migrations.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/storage/session-store/migrations.ts)（迁移 0001–0022 全量）
  - [paths.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/storage/session-store/paths.ts)：`getDefaultSessionDbPath() = join(homedir(), ".zcode", "cli", "db", "db.sqlite")` —— 与本机路径逐字一致
  - [sqlite-session-store.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/storage/session-store/sqlite-session-store.ts) 与 [migration-runner.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/storage/session-store/migration-runner.ts)：写入方开库即设 `pragma busy_timeout`、强制 WAL（带 10–200 ms 退避重试）、`foreign_keys=on`
- ReadSessionContext 契约：[apps/zcode-cli/packages/contracts/src/tools/read-session-context.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/contracts/src/tools/read-session-context.ts)，`SESSION_ID_PATTERN = /^(?:current|sess_[A-Za-z0-9._-]+)$/`，与本机工具描述一字不差；id 前缀定义在 [runner-attribution.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/model/runner-attribution.ts)（`sess_` / `subagent_agent_`）。

**三方一致性核对（迁移 id 逐条比对）**：
1. 本机 db 的 `schema_migration` 表：22 条，0001_base_session_store(0.2.0, 2026-06-27) → 0022_backfilled_session_reasoning(0.16.5, 2026-09-17)；
2. 本机安装版 `C:\Program Files\ZCode\resources\glm\zcode.cjs`（0.16.9 bundle，内含 `sessionDbPath:"~/.zcode/cli/db/db.sqlite"`）：同一套 22 条；
3. OSS main 分支 migrations.ts：同一套 22 条。

**稳定性评估**：核心三表（session/message/part）自 0001（0.2.0）起 schema 只增不破（0009 加 title 元数据、0014/0015 加 sequence、0016–0018 加 session_input、0019 加 dwf_*，全部为加列/加表）。迁移链 + checksum 台账意味着变更是受控演进而非随意改动。风险点：OSS 仓库按版本批次同步（2026-09-20 开源、09-24 v3.14.3、10-10 v3.15.1），落后于桌面端小步快跑（本机 0.16.9）；未来加列不破坏只读 SELECT，但若发生破坏性迁移（概率低，迄今零例）需靠 fail-closed 兜底。

## 6. fail-closed 探测点建议（版本兼容策略）

技能侧每次使用前先跑一组只读探测，任何一步失败即回退现状（提示用户改用 ReadSessionContext 手动指定 id），绝不猜测：

1. **文件存在**：`os.path.exists(~/.zcode/cli/db/db.sqlite)`。
2. **能以 ro 打开**：`mode=ro` 连接失败（如权限/shm 问题）→ 直接回退；不尝试 immutable 兜底（有一致性风险，见 §4）。
3. **最低表集**：`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('session','message','part')` 必须命中 3 张。
4. **最低列集**（用 `PRAGMA table_info`，全部存在才继续）：
   - `session`: `id, directory, title, task_type, time_created, time_updated`
   - `message`: `session_id, time_created, data`
   - `part`: `session_id, message_id, data`
5. **语义哨兵**：`SELECT COUNT(*) FROM session WHERE id LIKE 'sess_%' LIMIT 1` 返回 >0（确认 id 仍是 sess_* 形态，保住 ReadSessionContext 衔接）。
6. 可选增强（缺了只降级不致命）：`session.version`（版本口径）、`schema_migration`（台账对齐用）。
7. 所有查询必须：显式 LIMIT、优先走 §3c 索引前缀模式、`json_extract` 解析失败按行跳过（data 列 JSON 结构属写入方私有契约，type 字段缺失不能崩）。

## 7. 对三类用法的落地建议

### recall（跨会话回忆）
- 列表：§3a SQL，默认 `task_type='interactive'`，可加 `directory=?`（当前 worktree）或时间窗过滤；`title` 即现成摘要。
- 检索：§3c 优化模式（时间窗 + interactive 预过滤 + `part.data LIKE` + `json_extract type='text'`），0.9 s 量级；命中后把 `session_id` 原样传给 ReadSessionContext 拉详情——直读只做「发现」，深度上下文仍走官方工具，两者分工干净。
- 排序建议：按 `session.time_updated DESC`；子 agent 会话（`sess_subagent_agent_*` 或 `task_type<>'interactive'`）默认排除、可开关。

### reflect / show-me-your-work（工作复盘）
- `session.title` + `title_source` + `version` + `time_created/time_updated` 给出会话画像；`parent_id`/`session_task_link` 能还原「主会话 → 子 agent」派生树。
- 内容层走 `part.data`（text/reasoning/tool 类型分布即工作痕迹）；`todo` 表有每会话任务清单（session_id + content + status + position）。
- 检索同 §3c；不要对 `message.data`/`part.data` 做无索引全扫超过一次，结果缓存到调用方内存即可。

### worktree-audit（LAST_CHAT 列）
- 直接用 §3d 第一条 SQL（每 directory 的 `MAX(time_updated)`，0.08 s）；需要精确到消息级再用第二条（0.02 s）。
- 目录匹配前先归一化：小写、`ADMINI~1` 展开、去尾部斜杠——库内已观察到 8.3 短路径目录条目，直接 `=` 匹配会漏。
- 与现有 worktree 目录列表 join 后，无会话的 worktree 显示 N/A，有会话的显示本地时间。

---

### 附：本次实测环境快照

- Python 3.11（`C:\Users\Administrator\AppData\Local\Programs\Python\Python311\python`），sqlite3 标准库；无 sqlite3 CLI（PATH 缺失，不影响，python 可全覆盖）。
- 本机 ZCode：桌面版 0.16.9（session.version 口径），bundle `zcode.cjs` 构建于 2026-10-13。
- 查询总数约 40 条，全部 `mode=ro`；调研结束后 -wal 大小未变、-shm 未被触碰。

### 附：来源索引

- 本机实测：§1–§4、§6（Windows + Python 3.11 只读查询，2026-10-16）。
- 源码：[zai-org/ZCode](https://github.com/zai-org/ZCode) — [session-store 目录](https://github.com/zai-org/ZCode/tree/main/apps/zcode-cli/packages/adapters/src/storage/session-store)、[migrations.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/storage/session-store/migrations.ts)、[paths.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/storage/session-store/paths.ts)、[sqlite-session-store.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/storage/session-store/sqlite-session-store.ts)、[migration-runner.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/storage/session-store/migration-runner.ts)、[read-session-context.ts 契约](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/contracts/src/tools/read-session-context.ts)、[runner-attribution.ts](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/model/runner-attribution.ts)。
- 开源公告佐证：[r/LocalLLaMA: ZCode is now open source](https://www.reddit.com/r/LocalLLaMA/comments/1wlzvcx/zcode_is_now_open_source)。
