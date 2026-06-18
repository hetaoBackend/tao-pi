<p align="center">
  <img src="assets/taopi-header-cozy-terminal.png" alt="终端工作区里的 TaoPi 吉祥物 PiPi">
</p>

# TaoPi

把任何仓库变成智能体驾驶舱。

TaoPi 是一个 TypeScript 命令行工具，让 Pi 智能体直接在你的终端和当前工作区里干活：
读写文件、搜索代码、执行命令、抓取网页上下文、记住进度，并在下一次接着干。它够小，
方便改；也够完整，能像一个真正的本地工作台。

[英文版](README.md)

## 工作循环

打开仓库，启动 TaoPi，直接说你想改什么。

智能体会读取项目上下文，搜索工作区，编辑文件，执行命令，需要时抓取网页信息，
并把会话保存下来，让下一次运行可以接着往下做。

```text
仓库 -> 终端 -> 智能体工具 -> 工作区改动 -> 可恢复的会话
```

## 为什么值得试试

- **仓库就是运行场**：从当前工作区出发，让智能体可以读文件、搜文件、改文件、写文件和运行命令。
- **终端就是主界面**：真实终端里用交互式 TUI，脚本和管道场景下退回普通流式输出。
- **关掉窗口也不断片**：对话记录写入 SQLite，可以继续最近会话，也可以恢复指定会话。
- **项目上下文自动上车**：存在 `AGENTS.md`、`CLAUDE.md`、`CONTEXT.md` 时会自动读取。
- **需要网页时再联网**：配置 Firecrawl 后可启用 `web_search` 和 `web_fetch`，纯本地工作也照常可用。
- **不是黑盒产品**：待办、文件记忆和本地技能都走插件机制，方便继续改造。
- **一次配置，多处可用**：运行 `bun run dev -- setup` 即可写入 `~/.tao/config.toml`。

## 项目吉祥物

TaoPi 的吉祥物叫 **桃派 PiPi**。它是住在终端里的二次元导航员，头上有
π 形发夹，穿桃色与青绿色科技风外套，身边漂浮着终端窗口、文件卡片、数据库方块、
待办清单和网页搜索光轨。

这个设定的目标很简单：让 TaoPi 更容易被记住、截图和传播，同时不把一个轻量命令行工具包装得太重。

<p align="center">
  <img src="assets/taopi-header-observatory.png" alt="在月下观测站导航终端面板的 PiPi" width="49%">
  <img src="assets/taopi-header-maker-desk.png" alt="在明亮创作者工作台举着终端方块的 PiPi" width="49%">
</p>

## 快速开始

需要准备：

- Bun
- 兼容 Node 的命令行环境
- 模型供应商的 API Key

安装依赖：

```bash
bun install
```

写入全局默认配置：

```bash
bun run dev -- setup
```

也可以先用环境变量快速启动：

```bash
cp .env.example .env
# 编辑 .env，填入模型供应商、模型和 API Key
```

进入交互式会话：

```bash
bun run dev --
```

启动时直接提问：

```bash
bun run dev -- "帮我理解这个项目的结构"
```

只运行一次并打印结果：

```bash
bun run dev -- --print "总结 src/index.ts 做了什么"
```

继续最近一次会话：

```bash
bun run dev -- --continue
```

恢复指定会话：

```bash
bun run dev -- --resume <session-id>
```

## 配置

TaoPi 按下面的优先级读取配置：

1. 命令行参数
2. 环境变量
3. `~/.tao/config.toml`
4. 内置默认值

常用配置：

```bash
PI_PROVIDER=openai
PI_MODEL=gpt-4.1-mini
PI_API_KEY=your_api_key
PI_BASE_URL=https://your-openai-compatible-endpoint.example/v1
PI_TIMEZONE=Asia/Shanghai
PI_SESSION_DB=.pi-sessions.sqlite
PI_PLUGINS=todo,memory,skills
```

Firecrawl 是可选能力：

```bash
FIRECRAWL_API_KEY=fc-your_firecrawl_api_key
FIRECRAWL_BASE_URL=https://api.firecrawl.dev
```

临时覆盖模型配置：

```bash
bun run dev -- --provider deepseek --model deepseek-v4-flash
bun run dev -- --base-url http://localhost:11434/v1 --model local-model
bun run dev -- --debug
```

## 交互命令

在交互式会话中可以使用：

- `/help` 查看命令。
- `/session` 查看当前会话、模型、工具、插件和上下文。
- `/clear` 清空终端。
- `/exit` 退出会话。

插件也可以添加更多斜杠命令。例如技能插件会把发现的技能暴露为斜杠命令。

## 项目结构

```text
src/
├── index.ts              # 组合根
├── agent/                # 模型配置、提示词、项目上下文、流式事件
├── cli/                  # 参数解析、终端界面、斜杠命令、TUI 循环
├── persistence/          # 基于 SQLite 的会话存储
├── plugins/              # 可选运行时能力
├── tools/                # 文件、命令、待办和 Firecrawl 工具适配器
└── utils/                # 共享工具函数
```

测试目录 `test/` 与源码目录保持对应。

## 开发

运行测试：

```bash
bun run test
```

运行类型检查：

```bash
bun run typecheck
```

通过 `tsx` 启动命令行：

```bash
bun run dev -- [options] [prompt]
```

用 Bun 构建独立 CLI 可执行文件：

```bash
bun run build:cli
./dist/tao-pi --help
```

生成的 `dist/tao-pi` 二进制文件会面向当前操作系统和 CPU 架构。

请不要提交运行时数据，包括 `.env`、`.pi-sessions.sqlite`、`node_modules/`
以及本地生成的记忆和会话文件。

## 参与贡献

如果使用本地议题流程，议题和项目记录会放在 `.scratch/` 下。提交改动前请运行：

```bash
bun run test
bun run typecheck
```

也请阅读 [行为准则](CODE_OF_CONDUCT.md)。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
