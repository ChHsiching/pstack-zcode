# ZCode 插件安装/分发与技能命名机制权威调研 + npx 一键安装方案

- 调研日期：2026-10-15
- 调研对象：ZCode CLI 0.16.9（本机 `C:\Program Files\ZCode\resources\glm\zcode.cjs`，`zcode doctor` 输出 `version: 0.16.9 / process: zcode-cli / default artifact: node-bundle`）；用户配置 `C:\Users\Administrator\.zcode\`；官方文档 [zai-org/zcode-plugins PLUGIN_DEVELOPMENT.md](https://github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT.md)、[zai-org/ZCode README.en.md](https://github.com/zai-org/ZCode/blob/main/README.en.md)
- 调研方法：只读 CLI 命令实测 + 本机状态文件/缓存目录取证 + CLI 打包源码（15MB `zcode.cjs` bundle）中安装与命名解析逻辑的反汇编式阅读 + 联网生态调研
- 本报告为上一轮 `docs/research/pstack-zcode-adaptation.md`（2026-10-14）的专项深化，不重复其结论，只修正/细化其中与本主题相关的部分
- 证据标注约定：【CLI】= 命令输出；【FS】= 本机文件系统；【SRC】= zcode.cjs bundle 内源码（附函数名，便于在开源仓库 [zai-org/ZCode](https://github.com/zai-org/ZCode) `apps/zcode-cli/` 中对照）；【DOC】= 官方文档；【WEB】= 网络来源

---

## 0. 三句话结论（TL;DR）

1. **安装**：`zcode plugins marketplace add <owner/repo>` + `zcode plugins install <plugin>@<marketplace>` 是唯一受支持的正式安装路径；marketplace source 支持 github/git/url/file/directory 五种可安装形态，`npm`/`pip` 类型在 schema 中存在但**安装时明确抛错不支持**（【SRC】`case "npm": throw ...`，详见 §1.7）。
2. **命名**：ZCode **有**冒号机制——插件技能始终以限定名 `plugin:skill` 注册并可加注裸名别名（如 `github:commit (also loadable as commit)`，本会话技能列表可见）；同名 shadow 的比较键是 **SKILL.md frontmatter 的 `name` 字段**（非目录名），用户级同名技能会抢走裸名，但插件技能永远可用限定名调用——因此**给 pstack 撞名技能改名（如 `pt-tdd`）可彻底消除 shadow**。
3. **npx**：生态先例充分（`npx skills` 已原生支持 ZCode 目标、Z.AI 官方自己也在用 `npx @z_ai/coding-helper`）；但 `zcode` 命令**不保证在 PATH 上**（本机就没有），所以推荐方案是**发布一个小 npm 包（thin wrapper），由它定位 zcode CLI（PATH → 已知安装位置回退）并透传执行官方 `marketplace add` + `install` 子命令**——一条命令 `npx pstack-zcode`，零内部状态直写，升级完全走官方 `update` 通道。

---

## 1. 插件安装/分发机制（权威核实）

### 1.1 CLI 实际支持的命令面

`zcode --help` 顶层只暴露 6 个子命令（`app-server`、`commands`、`doctor`、`login`、`logout`、`plugins`、`skills`、`tui`、`version`）。`plugins --help` 不输出专属帮助（回退顶层 help），但完整子命令表刻在 bundle 的 usage 字符串里（【SRC】常量 `evc`，位于 plugins 命令注册模块）：

```
Usage: zcode plugins <command> [options]

Commands:
  list [--json] [--available]                  List installed plugins; --available also lists the marketplace catalog
  install <plugin>[@marketplace] [-s <scope>]  Install a plugin from a known marketplace
  uninstall <plugin> [-s <scope>] [--keep-data] [--force]
  enable <plugin> [-s <scope>]
  disable [plugin] [-a|--all] [-s <scope>]
  update <plugin> [-s <scope>]                 Update a plugin to the latest marketplace version
  validate <path>                              Validate a plugin or marketplace manifest
  marketplace add <source> [--scope <scope>] [--sparse <path>]
                                               Add a marketplace from a URL, path, or GitHub repo
  marketplace list [--json]
  marketplace remove <name>
  marketplace update [name]                    Refresh one marketplace, or all when omitted

Scopes: user (default), project. `zcode plugin` is an alias of `zcode plugins`.
```

实测确认可用的只读命令：【CLI】`zcode plugins list --json`（每插件返回 `id/name/marketplace/version/rootPath/manifestPath/enabled/skillCount/mcpServerNames/diagnostics` 等）、`zcode plugins marketplace list [--json]`、`zcode plugins validate <path>`（实测对 rm-guard 返回 `Plugin manifest is valid`）、`zcode skills list`。

本机 `zcode plugins marketplace list` 实测输出（节选）：

```
Marketplaces (4)
- claude-plugins-official [official]: 289 plugins
  source: github anthropics/claude-plugins-official
- zcode-plugins-official [official]: 47 plugins
  source: url https://cdn-zcode.z.ai/zcode/official-plugin/marketplace.json
- rm-guard: 1 plugins
  source: git https://github.com/ChHsiching/rm-guard.git
- creator-skills: 4 plugins
  source: git https://github.com/ChHsiching/creator-skills.git
```

本机已有一个「单仓库 = 单 marketplace = 单插件」的活例（rm-guard，仓库主本人所建），是 pstack-zcode 最直接的参照。

### 1.2 marketplace source 类型与各自的解析行为

**Schema 层**（【SRC】zod discriminated union，变量 `UGs`）——`marketplace.json` 条目与配置里允许的 source 类型：

| source | 字段 | 安装路径是否支持 |
|---|---|---|
| `url` | `url`, `headers?` | ✅（`.json` 清单走 HTTP；`type:"zip"` 为打包插件，见 §1.3） |
| `github` | `repo`, `ref?`, `path?`, `sparsePaths?` | ✅ |
| `git` | `url`, `ref?`, `path?`, `sparsePaths?` | ✅ |
| `npm` | `package` | ❌ 抛 `PluginSourceNotSupported`（见 §1.7） |
| `file` | `path`（本地 `.json` 清单） | ✅ |
| `directory` | `path` | ✅ |

**CLI 参数层**（【SRC】函数 `Vdt`，marketplace add 的 `<source>` 实参解析顺序）：

1. `http(s)://` 开头：剥离尾部 `#ref`（`ioo`）；URL 以 `.git` 结尾或含 `/_git/` → **git** 源；host 是 `github.com` 且路径形如 `owner/repo` → 规范化为 `https://github.com/owner/repo.git` → **git** 源；其余 → **url** 源（直接 GET 该 URL 当 marketplace.json）
2. `git@host:path`（scp 形态，正则 `jYs`）→ **git** 源
3. 本地路径（存在）：`.json` 文件 → **file** 源；目录 → **directory** 源；不存在 → 报错 `Marketplace source path does not exist`
4. 形如 `owner/repo`（含 `/`、不含 `:`，支持尾缀 `#ref` 或 `@ref`）→ **github** 源
5. 其余 → `Unsupported marketplace source`

**github / git 源的拉取行为**（【SRC】函数 `roo` → `Zgn` / `hYs`）：

- 无 `sparsePaths` 时优先 `Zgn`：把 `https://github.com/{owner}/{repo}.git` 转成 **GitHub API zipball** `https://api.github.com/repos/{owner}/{repo}/zipball/{ref|HEAD}`（函数 `zZs`；请求头 `User-Agent: ZCode-Plugin-Installer`；仅接受 `github.com` 公开 HTTPS 仓库，host 白名单 `BZs = {github.com, www.github.com}`，函数 `UZs`）。**不是 git clone**。失败（401/403/404/限流，函数 `Ygn`）则回退真 git。
- 有 `sparsePaths`（即 CLI 的 `--sparse <path>`）时走 `hYs`：`git clone --depth 1 [--branch <ref>] --filter=blob:none --sparse` + `git sparse-checkout set <paths>`——**这是 ZCode 原生的稀疏检出通道**，对 pstack-zcode 这种 monorepo 稀疏检出仓库可以直接用 `--sparse pstack` 只拉该目录。
- git 回退路径 `dYs`：`git clone --depth 1 [--branch ref]`（有 sha 时完整 clone + checkout）。git 二进制可用环境变量 `ZCODE_GIT_BINARY` 覆盖；网络重试 3 次、超时 90s（常量 `Qro=3`、`QZs=9e4`）。
- 含 `.gitmodules` 的仓库被**拒绝**（函数 `$Zs` 检测后报 "repository declares Git submodules..."）。

**marketplace.json 的查找位置**（【SRC】函数 `$dt`）：按 `[<source.path 指定子目录>, .claude-plugin/marketplace.json, marketplace.json]` 顺序探测。即：**仓库根目录放 `marketplace.json` 即可**，也兼容 Claude Code 的 `.claude-plugin/marketplace.json` 约定。rm-guard 两处都有（根 + `.claude-plugin/`），实际命中根目录那份。

### 1.3 安装后的落盘位置（本机取证）

`~/.zcode/cli/plugins/` 布局（【FS】）：

```
~/.zcode/cli/plugins/
├── installed_plugins.json      # 安装登记（version/installedAt/installPath/source/scope）
├── known_marketplaces.json     # marketplace 登记（id/source/pluginCount/lastUpdated）
├── icon-sources.json
├── marketplaces/<marketplace-id>/     # marketplace 仓库的持久化副本（安装/更新时从中取插件）
├── cache/<marketplace-id>/<plugin-name>/<version>/   # 已装插件的运行副本
└── data/<plugin>@<marketplace>/       # 插件可写数据目录（${ZCODE_PLUGIN_DATA}）
```

实测细节：

- `marketplaces/rm-guard/` 是 git 源仓库的工作副本（含 `marketplace.json`、`hooks/`，**不含** `.git`）；`marketplaces/claude-plugins-official/`（github 源）同样无 `.git`（zipball 解包、stripRoot）【FS】。
- `cache/rm-guard/rm-guard/0.1.0/` 为插件根（`.zcode-plugin/plugin.json` + `.claude-plugin/plugin.json` + `.codex-plugin/plugin.json` 三清单并存），因该插件 `source: "."`（仓库根即插件根），副本里**连 `.git/shallow` 都带上了**——证明从 git clone 得到的插件目录是原样拷贝进 cache 的【FS】。
- `installed_plugins.json` 中 `source` 字段的五种实测形态【FS】：相对路径 `"./plugins/feature-dev"`（对 marketplace 仓库内路径）、`"."`（仓库根即插件）、`{"source":"url","url":"https://github.com/...git","sha":...}`（git URL）、`{"source":"git-subdir","url":...,"path":"plugins/liquid-lsp","ref":"main","sha":...}`、`{"source":"url","type":"zip","url":"https://cdn-zcode.z.ai/.../plugin.zip","sha256":...,"path":...}`（官方 CDN 的打包插件）。
- 插件 manifest 探测顺序（【SRC】常量 `ZZs/YZs/XZs` 与 `iKs`）：`.zcode-plugin/plugin.json` → `.claude-plugin/plugin.json` → `.codex-plugin/plugin.json`（技能根反查插件名时还接受 `.cursor-plugin/plugin.json`，函数 `mKs`/`iKs`——**pstack 已有的 `.cursor-plugin/plugin.json` 可被用于插件名反查，但不作为主清单**）。
- 插件/市场 `name` 校验正则（【SRC】常量 `a0n`，与【DOC】PLUGIN_DEVELOPMENT.md 一致）：`^[a-z0-9][a-z0-9._-]{0,127}$`——**小写字母/数字开头，仅允许 `.` `_` `-`，不允许冒号**，1–128 字符；version 缺省 `"0.0.0"`。

### 1.4 插件启用状态存在哪

`~/.zcode/cli/config.json` 顶层只有 `plugins` 与 `mcp` 两个键【FS】。`plugins` 键结构实测：

```json
{
  "plugins": {
    "enabledPlugins": { "<plugin-name>@<marketplace-id>": true/false, ... },
    "options": {}
  }
}
```

- 每插件一个布尔项，键是**插件 id**（`name@marketplace`），本机 57 项【FS】。
- `zcode plugins enable/disable` 即改此键（【SRC】`setPluginEnabled` app-server 方法；disable 输出还会提示 project/workspace 层可覆盖 user 层："still enabled by a higher-priority config layer (project/workspace); disable it there with --scope project"）。
- 安装即默认 enabled（【SRC】安装结果输出 `Installed plugin <id> (v) [enabled]`，函数 `ovc`）。
- 工作区级可用 `<repo>/.zcode/config.json` 同结构覆盖（`--scope project`）。
- 另有 `known_marketplaces.json` 独立登记 marketplace；删除 marketplace 用 `marketplace remove <name>`。

### 1.5 `marketplace add <github-repo-url>` 对仓库布局的要求

综合 §1.2：

1. **必须有 marketplace.json**：仓库根 `marketplace.json` 或 `.claude-plugin/marketplace.json`（或用 github/git 源的 `path` 字段指向子目录）。
2. marketplace.json 最少字段：`name` + `plugins[]`，每个条目最少 `name` + `source`（【DOC】PLUGIN_DEVELOPMENT.md；rm-guard 实例【FS】）。marketplace 的 **id 取自 `name` 字段**（rm-guard 的 marketplace id 就是其 `marketplace.json` 的 `name: "rm-guard"`；【SRC】`yoo` 解析后 `u.name` 持久化）。
3. `plugins[].source` 支持相对路径（`"./pstack"`，相对 marketplace 仓库根解析——installed_plugins.json 里 claude 官方条目 `"./plugins/feature-dev"` 可证）或 `.`（仓库根即插件）。**插件 source 路径不得逃逸 marketplace 根**。
4. 插件目录内需有可识别 manifest（`.zcode-plugin/plugin.json` 优先；`.claude-plugin/` 亦可——所以理论上 pstack 现有的 `.cursor-plugin/plugin.json` 需要补一份 `.zcode-plugin/plugin.json` 或 `.claude-plugin/plugin.json`）。
5. 用 `owner/repo` 简写走 GitHub API zipball（**无 git 依赖**，但受未认证 GitHub API 限流约束；失败自动回退 git clone）；用完整 `https://github.com/...` URL 走 `git clone --depth 1`（需要本机 git）。
6. pstack-zcode 适用形态（对照上一轮报告方案 C）：根 `marketplace.json`（`{"name":"pstack-zcode","plugins":[{"name":"pstack","source":"./pstack",...}]}`）+ `pstack/.zcode-plugin/plugin.json`。可选 `--sparse pstack` 减少拉取体积（注意：`--sparse` 走 git clone 路线，要求本机有 git）。

### 1.6 升级路径

实测 + 源码确认的完整升级链：

1. `zcode plugins marketplace update [name]`：重新拉取 marketplace 清单与仓库副本（known_marketplaces.json 的 `lastUpdated` 更新；本机 claude-plugins-official 从 2026-08-26 → zcode-plugins-official 2026-10-13 可见周期性刷新）【FS】【CLI】。
2. `zcode plugins update <plugin>@<marketplace>`：按刷新后的 marketplace 目录里该插件的 `version` 重装到新版本目录 `cache/<marketplace>/<name>/<new-version>/`，更新 installed_plugins.json 的 `installPath/version/updatedAt`，输出 `Updated plugin X from A to B. Restart zcode to apply.`（【SRC】函数 `rvc`）。已是最新则提示 `already up to date`。
3. 旧版本目录不清除（cache 下按版本并存），回滚即改指旧 installPath。
4. CLI 无 `update --all`（update 需指定插件；marketplace update 可不带参数刷全部市场）。

### 1.7 npm/pip source 的确切状态（对 npx 方案的关键约束）

【SRC】两处铁证：

- 安装执行器（插件条目 source 分派函数，位于 4312264 附近）：`if (c==="npm"||c==="pip") throw new NLe(c)`——`PluginSourceNotSupported`。
- 市场校验器（`validate`）：`a==="npm"||a==="pip"` → 诊断 `plugin_marketplace_source_unsupported: "Plugin source is recognized but not supported in V1 install: npm"`（warning 级）。
- 市场清单解析（函数 `yoo`）：`case "npm": throw new pye("npm")`。

结论：**schema 预留了 npm 类型（说明官方有此规划），但当前版本（0.16.9）一律不支持**。任何「把插件发成 npm 包让 ZCode 直接装」的路线当前走不通；npm 只能作为**安装器（installer）的分发渠道**，不能作为插件本体渠道。

---

## 2. 命名与同名冲突机制（权威核实）

### 2.1 「ZCode 是不是没有冒号机制？」——**有，且是双层名**

铁证（均为本会话/本机可见）：

- 会话技能列表里插件技能全部以限定名注册并标注裸名别名：`github:commit (also loadable as commit)`、`chrome-devtools-mcp:troubleshooting (also loadable as troubleshooting)`。
- 【CLI】`zcode skills list` 输出：`- chrome-devtools-mcp:a11y-debugging (user/plugin; alias a11y-debugging)`。
- 【SRC】格式化函数 `Qdo`：`qualifiedName !== name` 时追加 `(also loadable as ${name})`；显示名函数 `dht` 优先 `qualifiedName`。
- 【SRC】限定名构造函数 `resolvePluginSkillAlias`：插件技能元数据额外携带 `pluginId/pluginName/qualifiedName = "${pluginName}:${skillName}"`。插件名来自技能根向上回溯找到的第一份 `.zcode-plugin/.claude-plugin/.codex-plugin/.cursor-plugin` 的 `plugin.json` `name`（函数 `mKs`，最多向上 5 层）。
- 匹配函数 `fKs`：`e.name===t || e.qualifiedName===t`——**裸名和限定名都能命中同一个插件技能**。

### 2.2 同名 shadow 的精确语义

**比较键**：SKILL.md **frontmatter 的 `name` 字段**。目录名不参与比较（仅当完全无 frontmatter 时，`name` 才默认取目录名，【SRC】`parseSkill`：`u = frontmatter.name ?? (无frontmatter ? 目录名 : undefined)`；有 frontmatter 但缺 name → 技能被丢弃 `skill_missing_name`）。插件技能的限定名 = `插件name:frontmatter name`。

**发现顺序**（【SRC】`resolveDefaultSkillRoots` 函数 `cno`，priority 升序 = 先者胜；与 `diagnosing-skills` SKILL.md §1 文档一致）：

| priority | 根 |
|---|---|
| 10 | 显式配置的 roots（`skills.roots`） |
| 20 / 30 | 用户 `~/.zcode/skills` → `~/.agents/skills` |
| 40+（cwd 向上逐级到 git 根，越深 priority 越小=越优先） | 工作区 `<dir>/.zcode/skills` → `<dir>/.agents/skills` |
| 最后 | 已启用插件的 skills 根（最低） |

**去重模型**（【SRC】`discoverSkills`）：技能身份是**文件路径**——Map 按 path 收录，**同名不同路径的技能全部保留并都出现在列表里**（本机 `baocut`、`unslop` 在 `skills list` 与会话技能列表中均出现两条：user/zcode 与 user/agents）【CLI】。

**调用裁决**（【SRC】`loadSkill`）：`skills.sort(name 升序, 稳定排序).find(name===t || qualifiedName===t)`——取**第一个匹配**。由于同名条目间稳定排序保持发现顺序（用户级先于插件级），效果即文档所述「first same-named wins, user overrides workspace overrides plugin」（diagnosing-skills pitfall 4）。

由此得到 pstack 场景的精确语义（设用户装了 mattpocock 的 `~/.agents/skills/tdd`，同时 pstack 插件有技能 `tdd`）：

| 调用名 | 实际命中 |
|---|---|
| `tdd`（裸名） | **用户级 tdd**（发现顺序靠前；插件版被 shadow） |
| `pstack:tdd`（限定名） | **插件版**（限定名唯一命中，永远可达） |
| `/tdd`（菜单/斜杠显式调用） | 同裸名裁决 → 用户版 |

- 主会话 Skill 工具**不报歧义**，静默取先者；但**子代理上下文**（`validateSubagentComput...`，@13119761）：`filter(matches)` 命中 >1 个时直接报错 `Skill name is ambiguous for subagent; use the fully qualified skill name`——即同名共存时，子代理里裸名调用会失败并强制要求限定名。这是撞名的**第二个实害**（第一个是裸名被抢）。
- 插件 disabled / suppressed-builtin 时其技能根整体消失（diagnosing-skills pitfall 10）。

### 2.3 技能 name 的字符集/长度约束

- **加载层无字符集校验**（【SRC】`parseSkill` 只查非空；缺 description 或 description>1024 才丢弃）。本机存在 `video-shotcraft`（连字符合法）、`setup-matt-pocock-skills` 等。
- **限定名层**有一个宽松正则（【SRC】常量 `YOa`，仅用于子代理 allowed-skills 网关）：`^[A-Za-z0-9._:@/-]+$`，≤128——**冒号在限定名里合法**（本来就是分隔符），这也意味着**技能 name 自带冒号会产生歧义碰撞**（`name: "a:b"` 会与插件 a 的技能 b 的限定名形式相同），实践上应避免。
- **插件 name**（限定名前半）：`^[a-z0-9][a-z0-9._-]{0,127}$`，不允许冒号（§1.3）。
- 【DOC】PLUGIN_DEVELOPMENT.md 对技能 name 只说「keep it specific and stable」，未加字符集限制。

### 2.4 结论：pstack 撞名技能改名能否彻底避免 shadow？

**能，且代价很小。** 推理链：

1. shadow 只发生在**裸名**维度；改名 `tdd → pt-tdd`（frontmatter `name` 与目录名同步改）后，pstack 技能裸名 `pt-tdd` 全机唯一 → 不与任何用户级技能比较命中；限定名变为 `pstack:pt-tdd`，依旧双名可达。
2. 改名对调用方式的影响：调用名从 `/tdd`、`/pstack:tdd` 变为 `/pt-tdd`、`/pstack:pt-tdd`；`/` 菜单 Skills 组显示名同步变化（显示名优先限定名，即 `pstack:pt-tdd`，加注 `(also loadable as pt-tdd)`）。**不改名也不会"丢"技能**（限定名恒可达），改名的收益是：裸名直达 + 子代理不触发 ambiguous 错误 + `/` 菜单搜索体验。
3. 改名成本实测：pstack 内部引用 `tdd`/`teach`/`unslop` 的文件只有 5 个（`skills/poteto-help/SKILL.md`、`poteto-help/references/{recipes,prompting}.md`、`poteto-mode/playbooks/{opening-a-pr,multi-phase-plan}.md`，本地 grep）——交叉引用改写成本极低。
4. 备选方案对比：`pstack-tdd` 同理可行；不加前缀仅靠限定名（不改名）则用户裸名被本机 `~/.agents/skills/tdd`（mattpocock 版）抢走——**本机实测冲突已存在**：pstack 54 技能中 `tdd`、`teach`、`unslop` 三个与 `~/.agents/skills/`（及 `~/.zcode/skills/unslop`）撞名【FS】。pstack 的 `tdd` 与 mattpocock 的 `tdd` 是**两个不同技能**，裸名被抢属于实害，建议改名。

命名建议（综合 §2.2–2.4）：全部 54 个技能统一短前缀（如 `pt-`），撞名三技能必改；principle-* 类因名字天然带 `principle-` 前缀基本无撞名风险（本机无同名），可豁免以减小与上游 diff。**注意改的是我们仓库的适配层/覆盖层，`pstack/` 上游目录按既定方案 C 保持不动。**

### 2.5 子代理（agents/*.md）的同名机制——与技能不同，无 shadow

【SRC】函数 `kNn`/`glc`/`hlc`/`ylc`（bootstrap.subagents 模块）：

- 插件 agents 目录下每个 `*.md` 解析后**恒定注册为限定名 `${plugin.name}:${bareName}`**。
- 裸名**额外**注册的条件：该 bareName 在所有已启用插件中**恰好出现一次** 且不在保留名单（`mlc = {"general-purpose","Explore"}` + 传入的 reservedProfileNames）内；若与保留名/已有 profile 冲突 → 诊断 `agent_ambiguous_name: "Plugin agent bare name conflicts with an existing profile; use ${plugin}:${name}"`；多插件撞名 → `"Plugin agent bare name is ambiguous; use ..."`。
- 用户级 `~/.zcode/agents/` 与工作区 `.zcode/agents/` 的 profile 合并时**没有同名覆盖/去重逻辑**（函数 `SXt` 仅按 disabledAgentIds 过滤 user 源）。

结论：**agents 没有 skills 那种「用户级 shadow 插件级」竞争**——插件 agent 的限定名永远在；裸名是「唯一才给，冲突就让位给限定名」。pstack 的 `poteto-agent`/`comment-sicko` 名字冷僻，撞名风险≈0；即使撞名，`pstack:poteto-agent` 恒可用。

---

## 3. npx 一键安装方案调研

### 3.1 生态先例

| 先例 | 命令 | 机制 | 对本项目的启示 |
|---|---|---|---|
| [vercel-labs/skills](https://github.com/vercel-labs/skills)（npm 包名就叫 [skills](https://www.npmjs.com/package/skills)） | `npx skills add <owner/repo>` | npm 包 + 交互式选择器；按 agent 目标落盘（**已原生支持 ZCode：`--agent zcode` → `.zcode/skills/`（项目）或 `~/.zcode/skills/`（全局）**）；symlink 或 `--copy`；`npx skills update` 升级；源解析支持 GitHub 简写/tree 路径/任意 git URL/本地路径 | ZCode 已被主流安装器当作一等公民目标；但它**只装技能目录，不装插件**（无 manifest/agents/hooks 写入，明确只读 `.claude-plugin/` 清单做发现）——覆盖不了 pstack 的插件形态 |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `npx skills @latest add mattpocock/skills` | 上述 CLI 的头部用例；技能落入 `~/.agents/skills/`，被 Claude/Cursor/Codex/ZCode 共享层读取 | **正是本机 `~/.agents/skills/tdd` 的来源**——即 §2.4 撞名的另一端；也证明 `npx skills` 路线与插件路线共存时必有命名协调问题 |
| [Kamalnrf/claude-plugins](https://github.com/Kamalnrf/claude-plugins) | `npx claude-plugins install <marketplace/plugin>` | thin wrapper：包装目标工具自身 CLI 的 `plugin marketplace add` + `install` | **与本报告推荐方案同构**的先例 |
| Z.AI 官方 [zai-coding-plugins](https://github.com/zai-org/zai-coding-plugins) + [Coding Tool Helper](https://docs.z.ai/devpack/extension/coding-tool-helper) | `npx @z_ai/coding-helper` | 官方自己的 npx 安装器（菜单式），仓库 README 同时给出 `claude plugin marketplace add zai-org/zai-coding-plugins` 的原生双命令 | **Z.AI 官方自己就采用「npx 包装 + 文档双命令」双轨**——为 pstack-zcode 采用同样模式背书 |
| [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done/discussions/3432) | `npx get-shit-done-cc@latest -- claude-plugin` | 安装器**直写内部状态**；社区反馈重跑会与 Claude 官方 marketplace 自动更新流冲突 | **反例**：绕过官方 CLI 直写内部目录的方案有升级冲突前科 |
| [kingsword09/zcode-cli](https://github.com/kingsword09/zcode-cli) | npm 包 | 非官方：把 ZCode Desktop release 里的 runtime 重新打包成 npm 终端客户端 | 佐证「ZCode CLI 无官方 npm 分发」（见 §3.2 约束 1） |

### 3.2 工程约束清单（方案设计的前提）

1. **`zcode` 命令不保证在 PATH**：本机 Windows 上 `where zcode` / bash `which zcode` 均为空；CLI 实体是 `<安装根>\resources\glm\zcode.cjs`（Windows 实测 `C:\Program Files\ZCode\resources\glm\zcode.cjs`，需 node 运行；【CLI】`doctor` 自报 `process: zcode-cli`）。官方开源 README 的发行方式是「自建 + install.sh 装到 `~/.zcode/runtime`，命令放 `~/.local/bin`」（【WEB】README.en.md），桌面版用户则很可能从未单独装 CLI。→ 安装器必须做 **PATH → 已知安装位置回退探测**（win: `%ProgramFiles%\ZCode\resources\glm\zcode.cjs`；mac: `/Applications/ZCode.app/Contents/Resources/resources/glm/zcode.cjs`；linux 同构路径；以及 `~/.local/bin/zcode`）。
2. **npm 不能作为插件本体渠道**（§1.7）：npm 只能分发安装器。
3. **直写内部目录有风险**：`installed_plugins.json` 带 `cacheTransactionId` 事务字段、版本目录布局属未承诺实现细节；官方 `marketplace update`/`plugins update` 流程可能覆盖或无视手工状态（gsd 反例）。→ 安装器不应直写 `~/.zcode/cli/plugins/**`。
4. **GitHub zipball 路线无需本机 git**，但受未认证 API 限流；git clone 路线（含 `--sparse`）需要 git。pstack 用户群（开发者）有 git 是合理假设。
5. 跨平台：pstack 的 poteto-mode scripts 本就依赖 bun/node（上一轮报告 §1.3），Node 存在是合理前提；npx 在 Windows/macOS/Linux 一致可用，优于 `curl | sh`（Windows 无默认 curl|sh）。

### 3.3 方案甲：纯文档引导官方双命令（零基建）

用户侧最终命令（pstack-zcode 仓库根有 `marketplace.json`、`pstack/.zcode-plugin/plugin.json` 前提下）：

```bash
zcode plugins marketplace add ChHsiching/pstack-zcode   # 或完整 URL https://github.com/ChHsiching/pstack-zcode
zcode plugins install pstack@pstack-zcode               # 安装即默认 enabled
```

- 升级：`zcode plugins marketplace update pstack-zcode && zcode plugins update pstack@pstack-zcode`
- 维护成本：**零**（只需仓库里两份 json）。
- 缺点：两条命令；`zcode` 可能不在 PATH（§3.2-1，需文档给出 CLI 定位指引）；对非 CLI 用户可给 UI 路径（Plugin Marketplace → New → 粘贴仓库 URL，PLUGIN_DEVELOPMENT.md 有此流程）。
- 地位：**无论如何都应提供**——它是所有其他方案的兜底与最终执行体。

### 3.4 方案乙：npm 包 `pstack-zcode` 安装器（推荐主体）

发布一个小 npm 包（无运行时依赖，仅 node 内置模块），`package.json` 声明 `bin: { "pstack-zcode": ... }`。用户侧最终命令：

```bash
npx pstack-zcode          # 或 npx pstack-zcode@latest；幂等，重跑=升级
```

安装器内部流程（**只调用官方 CLI，零内部状态直写**）：

1. **定位 zcode CLI**：`zcode` on PATH → `ZCODE_CLI_PATH` 环境变量 → 平台默认安装根回退（§3.2-1 的路径表）→ 找不到则打印方案甲的 UI 安装指引并退出。
2. 执行 `zcode plugins marketplace add https://github.com/ChHsiching/pstack-zcode --scope user`（用完整 URL 走 git 源，避免 GitHub API 匿名限流；`marketplace add` 幂等——重复 add 同名市场会刷新）。
3. 执行 `zcode plugins install pstack@pstack-zcode --scope user`（已装则走 `update`；安装器用 `zcode plugins list --json` 预判）。
4. 打印成功信息 + `Restart zcode to apply` 提示（CLI 官方措辞，【SRC】`rvc`）。
5. 子命令：`npx pstack-zcode update`（= marketplace update + plugins update）、`npx pstack-zcode uninstall`、`npx pstack-zcode doctor`（打印 CLI 路径/版本/冲突技能审计——可内置 §2.4 的撞名扫描）。

- 用户侧体验：**一条命令、跨平台（win/mac/linux 一致）、无需知道任何 ZCode 概念**。
- 维护成本：一个 ~200 行的 Node 脚本 + npm 发版动作（可 GitHub Actions 自动发）。
- 升级体验：重跑 `npx pstack-zcode@latest` 即升级（含 pstack 插件本体与安装器自身）；插件升级也可走官方 `zcode plugins update`。
- 风险与对策：CLI 子命令面变化（0.x 阶段可能）→ 安装器内做 `zcode plugins list --json` 探活与错误透传，坏了一条命令用户仍可走方案甲；npm 包名抢注——尽早占坑 `pstack-zcode`。

**方案乙的变体（不推荐）——安装器直写缓存/config**：下载仓库 zip → 手工填 `cache/`、`installed_plugins.json`、`config.json`。省去对 CLI 的依赖，但违反 §3.2-3（事务字段/布局漂移/官方 update 覆盖，gsd 前车之鉴），**明确不建议**。

### 3.5 方案丙：接入/模仿 `npx skills` 生态

两种形态：

- **丙-a（被动兼容）**：确保 pstack-zcode 仓库结构能被 `npx skills add ChHsiching/pstack-zcode` 消费（它会读 `.claude-plugin/marketplace.json`/`plugin.json` 做技能发现）。用户可用 `npx skills add ChHsiching/pstack-zcode --agent zcode -g` 把技能装进 `~/.zcode/skills/`。**但这会把技能装到用户级**——优先级最高，反而**shadow 其他一切同名技能**，且丢失 agents/hooks/插件语义，与 pstack 插件形态相悖。仅作为「只想捞几个技能」的轻量入口提及，不作主推。
- **丙-b（curl|sh 安装脚本 / GitHub Releases）**：`curl -fsSL https://.../install.sh | sh`。对 macOS/Linux 友好，但 Windows 用户不便（本机即 Windows），且仍要解决 CLI 定位问题——不比 npm 包多任何优势，弃。

### 3.6 推荐方案

**甲 + 乙双轨，乙为主入口、甲为文档兜底**（与 Z.AI 官方 zai-coding-plugins 的做法完全同构）：

1. 仓库提供根 `marketplace.json` + `pstack/.zcode-plugin/plugin.json`（上一轮报告方案 C 已规划），使方案甲开箱即用。
2. 发布 npm 包 `pstack-zcode`（thin wrapper，仅定位 CLI 并透传官方命令），README 首行给 `npx pstack-zcode`。
3. 后续可选：向 vercel-labs/skills 提 PR 或等待其插件级支持，再评估丙-a 是否升格。

理由汇总：一条命令的用户体验（用户原始诉求）✅；零内部状态直写、升级全走官方 `update` 通道 ✅；跨平台一致 ✅；维护面最小（一个薄安装器 + 两份 manifest）✅；失败模式安全（最坏退化为两条官方命令）✅。

---

## 附录：证据索引

### 命令输出（【CLI】，本机 2026-10-15 实测）

- `node "C:\Program Files\ZCode\resources\glm\zcode.cjs" --help`（zcode 0.16.9 命令面；`zcode` 不在 PATH，`where zcode` 为空）
- `... plugins list --json`（57 个已装插件结构）
- `... plugins marketplace list [--json]`（4 个市场：github/url/git×2）
- `... plugins validate <rm-guard 路径>`（`Plugin manifest is valid`）
- `... skills list`（173 技能；限定名+alias 展示格式；baocut 双条目）
- `... doctor`（`version: 0.16.9, process: zcode-cli, default artifact: node-bundle`）

### 本机文件系统（【FS】）

- `C:\Users\Administrator\.zcode\cli\config.json`（plugins.enabledPlugins 结构）
- `C:\Users\Administrator\.zcode\cli\plugins\installed_plugins.json` / `known_marketplaces.json`（五种 source 形态、cacheTransactionId）
- `C:\Users\Administrator\.zcode\cli\plugins\{marketplaces,cache,data}\` 布局；`marketplaces\rm-guard\marketplace.json`；`cache\rm-guard\rm-guard\0.1.0\`（含 .git/shallow）
- `C:\Users\Administrator\.zcode\cli\plugins\cache\zcode-plugins-official\zcode-guide\0.3.0\skills\diagnosing-skills\SKILL.md`（发现顺序/shadow 文档全文）
- `C:\Users\Administrator\.zcode\cli\plugins\cache\zcode-plugins-official\plugin-creator\0.1.1\skills\plugin-creator\references\plugin-json-spec.md`
- 撞名实测：`~\.zcode\skills\`、`~\.agents\skills\` 与 `pstack\skills\` 交集 = {tdd, teach, unslop}；pstack 内部引用仅 5 文件

### CLI 源码（【SRC】，`zcode.cjs` bundle；函数名可对照 [zai-org/ZCode](https://github.com/zai-org/ZCode) `apps/zcode-cli/`）

- `evc`（plugins usage 全文）；`Vdt`（marketplace source 实参解析）；`UGs`（source schema union 含 npm/pip）；`yoo`（清单解析 switch，npm 抛错）；`roo`/`Zgn`/`zZs`/`UZs`/`BZs`（zipball 优先）；`hYs`（--depth 1 --sparse 稀疏克隆）；`dYs`（git 回退）；`$Zs`（.gitmodules 拒绝）；`$dt`/`KZs`/`Wdt`（marketplace.json 三探测位）；`ZZs/YZs/XZs/iKs`（plugin.json 四探测位）；`a0n`（name 正则）；`rvc`（update 输出）；`ovc`（install 默认 enabled）
- `cno`/`sno`/`pgn`（技能根 priority 构造）；`discoverSkills`（path 身份 Map）；`parseSkill`（name 缺省/丢弃规则）；`resolvePluginSkillAlias`/`mKs`（限定名构造与插件名回溯）；`fKs`+`loadSkill`（find-first 裁决）；@13119761 子代理 ambiguous 报错；`Qdo`/`dht`（显示格式）；`YOa`（限定名宽松正则）
- `kNn`/`glc`/`hlc`/`ylc`/`mlc`（插件 agent 限定名恒注册 + 裸名唯一才注册）；`SXt`（用户/工作区 agent 无去重）；`gSe`（conflictingPluginIds 仅指插件同名）

### 网络来源（【WEB】）

- [zai-org/zcode-plugins · docs/PLUGIN_DEVELOPMENT.md](https://github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT.md)（name 正则、source 类型、本地市场流程、`.claude-plugin/marketplace.json` 兼容）
- [zai-org/ZCode · README.en.md](https://github.com/zai-org/ZCode/blob/main/README.en.md)（CLI 官方分发方式：自建 + install.sh，无 npm 官方包）
- [vercel-labs/skills](https://github.com/vercel-labs/skills)、[skills on npm](https://www.npmjs.com/package/skills)（npx skills；zcode 目标 `.zcode/skills/`）
- [mattpocock/skills](https://github.com/mattpocock/skills)（`npx skills add mattpocock/skills` → `~/.agents/skills/`；本机撞名源头）
- [Kamalnrf/claude-plugins](https://github.com/Kamalnrf/claude-plugins)（npx 包装官方 CLI 先例）
- [zai-org/zai-coding-plugins](https://github.com/zai-org/zai-coding-plugins)、[Z.AI Coding Tool Helper 文档](https://docs.z.ai/devpack/extension/coding-tool-helper)（官方 `npx @z_ai/coding-helper` 双轨先例）
- [gsd-build/get-shit-done discussion #3432](https://github.com/gsd-build/get-shit-done/discussions/3432)（直写内部状态与官方更新流冲突的反例）
- [kingsword09/zcode-cli](https://github.com/kingsword09/zcode-cli)（非官方 npm 终端客户端）
