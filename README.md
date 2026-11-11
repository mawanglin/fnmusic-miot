# fnmusic-miot

小米 / 红米智能音箱（小爱音箱）控制层，**原生运行于 fnOS（飞牛音乐）**，不依赖 Docker。

把「飞牛音乐」当成曲库与取流源，让局域网里的小爱音箱能直接点播本地歌曲、收藏、音乐库，并通过语音口令播控。需要在线音源（QQ / 网易 / 酷狗 / 酷我）时，可选安装 `fnmusic-ext` 作为增强层；**不装也完全可用**（仅缺少在线榜单与在线流）。

## 功能特性

- 设备管理、在线状态、播放 / 暂停 / 上下首 / 音量 / 拖动进度条
- 语音口令：点播（`播放晴天`）、控制（`音量调到 30`）、自定义口令词（中文无乱码）
- 本地曲库视图：收藏、各音乐库、全部歌曲；在线榜单（需 `fnmusic-ext`）
- **语音搜索与面板搜索都直接接入飞牛音乐搜索**，无需额外配置搜索源：面板搜索框输入后弹出飞牛全库结果（本地 + `fnmusic-ext` 在线音源），点击即播，播放链路复用 `/api/v1/songs/:id/play?access_token=…` + `/mina/play-url`；后端由 `/compat/library-search?full=1` 提供完整候选（要求同源网关注入的 Bearer 令牌）
- DLNA 投放、封面 / 歌词
- fnOS 桌面「独立 app」入口；**显示比例固定 100%**；顶栏不显示标题文字，改为**定制连接图标（内嵌 PNG）+ 三个状态圆点**：音箱（红/蓝/绿 = 断开/待机/播放中）、控制层（红/绿 = 断开/在线）、曲库（红/绿，带歌曲数 = 未连接/已索引）。三个圆点下移 4px，与图标中间两根短竖条的垂直中心对齐；圆点悬停显示提示，图标无提示，全部去掉 help 问号光标；主题切换并入应用栏「选择设备」之前；无工具条、无缩放/刷新/全屏按钮；`/console` 为兼容跳转
- 桌面布局：圆形「继续播放」(44px) / 歌单选择器 / 搜索栏 (240px) 同排同高（「继续播放」移到歌单框之前），剩余宽度全部给歌单框；搜索栏去掉占位文字但输入文字清晰可见；底部收缩播放器的已播时长在进度条前端、总时长在末端，控制图标垂直居中
- 手机端：工具行三个控件压成一行且**全部 44px 同高**（继续播放圆钮 / 歌单框 / 搜索圆钮，「继续播放」在最前）；点圆形搜索会展开**铺满整行、同为 44px**、完全盖住下层歌单框的输入框，点外部收起；窄屏下把搜索输入字号锁为 16px 并收紧 viewport（仅手机/窄屏），避免 iOS 聚焦输入时自动放大页面；收缩播放条与全屏播放器底部控件各上移 20px 避开屏幕圆角和 homebar，**列表 20px 底部留白、播放条、播放条下方留白统一为 `#f8f8fc`**（暗色主题回落到 `--md-surface`）；全屏主播放键为 60px 正圆并隐藏「左滑看歌词 / 右滑看封面」提示
- 触屏按压反馈（手机 / 窄屏）：去掉 iOS 点击高亮与 M3 `:hover` 残留的灰色圆底，改为**按下时图标变主题色 `--md-primary`**；紫底白图标的主播放键按下时改浅紫底 + 紫色图标；用 `.pt-pressed` 类兜底 iOS 上纯 CSS `:active` 不触发的问题，松开约 110ms 后恢复。桌面端不受影响
- AI 对话「播报结束未确认」的终态残留提示会自动隐藏并清理后端状态；应用图标为**正圆形透明底**的紫粉渐变音箱图标（2.2.1 起，`ui/images/miot_256.png`、`miot_64.png`、`ICON*.PNG` 与 `static/icon.*` 同源）

## 架构

| 目录 | 作用 |
|---|---|
| `miot-service/` | 控制层：Node 宿主（`host/`）、飞牛音乐适配（`adapter/`）、构建产物（`bundle/main.js`）、Vue 面板（`frontend/` → 构建到 `static/`） |
| `nodeconsole/` | 零依赖 Node 网关（替代旧 Python FastAPI 版 `webui/`）；`static/console.html` 仅保留 `/console` 兼容跳转 |
| `runtime/` | systemd 进程守护（`start.mjs`） |
| `packaging/fpk/` | fnOS 应用中心安装包定义（`manifest.in`、`build.sh`、`wizard/`、`cmd/`） |

控制层经本机 `trim_music` unix socket 读写飞牛音乐 API；面板经 8776 网关与 8775 控制层通信，token 由服务端注入，浏览器不持有。

## 上游项目

本项目基于上游开源项目 **[songloft-org/songloft-plugin-miot](https://github.com/songloft-org/songloft-plugin-miot)** 衍生而来，复用了其 miot 控制层的核心思路与协议适配，并针对 fnOS（飞牛音乐）做了原生运行化改造（去 Docker、去 Python 依赖、接入飞牛音乐搜索与取流）。

- 上游仓库：<https://github.com/songloft-org/songloft-plugin-miot>
- 若你希望使用通用（非飞牛音乐定制）的小爱音箱控制方案，请直接参考上游项目。

> **本项目不使用 Songloft 宿主，也不使用 `.jsplugin.zip` 插件格式**：交付物只有 fnOS 独立应用（`.fpk`）。上游的插件机制仅作为控制逻辑的来源参考；飞牛音乐本身没有可嵌入自定义 UI 页面的插件扩展点。早期实验性的「Songloft 薄壳插件」已废弃并移除，请勿在任何 Release 中安装它。

## 依赖

- **必需**：飞牛音乐（`trim.music`）本体
- **随包附带，无需另装**（按架构分 `x86` / `arm` 两个包，装在应用目录 `opt/`）：

  | 依赖 | 版本 | 用途 |
  |---|---|---|
  | Node.js | v24 LTS（官方二进制，仅 `node` 本体） | 控制层与控制台网关运行时 |
  | Python | 3.12（python-build-standalone，精简版） | `fnmusic_token.py` 读取飞牛音乐登录会话（标准库 sqlite3） |
  | ffmpeg / ffprobe | 7.0（静态构建） | WMA / APE 等格式转码、变速、探针 |

  下载时校验官方 SHA-256 / md5。systemd 单元与守护进程把 `opt/bin` 放在 `PATH` 最前，并通过 `.env` 的 `FFMPEG_BIN` / `FFPROBE_BIN` 指向随包 ffmpeg；安装时不再要求应用中心装 Node.js。
- **可选增强**：`fnmusic-ext` —— 提供在线音源、在线榜单、边听边存

> miot 本身不打包任何 Python / npm 第三方依赖，反代与控制台均为零 npm 依赖的 Node 实现。

## 安装（推荐：fnOS 应用中心）

按 NAS 架构下载对应的包（x86 用 `-x86`，ARM 用 `-arm`），在 fnOS 应用中心「安装本地应用」即可：

- `fnmusic-miot-<version>-x86.fpk`
- `fnmusic-miot-<version>-arm.fpk`

安装时会自动检测飞牛音乐；`fnmusic-ext` 为可选，未安装将自动降级为纯本地曲库模式。

## 从源码构建

```bash
packaging/fpk/build.sh              # x86 + arm，产物在 dist/（只保留最新 2 个版本）
packaging/fpk/build.sh --arch x86   # 只打一个架构
```

脚本会在缺少 `miot-service/bundle`、`static` 时自动执行 `npm install` 与 `npm run build:all`，并下载随包依赖（缓存在 `packaging/fpk/.cache/`）。需要 bash、curl、rsync、npm、tar/xz。也可单独构建控制层：

```bash
cd miot-service && npm install --no-audit --no-fund && npm run build:all
```

`bundle/` 与 `static/` 为构建产物，已被 `.gitignore` 忽略。`miot-service/src/data/`（拼音表、节假日、口令表）取自 songloft-plugin-miot，**必须入库**：此前 `miot-service/.gitignore` 的 `data/` 把它误忽略，导致干净克隆无法编译。

## 飞牛音乐网关地址（自动探测，三层兜底）

本应用经 fnOS 的 HTTP 网关访问飞牛音乐，网关端口因机器而异（常见 5666，可被改动）。端口不对会表现为「歌曲加载失败 fetch failed」，所以做了三层保护：

1. **安装时**：先读 `/usr/trim/etc/network_gateway_setting.conf`，再用 `miot-service/scripts/detect-gateway.mjs` 实地验证——逐个端口请求 `/music/api/v1/initialization/state`，只有返回飞牛音乐特有的 JSON（数字 `code` + `data.initialized`）才采信，不会误连别的 HTTP 服务。
2. **运行中**：请求飞牛音乐连接失败（拒绝 / 超时 / 解析失败）时，自动重新探测并切换地址、重试一次（15 秒内不重复探测），并刷新曲库索引。
3. **设置页**：探测不到时，主界面顶部和「歌曲加载失败」处会直接提示原因并引导到 **设置 → 飞牛音乐**，可「自动探测」「测试连接」「保存」；保存后立即生效，无需重启。手动保存的地址（`<数据目录>/fnmusic-gateway.json`）优先于自动探测与 `.env`，不会被自动覆盖；「恢复自动探测」可清除。

相关接口（需令牌）：`GET /fnmusic/status`、`POST /fnmusic/test`、`/fnmusic/detect`、`/fnmusic/config`。探测逻辑与测试见 `miot-service/host/gateway.mjs`、`miot-service/tests/gateway.test.mjs`（`npm test`）。

## 配置

- 语音口令、设备绑定、播放偏好等均在控制台 UI 内配置，持久化于应用数据目录
- 无 `fnmusic-ext` 时：在线榜单与在线流自动隐藏，其余功能不受影响
- 调试端点：`http://<NAS>:8775/compat/status`、`/compat/library-search?q=关键词`

## 开源协议

[MIT](./LICENSE)。
