# BOSS直聘招聘助手

一个用于 Codex Desktop 的 BOSS 直聘招聘插件。它可以复用已登录的站内浏览器，
从真实岗位列表中选择岗位，在“推荐”牛人中收集和筛选简历，并只在用户明确确认后
发送打招呼消息。

## 主要功能

- 读取 BOSS 页面中的真实岗位列表，通过结构化问答让用户选择，不要求手输岗位名称
- 默认只处理“推荐”候选人，“精选”和“最新”仅在用户明确指定时使用
- 自动排除无法正常打招呼的“热搜牛人推荐”卡片
- 支持批量收集、去重、摘要排序和两阶段详情复核
- 支持直接点击候选卡查看详情，并兼容 Canvas 渲染的简历
- 按用户条件筛选 Go、后端、AI、城市、薪资、经验等信号
- 打招呼前展示真实候选人名单和数量，必须二次确认后才发送
- 大批量筛选使用条件等待和按需截图，减少无效等待

## 运行前提

使用前请确认：

1. 已安装 Codex Desktop，且 Computer Use 与 `cua_repl` 可用。
2. Codex 应用内浏览器已经登录 BOSS 直聘，并能打开推荐牛人页面。
3. 本机已经配置 Jev 浏览器运行时和凭证。
4. 当前任务使用的是支持插件的 Codex 环境。

插件不包含 API Key、Cookie、BOSS 账号数据、候选人简历或任何凭证文件。

## 安装

从 GitHub 仓库安装：

```powershell
codex plugin marketplace add zhz1667/boss-zhipin-recruiter --ref main
codex plugin add boss-zhipin-recruiter@boss-recruiting
```

安装完成后，请新开一个 Codex 任务，让插件、Skill 和运行时重新加载。

## 推荐使用方法

直接用自然语言唤起插件，并说明要找什么类型的候选人。例如：

```text
使用 $boss-zhipin-recruiter，从推荐牛人中筛选 Go 后端开发候选人。
技术要求：Golang、Gin、Goroutine、Channel、PostgreSQL、Redis。
优先考虑应届生或1到2年经验，接受杭州前期办公、后期宁波驻场。
先筛选100人，详情复核前25名。暂时不要打招呼。
```

岗位名称不需要写进提示词。插件会先读取 BOSS 页面中的真实岗位列表，再通过
`AskUserQuestion` 或当前宿主的 `request_user_input` 让用户选择。这样可避免
空格、中英文、括号和后缀与网站不一致导致选错岗位。

## 标准流程

### 1. 选择岗位

插件调用 `listJobs` 读取当前账号下的真实岗位，例如：

```text
Go 后端开发工程师（BE-Go） _ 宁波 8-9K
AI应用工程师（agent方向） _ 宁波 11-20K
```

随后应使用结构化问答显示选项。用户选择后，插件将该选项的 `optionIndex` 和
完整 `label` 传给 `selectJobOption`，点击前再次校验两者是否一致。

结构化问答不可用时，插件只能展示真实岗位编号列表，用户回复编号即可，仍然
不需要手输完整岗位名称。

### 2. 选择候选池

默认候选池是“推荐”。只有用户明确说“使用精选”或“使用最新”时，插件才会
切换候选池。

### 3. 设置筛选条件

可以一次说明以下信息：

- 收集人数，例如100人
- 详情复核人数，例如前25人
- 技术关键词，例如 Go、Gin、PostgreSQL、Redis、Docker
- 城市或驻场要求
- 学历与经验范围
- AI、开源、博客等加分项
- 需要排除的公司、岗位或经历

对于可能影响结果的关键条件，插件应优先使用结构化问题让用户选择或填写。

### 4. 两阶段筛选

插件优先使用 `browseAndRankCandidates`：

1. 收集100名普通推荐候选人。
2. 先根据卡片摘要做第一轮排序。
3. 只对前25名打开完整简历进行复核。
4. 将详情信息加入评分后返回最终排序。

这种方式比直接打开100份详情快很多。详情打开是 BOSS 页面中最慢的操作，
因此不建议在没有必要时对全部候选人打开详情。

### 5. 查看结果

插件返回的候选人通常包含：

- 姓名
- 期望薪资
- 年龄、经验、学历与求职状态
- 期望城市和岗位
- 匹配到的技术信号
- 风险项，例如 PostgreSQL 不明确、城市意向不符
- 详情读取错误或需要视觉复核的标记

插件不会在回复中默认打印完整简历。候选人信息属于敏感数据，只在当前招聘
任务中使用。

### 6. 打招呼

打招呼属于外部消息，必须经过两次保护：

1. 先调用 `prepareGreetingPlan`，展示所有可发送的候选人姓名和总数。
2. 用户明确确认后，才允许调用 `greetCandidates`，并传入
   `confirmationToken: 'USER_CONFIRMED'`。

“帮我筛选”“准备名单”都不等于授权直接发送。没有明确确认时，插件不得打招呼。

## 常用运行时接口

| 接口 | 用途 |
| --- | --- |
| `connect` | 连接已登录的 BOSS 推荐页 |
| `readPageState` | 读取当前岗位、候选池、登录和验证码状态 |
| `listJobs` | 读取页面中的真实岗位选项 |
| `selectJobOption` | 按用户选择的索引或完整标签精确切换岗位 |
| `browseCandidates` | 收集候选人卡片，支持可选详情读取 |
| `browseAndRankCandidates` | 推荐的大批量筛选入口，先排序再复核详情 |
| `enrichCandidateDetails` | 对指定候选人打开详情并提取文本 |
| `rankCandidates` | 按关键词、城市、薪资、经验做确定性排序 |
| `prepareGreetingPlan` | 检查候选人是否可打招呼 |
| `greetCandidates` | 仅发送已确认的打招呼 |

## 默认限制

| 项目 | 默认值 | 上限 |
| --- | ---: | ---: |
| 收集候选人 | 100 | 1000 |
| 两阶段详情复核 | 25 | 300 |
| `browseCandidates` 完整详情 | 50 | 300 |
| 单次打招呼 | 5 | 20 |

人数和筛选条件都可以在对话中调整。

## Jev 配置

每个使用者都需要自行配置 Jev。插件读取：

```text
~/.config/jev-browser-use/config.json
```

该配置引用的 `envFile` 必须存在于本机。不要提交凭证文件、API Key、Cookie、
`auth.json` 或任何 BOSS 账号数据。

如果使用 API Key 登录 Codex，不要调用浏览器完整清单接口，例如
`cua.getState()`、`cua.listBrowsers()` 或 `cua.listTabs()`。应直接用已知 URL
绑定应用内浏览器标签页。

## 故障排查

### 页面提示登录失效

请在 Codex 应用内浏览器重新登录 BOSS 直聘，然后重新执行插件。

### 岗位列表为空

确认当前账号有在招岗位，并确认推荐页已经加载完成。不要通过手输岗位名称绕过
该问题，应先刷新页面并重新读取真实岗位列表。

### 岗位选择后页面仍停留在旧岗位

停止当前流程，重新调用 `listJobs`，重新读取岗位选项。不要重复猜测岗位名称。

### 详情没有文本

部分简历使用 Canvas 渲染。插件会将其标记为需要视觉复核，只在必要时截取页面
图片，不会默认保存简历截图。

### 候选卡无法点击

先关闭岗位搜索浮层和残留详情弹窗，再重试点击。插件已经包含一次安全重试。

### 打招呼按钮不可用

热搜牛人、已沟通候选人、按钮禁用或页面验证都可能阻止打招呼。插件会返回对应
状态，不会强行点击。

## 开发与验证

运行运行时自测：

```powershell
node .\plugins\boss-zhipin-recruiter\skills\boss-zhipin-recruiter\scripts\boss-runtime.mjs
```

校验插件结构：

```powershell
python path\to\plugin-creator\scripts\validate_plugin.py .\plugins\boss-zhipin-recruiter
```

修改 Skill 后，请新开 Codex 任务进行端到端验证，确保新的 Skill 文本和运行时
已经被加载。

## 目录结构

```text
plugins/boss-zhipin-recruiter/
├─ .codex-plugin/plugin.json
├─ skills/boss-zhipin-recruiter/
│  ├─ SKILL.md
│  ├─ references/
│  └─ scripts/boss-runtime.mjs
└─ vendor/jev-browser-use/
```

## 安全原则

- 不保存 BOSS 密码、Cookie、验证码或账号令牌。
- 不把 Jev API Key 写入插件文件。
- 不默认导出完整简历或候选人截图。
- 不自动发送打招呼消息。
- 遇到登录失效、验证码、账号警告或岗位歧义时停止并报告。
