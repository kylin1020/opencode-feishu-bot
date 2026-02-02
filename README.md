# OpenCode 飞书机器人

一个飞书聊天机器人，用于与 OpenCode AI 编程助手集成，让你可以通过飞书与 OpenCode 进行交互。

## 功能特性

- **会话群模式**：每个会话创建独立群组，群内无需 @机器人 即可对话
- **自动标题**：首条消息自动设置群组标题，格式 `o{会话ID}-{标题}`
- **会话隔离**：多个会话群互不干扰，用户退出或解散群时自动清理
- **开箱即用**：默认所有用户可用，无需配置白名单
- **菜单系统**：支持飞书应用菜单，快速创建会话、切换项目等
- **自动启动**：OpenCode 服务器随机器人自动启动，无需手动配置
- **流式响应**：实时卡片更新，具有打字效果
- **消息撤回**：用户撤回消息时自动中止任务并撤回 AI 响应
- **项目切换**：支持预配置项目列表，快速切换
- **模型切换**：动态切换 AI 模型
- **可选白名单**：支持启用白名单模式限制访问
- **命令系统**：内置常用操作命令

## 环境要求

- [Bun](https://bun.sh) v1.2.0 或更高版本
- 飞书企业应用（详细权限配置见 [飞书应用配置](#飞书应用配置) 章节）

## 安装

### 作为 npm 包安装

```bash
# 全局安装
npm install -g opencode-feishu-bot

# 或使用 bun
bun add -g opencode-feishu-bot
```

### 从源码安装

```bash
# 克隆仓库
git clone https://github.com/kylin1020/opencode-feishu-bot.git
cd opencode-feishu-bot

# 安装依赖
bun install
```

## 配置

创建配置文件 `~/.config/opencode-feishu-bot/config.toml`：

```bash
mkdir -p ~/.config/opencode-feishu-bot
cp config.toml.example ~/.config/opencode-feishu-bot/config.toml
```

### 配置文件示例

```toml
[feishu]
app_id = "cli_xxxxxxxxxxxx"
app_secret = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

[admin]
user_ids = ["ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]
allow_all_users = true

[database]
# path = "~/.config/opencode-feishu-bot/bot.db"

[logging]
level = "info"

[[projects]]
path = "/home/user/project-a"
name = "项目A"

[[projects]]
path = "/home/user/project-b"
name = "项目B"

[models]
default = "anthropic/claude-sonnet-4-20250514"

[[models.available]]
id = "anthropic/claude-sonnet-4-20250514"
name = "Claude Sonnet"
```

### 配置项说明

| 配置项 | 说明 | 必填 |
|--------|------|------|
| `feishu.app_id` | 飞书开放平台的应用 ID | 是 |
| `feishu.app_secret` | 飞书应用密钥 | 是 |
| `admin.user_ids` | 管理员 open_id 列表 | 否 |
| `admin.allow_all_users` | 是否允许所有用户（默认 `true`） | 否 |
| `database.path` | SQLite 数据库路径 | 否 |
| `logging.level` | 日志级别（debug/info/warn/error） | 否 |
| `projects` | 预配置项目列表 | 否 |
| `models.default` | 默认模型 | 否 |
| `models.available` | 可用模型列表（留空显示全部） | 否 |

### 环境变量

环境变量可覆盖配置文件中的对应项：

| 变量 | 覆盖配置项 |
|------|------------|
| `FEISHU_APP_ID` | `feishu.app_id` |
| `FEISHU_APP_SECRET` | `feishu.app_secret` |
| `DATABASE_PATH` | `database.path` |
| `LOG_LEVEL` | `logging.level` |
| `DEFAULT_MODEL` | `models.default` |

> **注意**：OpenCode 服务器会随机器人自动启动（随机端口），无需手动配置。
> 默认项目目录为机器人启动时的**当前工作目录**。

## 使用方法

### 启动机器人

```bash
# 在你的项目目录中启动
cd /path/to/your/project
opencode-feishu-bot

# 从源码运行 - 生产模式
bun run start

# 从源码运行 - 开发模式（热重载）
bun run dev
```

### CLI 参数

| 参数 | 简写 | 说明 |
|------|------|------|
| `--model <id>` | `-m` | 设置默认模型（格式：provider/model） |
| `--project <path>` | `-p` | 设置默认项目目录 |
| `--log-level <level>` | `-l` | 日志级别（debug/info/warn/error） |
| `--list-models` | | 列出所有可用模型并退出 |
| `--help` | `-h` | 显示帮助信息 |
| `--version` | `-v` | 显示版本号 |

示例：

```bash
# 使用指定模型启动
opencode-feishu-bot --model anthropic/claude-sonnet-4-20250514

# 指定项目目录启动
opencode-feishu-bot -p /path/to/project

# 列出所有可用模型
opencode-feishu-bot --list-models

# 组合使用
opencode-feishu-bot -m anthropic/claude-sonnet-4-20250514 -p /path/to/project -l debug
```

### 可用命令

| 命令 | 说明 | 仅管理员 |
|------|------|----------|
| `/help` | 显示可用命令 | 否 |
| `/new <编号>` | 创建新会话群（私聊）/ 切换项目（会话群内） | 否 |
| `/model <编号或ID>` | 切换 AI 模型 | 否 |
| `/compact` | 压缩当前会话上下文 | 否 |
| `/clear` | 清除历史，创建新会话 | 否 |
| `/new_session` | 创建新的 OpenCode 会话 | 否 |
| `/switch_project <路径>` | 切换到不同的项目 | 否 |
| `/abort` | 中止当前运行的任务 | 否 |
| `/status` | 显示会话状态 | 否 |
| `/whitelist_add <用户ID>` | 将用户添加到白名单 | 是 |
| `/whitelist_remove <用户ID>` | 从白名单移除用户 | 是 |
| `/whitelist_list` | 列出所有白名单用户 | 是 |

### 与 OpenCode 交互

**会话群模式（推荐）：**

1. 在私聊中向机器人发送 `/new <项目编号>` 创建新会话群
2. 机器人创建群组并拉你进群
3. 在群内直接发送消息与 AI 对话，无需 @机器人
4. 首条消息会自动设置群组标题（如 `o1a2b3c-实现登录功能`）
5. 退出群组或解散群时自动清理会话数据

**私聊模式：**

直接在私聊中向机器人发送消息，机器人会自动创建或复用会话。

**消息撤回**：如果在 AI 生成响应过程中撤回消息，机器人会自动中止任务并撤回已发送的响应。

## 开发

### 运行测试

```bash
bun test
```

### 项目结构

```
src/
├── index.ts           # 应用入口
├── bootstrap.ts       # 引导程序
├── config.ts          # 配置管理
├── cli.ts             # CLI 参数解析
├── gateway/           # Gateway 控制平面
│   ├── gateway.ts     # 消息路由核心
│   └── router.ts      # Bindings 路由
├── channels/          # 渠道抽象层
│   ├── base.ts        # 基础 Channel
│   ├── converter.ts   # 消息转换
│   └── feishu/        # 飞书渠道实现
├── agent/             # Agent 运行时抽象
│   ├── base.ts        # 基础 Agent
│   └── opencode.ts    # OpenCode Agent
├── mcp/               # MCP Hub
│   ├── hub.ts         # MCP 工具管理
│   └── servers/       # MCP Servers
│       └── feishu.ts  # 飞书 MCP Server
├── session/           # 会话管理
│   ├── manager.ts     # 会话管理器
│   └── compaction.ts  # 会话压缩
├── queue/             # 消息队列
│   └── lane-queue.ts  # Lane Queue
├── hooks/             # Hook 事件系统
│   └── manager.ts     # Hook 管理器
├── plugins/           # 插件系统
│   └── manager.ts     # 插件管理器
├── feishu/            # 飞书 SDK 集成
│   ├── client.ts      # 飞书客户端
│   ├── api.ts         # API 请求
│   ├── docs/          # 文档操作
│   └── sheets/        # 表格操作
├── opencode/          # OpenCode SDK
├── commands/          # 命令系统
├── types/             # 类型定义
├── utils/             # 工具函数
└── __tests__/         # 测试文件
```

## 架构

```
                      ┌─────────────────┐
                      │     Gateway     │
                      │   控制平面      │
                      └────────┬────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    Channels     │  │     Agents      │  │    MCP Hub      │
│   (飞书渠道)    │  │   (OpenCode)    │  │   (工具扩展)    │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  SessionManager │  │   消息队列      │  │  飞书 MCP       │
│    会话管理     │  │  (LaneQueue)    │  │  Server         │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │   Hook 系统     │
                    │   Plugin 系统   │
                    └─────────────────┘
```

### 核心概念

- **Gateway**: 控制平面，负责 Channel 和 Agent 的注册、消息路由
- **Channel**: 渠道抽象，支持多种消息来源（目前支持飞书）
- **Agent**: AI Agent 运行时抽象，支持多种 Agent（目前支持 OpenCode）
- **MCP Hub**: MCP 工具管理，支持内置和外部 MCP Server
- **SessionManager**: 会话管理，支持多种会话键类型、事件去重、子任务处理
- **Hook**: 事件系统，支持自定义事件处理
- **Plugin**: 插件系统，支持运行时扩展

## 飞书应用配置

1. 访问[飞书开放平台](https://open.feishu.cn/app)
2. 创建新的企业应用

### 权限配置

进入 **开发配置 > 权限管理**，开通以下权限：

#### 消息权限

| 权限名称 | 权限标识 | 用途 | 必需 |
|---------|---------|------|------|
| 获取与发送单聊、群组消息 | `im:message` | 发送消息、更新卡片 | ✅ |
| 获取用户发给机器人的单聊消息 | `im:message.p2p_msg:readonly` | 接收私聊消息 | ✅ |
| 获取群组中所有消息 | `im:message.group_msg:readonly` | 接收群聊消息 | ✅ |
| 获取与上传图片或文件资源 | `im:resource` | 获取用户发送的图片 | ✅ |

#### 群组权限

| 权限名称 | 权限标识 | 用途 | 必需 |
|---------|---------|------|------|
| 获取与更新群组信息 | `im:chat` | 创建群聊、更新群名、解散群 | ✅ |
| 获取群组信息 | `im:chat:readonly` | 获取群信息 | ✅ |
| 更新群置顶 | `im:chat.top_notice:write` | 置顶状态卡片 | 可选 |

#### 用户权限

| 权限名称 | 权限标识 | 用途 | 必需 |
|---------|---------|------|------|
| 通过手机号或邮箱获取用户 ID | `contact:user.id:readonly` | 白名单功能（通过用户 ID 识别） | 可选 |

### 事件订阅

进入 **开发配置 > 事件订阅**：

1. 选择 **长连接** 模式（无需配置服务器地址）
2. 添加以下事件：

| 事件名称 | 事件标识 | 用途 | 必需 |
|---------|---------|------|------|
| 接收消息 | `im.message.receive_v1` | 接收用户消息 | ✅ |
| 机器人进群 | `im.chat.member.bot.added_v1` | 发送欢迎卡片 | ✅ |
| 机器人被移出群 | `im.chat.member.bot.deleted_v1` | 清理会话数据 | ✅ |
| 用户退群 | `im.chat.member.user.deleted_v1` | 会话群自动清理 | ✅ |
| 群解散 | `im.chat.disbanded_v1` | 会话群自动清理 | ✅ |
| 消息撤回 | `im.message.recalled_v1` | 自动中止任务、撤回响应 | ✅ |
| 机器人菜单点击 | `application.bot.menu_v6` | 菜单功能 | 可选 |
| 卡片回传交互 | `card.action.trigger` | 卡片按钮点击（模型切换等） | ✅ |

### 机器人菜单（可选）

进入 **应用功能 > 机器人 > 机器人菜单**，添加以下菜单项：

| 菜单名称 | event_key |
|---------|-----------|
| 新建会话 | `new_session` |
| 切换模型 | `switch_model` |
| 压缩上下文 | `compact` |
| 清除历史 | `clear_history` |
| 查看状态 | `show_status` |

### 发布应用

完成以上配置后：

1. 进入 **应用发布 > 版本管理与发布**
2. 创建新版本，提交审核
3. 审核通过后发布应用
4. 将机器人添加到你的飞书工作区

## 故障排除

### 机器人收不到消息
- 确保在飞书应用设置中启用了长连接
- 检查所有必需权限是否已授予（见 [权限配置](#权限配置)）
- 验证 `.env` 中的应用凭证
- 确认已订阅所需的事件（见 [事件订阅](#事件订阅)）

### 无法创建会话群
- 确认已授予 `im:chat` 权限
- 确认应用已发布并通过审核
- 检查机器人是否有创建群聊的能力

### 会话群内消息无响应
- 确认群组是通过 `/new` 命令创建的会话群
- 普通群组需要 @机器人 才能触发响应
- 检查数据库中是否有该群的会话记录

### 权限被拒绝（白名单模式）
- 确认 `ALLOW_ALL_USERS` 是否设为 `false`
- 验证用户是管理员或已加入白名单
- 作为管理员使用 `/whitelist_add <用户ID>` 授予访问权限

### 消息撤回不生效
- 确认已订阅 `im.message.recalled_v1` 事件
- 机器人只能撤回 24 小时内发送的消息

### 卡片按钮点击无响应
- 确认已订阅 `card.action.trigger` 事件
- 检查日志中是否有卡片交互相关的错误

### 无法获取用户发送的图片
- 确认已授予 `im:resource` 权限
- 检查图片是否已过期（飞书图片有有效期）

### 无法置顶消息
- 确认已授予 `im:chat.top_notice:write` 权限
- 机器人需要是群管理员才能置顶消息

## 许可证

MIT
