<p align="right">
  <a href="./README.md">EN</a> | <strong>简</strong> | <a href="./README.zh-TW.md">繁</a> | <a href="./README.ko.md">KO</a> | <a href="./README.ja.md">JA</a> | <a href="./README.pt-BR.md">PT</a>
</p>

<div align="center">
  <img src=".github/assets/app.png" alt="Token Monitor 社区插件" width="120">
  <h1>Token Monitor 社区插件</h1>
  <p><em>可选扩展，独立于主程序发布。</em></p>
</div>

## 关于

为 [Token Monitor](https://github.com/Javis603/token-monitor) 维护的社区插件。每个插件有独立版本、README、兼容要求和授权声明。

| 插件 | 说明 | 状态 |
| --- | --- | --- |
| [Magpie Routes](plugins/magpie-routes/README.zh-CN.md) | 查看本机实时路由与上下文。 | `0.1.0` |

## 安装

在 **设置 → 插件 → 从文件安装** 中导入完整插件文件夹或 `.tmplugin`，查看内容后启用。支持的 App 版本、平台和配置见各插件 README。用户无需另装 Node.js。

## 开发

开发工具需要 Node 22.15+，没有 npm runtime 依赖。构建复用 Token Monitor checkout 的套件验证器；`--local-only` 只生成测试包，不会发布。

```sh
npm ci --ignore-scripts
npm test
npm run check -- --host /path/to/token-monitor
npm run build -- --host /path/to/token-monitor --local-only
```

## 文档

- [维护与发布](docs/releasing.md)
- [验证范围](docs/verification.md)
- [版本记录](plugins/magpie-routes/CHANGELOG.zh-CN.md)

## 授权

原创代码及文档采用 [MIT](LICENSE)。第三方授权与来源见 [NOTICE](NOTICE.md)。
