# Meet 会议助手

**简体中文** | [English](README.en.md)

Chrome 侧栏为 Google Meet 提供双语字幕和中译英发言。你可以只看字幕、只开同传，也可以同时使用两者。接收方使用普通 Meet 客户端即可。本文的音频路由按 macOS 和 BlackHole 2ch 编写。

| 功能 | 输入 | 输出 | 所需服务 |
| --- | --- | --- | --- |
| 双语字幕 | Meet 标签页播放的远端声音 | 实时原文，每句定稿后在下方显示中文译文 | 豆包流式语音识别 2.0 + 火山方舟文本模型 |
| 中译英发言 | 你选择的真实麦克风 | 保留说话人音色的英文语音，经 BlackHole 输入 Meet | 豆包同声传译 2.0 |

## 1. 安装本地代理

准备 Git、Node.js 22.9 或更高版本、npm 和桌面版 Chrome 116 或更高版本。在终端运行：

```sh
git clone https://github.com/Xiapiiiii/meet-assistant.git
cd meet-assistant
npm ci
npm start
```

看到 `Meet 助手 http://127.0.0.1:18767` 后，在浏览器打开 [本机状态页](http://127.0.0.1:18767/) 确认代理就绪。会议期间保持这个进程运行；按 Ctrl+C 退出。重启电脑后，在仓库目录重新运行 `npm start`。

## 2. 加载 Chrome 扩展

打开 `chrome://extensions`，开启右上角「开发者模式」，点「加载已解压的扩展程序」，选择克隆目录下的 **extension** 文件夹。这个目录直接包含 manifest.json，无需构建。可以在 Chrome 的拼图菜单里固定「Meet 会议助手」。

## 3. 开通火山服务并配置 Key

**豆包语音**：进入需要使用的资源项目，在「开通管理」按需启用「流式语音识别 2.0」（字幕默认使用小时版）和「同声传译 2.0」（语音到语音），再到同一项目的 API Key 页面创建密钥。控制台会显示当前免费额度、计费方式和开通条款。[语音开通管理](https://console.volcengine.com/speech/new/setting/activate?projectName=default) · [语音 API Key](https://console.volcengine.com/speech/new/setting/apikeys?projectName=default)

**火山方舟**：双语字幕使用北京区方舟文本模型翻译定稿。开通默认模型 Doubao-Seed-2.1-pro，或配置项目内已有权限的兼容模型。在同一项目创建可调用该模型的方舟 Key。只使用中译英发言时可以留空。[模型开通管理](https://console.volcengine.com/ark/region:cn-beijing/openManagement) · [方舟 API Key](https://ark.volcengine.com/region:cn-beijing/apikey)

**在插件中填写**：点扩展图标打开侧栏 → **API 设置**，或从扩展详情打开「扩展程序选项」。两栏默认遮住当前生效的密钥，点眼睛可以分别查看或隐藏。直接编辑后点「保存」即可替换；删空某栏再保存即清空该 Key。重新开始监听或同传时生效。

### 可选的环境变量

**查看剩余额度**：API 设置页面打开、保存或点击「刷新额度」时会查询官方数据。语音显示项目内识别、同传的预付资源包余量，方舟显示当前基础模型的初始免费推理 tokens。另列查询凭证所属账号的可用余额；同账号的两项服务共享这笔资金。资源包为空时仍可能按后付费使用。剩余资源不超过 10% 或可用余额不超过 ¥10 时在设置页标红。关闭页面后不会后台通知。

在代理的 `.env` 中填写只读 IAM 用户的 `QUOTA_AK`、`QUOTA_SK`，授权 `speech_saas_prod:ResourcePacksStatus`、`ark:GetModelActivation` 和 `billing:QueryBalanceAcct` 三个查询操作。普通语音和方舟推理 Key 用于会议调用。管理凭证仅由代理读取；保存后点击「刷新额度」即可。请确保管理凭证和服务 Key 属于同一主账号，代理无法通过推理 Key 自动核对归属。

若两项服务属于不同主账号，在同一文件分别设置 `SPEECH_QUOTA_AK`、`SPEECH_QUOTA_SK` 和 `ARK_QUOTA_AK`、`ARK_QUOTA_SK`。语音资源项目通过 `SPEECH_QUOTA_PROJECT` 指定，默认 default；自定义推理接入点请用 `ARK_QUOTA_MODEL` 指定基础模型名称。

常规安装只需在扩展设置里填 Key。要指定方舟模型或语音资源，在项目根目录运行 `cp -n .env.example .env` 并编辑 `.env`：

| 变量 | 用途与默认值 |
| --- | --- |
| `SPEECH_API_KEY` | 豆包语音凭证；也可在插件中设置 |
| `ARK_API_KEY` | 方舟文本模型凭证；也可在插件中设置 |
| `ARK_MODEL` | 默认 `doubao-seed-2-1-pro-260915`。可改为已开通且支持 Chat Completions 和关闭深度思考的模型或推理接入点 ID |
| `SPEECH_RESOURCE_ID` | 字幕默认小时版 `volc.seedasr.sauc.duration`；购买并发版时填 `volc.seedasr.sauc.concurrent` |

同传使用固定资源 `volc.service_type.10053`。Key 的读取优先级为插件保存值（包括显式清空）、进程环境变量、`.env`。模型与识别资源从环境变量、`.env` 或代码默认值读取。

## 4. 使用双语字幕

1. 加入 Google Meet，停留在会议标签页，打开扩展侧栏并点「开始监听」。
2. 在 Chrome 共享选择器中选择该 **Chrome 标签页**，勾选「共享标签页音频」，点「共享」。
3. 对方说话时原文会逐步更新，定稿后的中文翻译出现在对应原文下方。多人说话和共享媒体使用同一条混合音轨。字幕区保留最近 64 句。
4. 点「停止」结束转写并等待最后的译文。下一次开始监听会清空旧字幕。

## 5. 使用中译英发言（macOS）

在 Mac 安装 [BlackHole 2ch](https://github.com/ExistentialAudio/BlackHole)。已安装 Homebrew 时可运行：

```sh
brew install --cask blackhole-2ch
```

按安装提示重启 Mac，再启动本地代理。要确认系统识别设备，可在「音频 MIDI 设置」中查找 BlackHole 2ch。

| 在哪里设置 | 选哪个设备 |
| --- | --- |
| 插件侧栏 → 原声麦克风 | Mac 内置麦克风或你实际使用的耳麦 |
| Meet → 设置 → 音频 → 麦克风 | BlackHole 2ch |
| Meet → 设置 → 音频 → 扬声器 | 耳机；系统默认输出也选耳机 |

在 Meet 标签页打开侧栏，点 **开始同传**，按提示授权麦克风。出现「同传中」后，解除 Meet 静音，说一句完整中文，等待英文译音。对方收到的音频走你在 Meet 中选定的虚拟麦克风。耳机可避免扬声器播放的其他参会者声音被真实麦克风再次收录。

点 **停止同传** 会停止麦克风采集并清除排队的译音。Meet 的静音按钮只控制是否发给参会者；暂停向同传服务传音频请使用插件按钮。要恢复直接用中文发言，在 Meet 里把麦克风切回物理设备。

## 常见问题

| 现象 | 排查方法 |
| --- | --- |
| 设置页或侧栏连不上本地服务 | 打开本机状态页，检查终端是否运行 `npm start`。更新后重启代理并重新加载扩展 |
| 启动显示 EADDRINUSE | 18767 已被占用。用 `lsof -nP -iTCP:18767 -sTCP:LISTEN` 查明进程。若已有本项目当前版本代理，可以直接使用 |
| 语音服务返回 403 | 核对语音 Key 所属项目、对应服务是否开通，以及识别资源是小时版还是并发版；刚开通可稍后重试 |
| 有原文但翻译失败 | 核对方舟 Key、北京区模型 ID、模型权限和额度。语音 Key 与方舟 Key 需分别配置 |
| 无法采集麦克风 | 在 macOS「系统设置 → 隐私与安全性 → 麦克风」允许 Google Chrome，并在 Chrome 中允许「Meet 会议助手」使用麦克风 |
| 字幕没有声音输入 | 确认共享的是正在播放远端声音的 Meet 标签页，并勾选了「共享标签页音频」 |
| 对方听不到英文 | 检查 BlackHole 2ch 在系统中可见，插件显示「同传中」，Meet 输入选 BlackHole 且已解除静音；插件输入选真实麦克风 |
| 更新扩展 | 在仓库执行 `git pull --ff-only` 和 `npm ci`，重启本地代理，在 `chrome://extensions` 重新加载扩展并打开侧栏 |

## 数据流与凭证保存

本地代理绑定 `127.0.0.1:18767`，WebSocket 校验扩展来源与 Host。字幕模式将所选标签页音频发给豆包语音，定稿文本发给火山方舟；同传模式将所选麦克风音频发给豆包同传，返回的英文 PCM 输出至 BlackHole。请在会议允许转写和翻译时使用。

代理以本机用户权限将插件设置保存为项目根目录的 `.meet-settings.json`（明文，Unix 权限 0600）。代理首次启动时在扩展目录生成 `local-settings-token`，设置页用它验证身份后读取两项密钥。加载的扩展与运行的代理应来自同一项目目录。凭证文件与 `.env` 已加入 Git 忽略规则。音频和字幕在会话内处理，程序默认不写录音文件。

## 开发与验证

```sh
npm ci
npm test
```

测试使用模拟服务和临时目录，无需真实 API Key。可用第二台设备加入测试会议，分别验证远端英语发言是否出现中文字幕，以及本地中文发言是否以英文送到另一端。

扩展界面与 PCM 采集位于 [extension](extension/)。[server.js](server.js) 接收扩展连接，[session.js](session.js) 处理转写与文本翻译，[interpret.js](interpret.js) 处理语音同传，[settings.js](settings.js) 管理凭证。[interpret.proto](interpret.proto) 仅定义本项目实际使用的同传协议字段。[实时语音识别文档](https://docs.volcengine.com/docs/doubao-voice/bidirectional-streaming-automatic-speech-recognition-websocket?lang=zh) · [同传协议文档](https://www.volcengine.com/docs/6561/1756902)

本项目采用 [Apache License 2.0](LICENSE)。
