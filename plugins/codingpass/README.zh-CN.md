# CodingPass

在 Token Monitor 的额度（Limits）视图中显示 [CodingPass](https://codingpass.ai) 的 5 小时、每周、每月额度用量和重置时间，并显示套餐名称、本期结束日期、额度重置次数和按量钱包余额。

这是非官方集成。CodingPass 没有可用 API Key 查询额度的接口，插件使用你的浏览器登录 Cookie 读取 `codingpass.ai/app` 控制台同样使用的接口。网站更新可能导致插件失效。

## 兼容性与安装

需要 **Token Monitor 0.88.0 或更新版本**。已在 Windows 11 测试，macOS 和 Linux 未测试。

在 **设置 → 插件 → 探索** 中安装；也可以在 **设置 → 插件 → 从文件安装** 中导入 `.tmplugin` 文件或完整插件文件夹。查看后启用。

## 设置

1. 打开 **设置 → AI 工具额度**，勾选 **CodingPass** 并展开。
2. 在浏览器登录 `https://codingpass.ai/app`，按 F12 打开开发者工具 → **网络（Network）**，刷新页面。
3. 点击名为 `usage`（或 `state`）的请求，在 **请求标头（Request Headers）** 中复制完整的 `Cookie` 值。
4. 粘贴到 **控制台 Cookie 请求头** 并保存。插件会自动验证，状态显示 **已连接** 即成功。

之后额度页会显示 5 小时、每周、每月三个窗口。没有上限的窗口以备注显示而不是进度条；5 小时窗口在有请求开启它之前不显示重置时间。如果状态变为 **凭证被拒绝** 或 **凭证已过期**，说明网站登录已失效，请重新复制 Cookie。

## 数据与访问

- 网络：只访问 `https://codingpass.ai`，仅在 Token Monitor 可见的额度界面请求读数或你验证 Cookie 时发起。

  | 请求 | 用途 |
  | --- | --- |
  | `GET /api/auth/state` | 验证 Cookie（返回 `userId` 表示已登录） |
  | `POST /api/app/usage` | 额度窗口、实时计数、订阅信息 |
  | `POST /api/app/wallet` | 按量钱包余额（可选） |

- 凭据：你粘贴的 Cookie 请求头。Token Monitor 以**未加密**形式保存在本机，插件只把它发送到 codingpass.ai。它等同于你的登录状态，请勿分享。
- 插件不读取本地文件，也不向其他地方发送任何数据。

## 许可证

[MIT](LICENSE)。CodingPass 是第三方服务，其名称和标志仅用于标识该服务，不代表其认可。
