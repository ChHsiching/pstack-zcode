# 用 `npx skills add` 分发 pstack-zcode：机制调研与落地结论

- 调研日期：2026-10-15
- 调研方式：读 vercel-labs/skills 源码（main @ `13e4063`，2026-10-09）+ README + 本机实测（CLI v1.7.2）
- 本机实测命令均为只读（`--list` / 检查文件），未修改本仓库文件、未做 git 写操作
- 来源标注约定：`[源码 src/xxx.ts]` = vercel-labs/skills 源码；`[README]` = vercel-labs/skills README；`[本机]` = 本机一手证据；`[实测]` = 本次新跑的验证

## TL;DR（最终推荐）

1. **用户安装命令（一行）**：`npx skills add ChHsiching/pstack-zcode -g -a zcode -y`（交互式则去掉 `-y`，会多出「选技能 / 选 agent / 项目级还是全局 / symlink 还是 copy」四个提问）。
2. **仓库唯一必须的配合**：把仓库根的 `.claude-plugin/marketplace.json` 改成只声明 pstack 一个插件（`"source": "./pstack"`）。实测不这样做的话，从 GitHub 克隆完整树后 CLI 只能发现 2 个无关技能（origin-apps 的），**pstack 的 54 个技能全部不可见**（原因见问题 1/8）。
3. **技能改名 pstack- 前缀：只改 SKILL.md frontmatter 的 `name` 字段，不改目录名**。安装目录名取自 frontmatter `name`（`[源码 src/installer.ts]` `sanitizeName(skill.installName)`），目录名保持 `tdd/`、`teach/` 与上游一致，upstream merge 零结构冲突。
4. **两个子代理文件**（`pstack/agents/comment-sicko.md`、`poteto-agent.md`）：skills CLI 完全不安装这类文件，需文档引导用户手动放到 `~/.zcode/agents/`（本机该目录已存在且放有 `deepseek-flash.md`、`vision.md` 等子代理文件，是 ZCode 的既成约定）。
5. 零改动的兜底命令（今天就能用）：`npx skills add ChHsiching/pstack-zcode/pstack`（子路径语法，实测发现 54 个技能）。

---

## 问题 1：仓库结构要求与技能发现规则

### 发现算法（`[源码 src/skills.ts]` `discoverSkills()`）

对克隆下来的仓库根，按顺序执行：

1. **仓库根本身有 `SKILL.md`** → 单技能仓库，直接返回（除非 `--full-depth`）。
2. **优先目录扫描**，依次扫这些「已知容器」（`[源码 src/skills.ts]` `prioritySearchDirs`）：
   - `skills/`、`skills/.curated/`、`skills/.experimental/`、`skills/.system/`
   - 约 34 个 agent 项目级技能目录：`.agents/skills`、`.claude/skills`、`.codex/skills`、…、**`.zcode/skills`**（`[源码 src/skills.ts]` `AGENT_PROJECT_SKILL_DIRS`）
   - `.claude-plugin/marketplace.json` 与 `.claude-plugin/plugin.json` 清单声明的插件技能目录（`[源码 src/plugin-manifest.ts]`）
   - 容器内最多下探 **3 层**（`DEFAULT_SKILL_CONTAINER_DEPTH = 3`，`[源码 src/constants.ts]`），即 `skills/<分类>/<子分类>/<skill>/SKILL.md` 可见；仓库根本身只下探 1 层（避免捞到 `examples/foo/SKILL.md`）
3. **关键规则：只要第 2 步找到了 ≥1 个技能，就不再做全库扫描。** 只有优先目录一无所获（或显式 `--full-depth`）时，才回退为**全仓库递归搜 SKILL.md，最大深度 5**（`[源码 src/skills.ts]` `findSkillDirs`，跳过 `node_modules/.git/dist/build/__pycache__`）。

### 回答：技能必须在根 skills/ 吗？支持子目录吗？

- **不必须在根 `skills/`**。任意嵌套路径（如 `pstack/skills/<name>/`）可以经由第 3 步回退扫描被发现，**前提是第 2 步优先目录里一个技能都没找到**。
- **支持子目录路径参数**。source 语法（`[源码 src/source-parser.ts]`，`[README]` Source Formats）：
  - `owner/repo` — 整仓库
  - `owner/repo/path/to/dir` — **子路径**（subpath），发现范围限定在该子树（实测 `ChHsiching/pstack-zcode/pstack` → 54 个技能）
  - `owner/repo@skill-name` — 按技能名过滤
  - `owner/repo#ref@skill` — 指定 ref（分支/tag/commit）+ 技能过滤
  - 完整 URL 形式 `https://github.com/owner/repo/tree/<branch>/<path>` 同样支持子路径
- **本仓库的坑（实测确认）**：`npx skills add ChHsiching/pstack-zcode`（不带子路径）只发现 **2 个技能**。原因：我们的提交树带上了上游 cursor/plugins 的全部内容（稀疏检出只影响工作区，`git ls-tree HEAD` 显示 advisor、ralph-loop、origin-apps 等 20+ 个插件目录都在 GitHub 上的仓库里），根目录的 `.claude-plugin/marketplace.json`（上游文件，声明了 `origin-apps`）让优先扫描先命中 origin-apps 的 2 个技能 → 回退扫描不执行 → `pstack/skills/` 不可见。
- **对照实验（[实测]，/tmp 合成树）**：
  - 有 pstack-only 的 `marketplace.json` + 一个杂插件目录（`ralph-loop/skills/some-skill`）→ 只发现 pstack 的技能，杂技能被排除；
  - 无任何清单 → 回退扫描把 `ralph-loop/skills/some-skill` 也捞了进来。
  - 结论：**清单声明 = 精确圈定；无清单 + 深层技能 = 全库兜底、会混入其他插件的技能**。

### 知名仓库布局佐证

- mattpocock/skills（`[本机]` 锁文件 skillPath + gh api 树）：根 `skills/` 下按 `engineering/`、`productivity/`、`misc/`、`in-progress/` 分类（容器内 2 层）；另有 `.claude-plugin/marketplace.json` 声明 `"source": "./"`，技能因此在安装时带 `pluginName: "mattpocock-skills"` 分组。
- anthropics/skills（`[本机]` 锁文件）：根 `skills/<name>/` 平铺。
- cursor/plugins 上游（`[本机]` 锁文件铁证）：`unslop` 技能的记录为 `source: "cursor/plugins", skillPath: "pstack/skills/unslop/SKILL.md"` —— 用户此前从上游装过 pstack 的 unslop，走的正是子路径或回退扫描（上游根有 marketplace.json 声明 origin-apps，无子路径时理论上发现不了 pstack/，故当时应带了 `/pstack` 子路径）。

## 问题 2：安装交互与批量参数

`[源码 src/add.ts]` + `[README]` Options 表：

- **交互流程（默认）**：发现技能 → 技能多选（space 切换、可搜索、支持组选择、全选）→ agent 多选（检测已装 agent，记忆上次选择）→ scope 选择（Project / Global）→ 安装方式（Symlink 推荐 / Copy）→ 确认。
- 单技能仓库自动跳过技能多选。
- 批量参数：
  - `-y, --yes`：跳过全部确认。技能多于 1 个时 **`-y` = 全选所有发现的技能**；检测到多个 agent 时 = 全选所有已检测 agent。
  - `--all`：所有技能装到所有 agent，无任何提问（`[README]`）。
  - `-s, --skill <name>...`：按名精确过滤（可重复；`'*'` = 全部）。
  - `-l, --list`：只列出、不装（本次调研用它做的全部实测）。
  - `--json`：机器可读输出，**需要搭配 `--yes`/`--all`**（实测报错提示）。
- 装单个技能的三种写法：`npx skills add owner/repo -s pstack-tdd`；`npx skills add owner/repo@pstack-tdd`；子路径直指技能目录。

## 问题 3：安装目标与 agent 选择

- **agent 选择**（`[源码 src/add.ts]`）：`-a/--agent` 显式指定（可重复，`'*'` = 全部，值如 `zcode`、`claude-code`）；未指定时检测本机已装 agent（检测到 1 个自动选中；多个则交互多选，`.agents/skills` 这类 universal agent 固定展示为锁定区）。上次选择存进锁文件 `lastSelectedAgents`（`[本机]` 锁文件尾部的数组即此字段）。
- **ZCode 是一等公民 agent**（`[源码 src/agents.ts]` 第 752-760 行）：

  ```
  zcode: {
    displayName: 'ZCode',
    skillsDir: '.zcode/skills',            // 项目级
    globalSkillsDir: ~/.zcode/skills,      // 全局
    detectInstalled: ~/.zcode 目录存在 或 /Applications/ZCode.app 存在
  }
  ```

- **默认 symlink 模式的实际落盘**（`[源码 src/installer.ts]`）：技能完整复制到 canonical 目录 `~/.agents/skills/<installName>/`，再在每个选中 agent 的技能目录建符号链接（zcode → `~/.zcode/skills/<installName>` → canonical）。**本机完全吻合**：`~/.agents/skills/` 是实体目录，`~/.zcode/skills/baocut -> ~/.agents/skills/baocut` 等 25 个 symlink 就是 CLI 装的（symlink 创建失败时自动回退为 copy，Windows 需开发者模式/管理员权限才能建 symlink）。
- ZCode 自身同时扫 `~/.agents/skills` 和 `~/.zcode/skills`（本调研会话的可用技能列表里 baocut 等双路径出现两次为证）。
- **项目级**：默认 scope 为项目级 `./<agent>/skills/`（zcode 即 `./.zcode/skills/`），且技能会同时进 canonical `./.agents/skills/`；对配置目录不存在的非 universal agent 会跳过建链，避免生成一堆无关目录（`[源码 src/installer.ts]` `shouldSkipProjectAgentSymlink`）。`-g/--global` 装到用户目录。

## 问题 4：安装内容边界

`[源码 src/installer.ts]` `copyDirectory()`：

- **整个技能目录递归复制**：`SKILL.md`、`references/`、`playbooks/`、`scripts/`、任何子目录全部带上。
- 唯一排除项：文件 `metadata.json`；目录 `.git`、`__pycache__`、`__pypackages__`。
- **无文件类型、无大小、无数量的限制**（对 git 克隆源而言；只有「直接下载 URL」这条路径才有 10MiB/25MiB/1000 文件限制，`[README]`）。二进制、`.ts` 脚本、`package.json` 原样复制。
- 保留文件权限位（`chmod mode & 0o777`，shell 脚本可执行位保留）；symlink 解引用复制，坏链跳过并告警。
- frontmatter 只强制 `name`（字符串）和 `description`（字符串），缺了直接跳过该技能并告警（`[源码 src/skills.ts]` `parseSkillMd`）；其余字段（如 pstack 现有的 `disable-model-invocation: true`）原样保留，CLI 不解析。`metadata.internal: true` 可隐藏技能（显式点名才可装）。
- 技能目录里可以带 per-agent 元数据文件（如 mattpocock 技能里的 `agents/openai.yaml`，给 Codex 提供 display_name/policy），`[本机]` `~/.agents/skills/tdd/agents/openai.yaml` 为证——CLI 只是原样复制，不做解读。

## 问题 5：子代理（agents/*.md）支持

- **不支持。** skills CLI 的安装单位只有「技能目录」，不会把仓库里的 `agents/*.md` 装到任何 agent 的子代理目录。唯一的子代理相关逻辑是 Eve 专属（`[源码 src/agents.ts]` `EVE_SUBAGENTS_DIR = 'agent/subagents'`，把技能装进 Eve 各子代理自己的 skills 目录），与通用分发无关。
- pstack 的两个子代理文件 `pstack/agents/comment-sicko.md`、`pstack/agents/poteto-agent.md` 位于技能目录之外，**安装 pstack 技能时不会被带上**；`no-comments`、`poteto-help`、`poteto-mode` 三个技能的内容引用了它们（grep 确认）。
- **ZCode 侧的落点**：`~/.zcode/agents/` 目录存在且已有子代理文件（`deepseek-flash.md`、`vision.md`、`claude-code/`、`codex/`，`[本机]`）——这是 ZCode 既成的用户级子代理约定。
- 社区/现实可选做法（按推荐排序）：
  1. **文档 + 单行命令手动放**（推荐）：README 给出 raw.githubusercontent URL + 复制到 `~/.zcode/agents/` 的命令；零仓库结构变动，技能引用处（poteto-mode 等）的相对路径改为提示用户子代理文件位置。
  2. **文件搬进技能目录随装随带**：把两个文件（或副本）放进 `pstack/skills/poteto-mode/agents/` 之类——CLI 会原样复制到用户机器，但 ZCode 不会自动从技能目录加载子代理，仍需手动启用；且向上游结构塞文件增加 merge 冲突面、要维护两份。只适合当「随技能分发的文档副本」。
  3. 仓库附 install 脚本（curl | bash）：能一并装技能+子代理，但引入信任与维护成本，不推荐。

## 问题 6：更新与卸载

`[README]` + `[源码 src/update.ts]` / `src/remove.ts`：

- `npx skills update`（交互选 scope）／`-g` 全局／`-p` 项目／`-y` 免确认／`npx skills update <skill...>` 指定技能。机制：按锁文件里的 `sourceUrl + skillPath` 重新克隆上游，重算目录 hash，**只重装有变化的技能**；上游已删除的技能会提示处理；「老式安装」（锁文件无 skillPath）无法自动更新。
- `npx skills remove` / `rm`（`-g`/`-a`/`-s`/`--all`）：清掉各 agent 目录的链接/副本，canonical 目录在没有其他 agent 引用时一并删除。
- **重新 `add` = 覆盖升级**：安装前检查同名技能并显示 `overwrites:` 警告（`[源码 src/add.ts]`），确认后 `cleanAndCreateDirectory` 清空重装。
- 其他命令：`list`（列已装）、`find [query]`（搜索）、`use <source>`（不安装、生成提示词或拉起 agent）、`init [name]`（新建技能骨架）、`experimental_install`（从项目 `skills-lock.json` 还原，类似 `npm ci`）。

## 问题 7：元数据与清单

- **不需要 `skills.json` 之类清单**。纯目录约定：一个目录一个 `SKILL.md`，frontmatter `name` + `description` 必填。技能在安装列表里的描述就来自 `description`；「分类/分组」来自可选的 `.claude-plugin/marketplace.json` 插件声明（`pluginName` 字段，mattpocock 的 "mattpocock-skills" 分组即此）。
- 锁文件（用户机器侧）：全局 `~/.agents/.skill-lock.json`（v3），每技能记 `source/sourceType/sourceUrl/skillPath/skillFolderHash/pluginName/installedAt/updatedAt`；项目级对应 `./.agents/skills-lock.json`（`experimental_install` 的输入）。`[本机]` 该文件 100 条记录，结构与上述完全一致。
- 安装目录名 = frontmatter `name` 经 `sanitizeName()`（小写、非法字符转连字符，`[源码 src/installer.ts]`），**与源目录名无关**——这是「前缀改名不动目录」的依据。

## 问题 8：我们仓库的推荐布局

### 现状盘点（`[本机]`）

- 稀疏检出 `/*` + `/pstack/` + `/docs/`，工作区只有 pstack/ 和 docs/；**但提交树 = 完整上游 cursor/plugins**（advisor、ralph-loop、origin-apps、teaching 等 20+ 插件目录 + 根 `.claude-plugin/marketplace.json` 都在 GitHub 仓库里）。
- `pstack/skills/`：54 个技能；`pstack/automations/benny/skills/`：3 个自动化技能（只应被 Benny 自动化调用，不应进用户技能目录）；`pstack/agents/`：2 个子代理文件。
- 实测发现结果矩阵：

| 命令 | 发现数 | 内容 |
|---|---|---|
| `npx skills add ChHsiching/pstack-zcode`（现状） | **2** | 仅 origin-apps 的技能（marketplace.json 优先命中，pstack 不可见） |
| `npx skills add ChHsiching/pstack-zcode/pstack`（现状） | **54** | 恰好 pstack/skills/*，benny 3 个不混入 |
| 本地路径（稀疏工作区） | 57 | pstack 54 + benny 3（工作区无根 marketplace.json，走回退扫描） |
| 合成树 + pstack-only marketplace.json | 圈定 | 只发现声明的插件，杂插件目录被排除 |

### 推荐方案（对 upstream merge 影响最小、命令最短）

1. **根 `.claude-plugin/marketplace.json` 改为 pstack-only 声明**：

   ```json
   {
     "name": "pstack-zcode",
     "owner": { "name": "ChHsiching", "url": "https://github.com/ChHsiching" },
     "plugins": [
       {
         "name": "pstack",
         "source": "./pstack",
         "description": "pstack（Lauren @poteto 的 Cursor 工作流）适配 ZCode 的技能集"
       }
     ]
   }
   ```

   - 效果：`npx skills add ChHsiching/pstack-zcode` 精确发现 `pstack/skills/` 54 个技能，安装列表里按 "pstack" 分组展示；其他上游插件目录留在树里也不污染列表（合成树实测）。
   - **这是唯一要动仓库的文件**。merge 影响评估：上游根 marketplace.json 很少变（当前也只声明 origin-apps 一个）；上游新增插件条目时产生一次小冲突，解决方式固定为「保留我方 pstack-only 版本」。注意：这份文件在这里的角色是 **skills CLI 的发现清单**，与已废弃的 ZCode 插件打包（`.zcode-plugin/marketplace.json`）无关，且 CLI 只读 `.claude-plugin/` 这一份（`.cursor-plugin/marketplace.json` 它不读，`[源码 src/plugin-manifest.ts]`）。
2. **技能改名只改 frontmatter**：`pstack/skills/tdd/SKILL.md` 里 `name: tdd` → `name: pstack-tdd`，目录名不动。锁文件 skillPath 仍指上游路径，upstream diff 干净。附带解决与 mattpocock 已装技能（tdd/teach/unslop/code-review/pr/research 等重名）的覆盖冲突——这些目录都装在 `~/.agents/skills/<name>/`，同名必互相覆盖（add 时会显示 overwrites 警告）。
3. **benny 的 3 个自动化技能**：pstack-only 清单方案天然把它们排除在发现列表外（不在 `pstack/skills/` 下），无需处理；若未来想显式屏蔽，可加 `metadata.internal: true`。

### 已否决的备选（记录理由）

- **只靠子路径命令（零仓库改动）**：`npx skills add ChHsiching/pstack-zcode/pstack`，实测有效，但命令长、易错（用户漏写 `/pstack` 会看到 2 个无关技能），留作兜底写进文档。
- **把提交树裁剪成只剩 pstack/ + docs/**（`git rm` 其他上游目录）：无清单时回退扫描可行，但 upstream merge 会对每个被上游改动的目录报 modify/delete 冲突，违背「保持可 merge upstream」约束，且仍需处理根 marketplace.json。否决。
- **根目录加 `skills/` 目录（复制/再导出）**：破坏「原地改 pstack/skills 文件」的单源原则，双份维护。否决。（Windows 上的目录联接/junction 也不能被 git 跟踪到 GitHub。）

## 问题 9：最终推荐

### 用户视角（一行）

```bash
npx skills add ChHsiching/pstack-zcode -g -a zcode -y
```

交互版（不带 `-y`）：选技能（默认全选高亮）→ 选 agent（zcode 自动检测、上次选择被记忆）→ Global → Symlink(Recommended)。装完落盘：

- `~/.agents/skills/pstack-tdd/` 等实体目录（canonical，含全部子文件）
- `~/.zcode/skills/pstack-tdd` → 指向 canonical 的符号链接
- `~/.agents/.skill-lock.json` 增加对应条目（source=ChHsiching/pstack-zcode，skillPath=pstack/skills/tdd/SKILL.md）

升级：`npx skills update -g`（按目录 hash 增量重装）；卸载：`npx skills remove`。

### 仓库要做的配合（共两件事 + 文档）

1. 根 `.claude-plugin/marketplace.json` → pstack-only 声明（见问题 8 示例 JSON）。
2. 54 个 `pstack/skills/*/SKILL.md` 的 frontmatter `name` 加 `pstack-` 前缀（`description` 顺带按需润色，安装列表直接展示它）。
3. 文档（仓库 README）写清：安装命令、`~/.zcode/agents/` 手动放子代理文件的命令，例如：

   ```bash
   curl -fsSL https://raw.githubusercontent.com/ChHsiching/pstack-zcode/main/pstack/agents/poteto-agent.md \
     -o ~/.zcode/agents/poteto-agent.md
   curl -fsSL https://raw.githubusercontent.com/ChHsiching/pstack-zcode/main/pstack/agents/comment-sicko.md \
     -o ~/.zcode/agents/comment-sicko.md
   ```

   并在 poteto-mode / poteto-help / no-comments 技能文里注明「子代理文件需在 `~/.zcode/agents/`（skills CLI 不负责安装）」。兜底安装命令 `npx skills add ChHsiching/pstack-zcode/pstack` 也写上。

### 两个子代理文件的落地

- 仓库内**保留在 `pstack/agents/` 原位**（不搬、不复制进技能目录），upstream merge 不受影响。
- 用户机器上由文档命令放进 `~/.zcode/agents/`（ZCode 既成约定，本机已有同类文件验证）。
- 若日后发现 ZCode 能从技能目录加载子代理，再考虑搬进 `poteto-mode/` 随装随带（问题 5 的备选 2）。

## 附：残留注意点

- **pstack 技能 frontmatter 的 `disable-model-invocation: true`**：Claude Code 语义（仅显式 / 调用）。skills CLI 原样保留；ZCode 是否识别该字段未验证——若不识别，模型可能自动触发这些技能，需要另行验证（超出本次调研范围）。
- **Windows symlink**：`npx skills add` 在 Windows 上建 symlink 需要开发者模式或管理员权限，失败时自动回退为逐 agent 复制（`[源码 src/installer.ts]` createSymlink 返回 false → copy 兜底），功能不受影响，只是多占磁盘且 update 后各副本独立。
- **遥测**：默认匿名上报安装事件用于 skills.sh 排行榜，`DISABLE_TELEMETRY=1` 可关（`[skills.sh/docs/cli]`）。若希望被 skills.sh 收录获得曝光，保持默认即可。
- **上游同步**：`plugin.json` 里 `version: 0.15.24` 等上游元数据与 skills CLI 无关（CLI 不读 `pstack/plugin.json`），版本号可继续跟随上游。
