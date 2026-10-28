<p align="right">
  <a href="./README.md">EN</a> | <a href="./README.zh-CN.md">简</a> | <strong>繁</strong> | <a href="./README.ko.md">KO</a> | <a href="./README.ja.md">JA</a> | <a href="./README.pt-BR.md">PT</a>
</p>

<div align="center">
  <img src=".github/assets/app.png" alt="Token Monitor 社群外掛" width="120">
  <h1>Token Monitor 社群外掛</h1>
  <p><em>選裝擴充，獨立於主程式發版。</em></p>
</div>

## 關於

為 [Token Monitor](https://github.com/Javis603/token-monitor) 維護的社群外掛。每個外掛有獨立版本、README、相容要求與授權聲明。

| 外掛 | 說明 | 版本 |
| --- | --- | --- |
| [Magpie Routes](plugins/magpie-routes/README.zh-TW.md) | 查看本機即時路由與上下文。 | `0.1.0` |

## 安裝

在 **設定 → 外掛 → 從檔案安裝** 匯入完整外掛資料夾或 `.tmplugin`，檢視內容後啟用。支援的 App 版本、平台與設定見各外掛 README。使用者無須另裝 Node.js。

## 開發

開發工具需要 Node 22.15+，沒有 npm runtime 依賴。建置重用 Token Monitor checkout 的套件驗證器；`--local-only` 只產生測試包，不會發布。

```sh
npm test
npm run check -- --host /path/to/token-monitor
npm run build -- --host /path/to/token-monitor --local-only
```

## 文件

- [維護與發布](docs/releasing.md)
- [驗證範圍](docs/verification.md)
- [版本記錄](plugins/magpie-routes/CHANGELOG.zh-TW.md)

## 授權

原創程式與文件採 [MIT](LICENSE)。第三方授權與來源見 [NOTICE](NOTICE.md)。
