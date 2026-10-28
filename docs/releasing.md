# 維護與發布

每個插件放在 `plugins/<id>/`，使用自己的 manifest SemVer。首次公開候選為 `0.1.0`；保留 `magpie-routes` ID，發布新版本而不覆蓋已發布套件。

## 本機檢查與打包

```sh
npm test
npm run check -- --host /path/to/token-monitor
npm run build -- --host /path/to/token-monitor --local-only
```

`check` 驗證來源語法、manifest-listed files、相對 imports、PNG identity，以及宿主 manifest parser。打包重用宿主的正式 `packageDirectory`，拒絕覆蓋同名輸出；`packages.json` 記錄套件 SHA-256。

`dist/local-only/` 供獨立 profile 驗證，不進公開目錄。公開候選套件使用不帶 `--local-only` 的 build，輸出至 `dist/release/`；這只產生本地檔案，不代表已發布或已通過正式 App 驗收。

## 發布前

Magpie 所需 `headerActions` 的最低宿主版本為 `0.81.0`；發布前確認此主程式版本可用，完成獨立 App 安裝及實際 gateway 驗收，再填寫經測試的 catalog `engines.tokenMonitor` 範圍、更新該插件的各語言 CHANGELOG。

確定實際 GitHub repo、套件 HTTPS 位置後，才產生目錄。GitHub Release 可供手動下載，但宿主 catalog 不跟隨重新導向，不能假設 Release browser download URL 可直接使用。

```sh
npm run catalog -- --host /path/to/token-monitor --app-range "$TESTED_APP_RANGE" \
  --base-url "$CATALOG_PACKAGE_BASE_URL" --repository "$PLUGIN_REPOSITORY_URL"
```

工具核對套件版本及 SHA-256，並以宿主 catalog parser 驗證，輸出 `dist/release/catalog.json`。沒有真實 URL 時不產生假目錄。此 repo 目前只有來源檢查 CI，沒有自動發布、推送 dist 分支或 npm job。

## 參考與沿用

參考 [magpie-community/plugins README](https://github.com/magpie-community/plugins/blob/main/README.md)、[dist 工具](https://github.com/magpie-community/plugins/blob/main/scripts/dist.mjs) 及 [發布 workflow](https://github.com/magpie-community/plugins/blob/main/.github/workflows/publish.yml)（2026-10-29 核對）：

- 沿用單一 repo、多插件獨立版本／README／測試、集中目錄及發行檔雜湊的分工。
- Token Monitor 用自己的 `manifest.json`、`.tmplugin`、`catalog.json` 及 SHA-256；不用對方的 npm package 格式、Bun workspace 或 SHA-512 index。
- 未來可用獨立 `dist` 分支放不可變套件及目錄，使插件獨立於 App 發版。正式 repo 為 `https://github.com/Javis603/token-monitor-plugins`；`dist` 分支提供套件及 catalog，不建立自動發布流程。

App 目前讀取 repository 根 README，所以根 README 只介紹外掛集合與目錄，各外掛的截圖、用途、相容要求與資料存取放在自己的 README。根 README 提供 EN／简／繁／KO／JA／PT 語言入口；各插件保留六語 README，但不重複語言列與品牌圖示，供宿主依語言選用。更新時同步各語言內容。來源品牌由宿主決定，作者欄保留作者身份。

## 新增插件

加入 `plugins/<id>/`、manifest、各語言 README、LICENSE／來源聲明及測試，在 `scripts/common.mjs` 的 `ids` 明確收錄；按插件能力更新 catalog 的 types。先完成獨立驗收，再加入目錄。只收錄準備好公開維護的插件，不把本機實驗資料放進 Git。

## 授權文件

套件必須包含根據來源所需的 `LICENSE`、`MAGPIE-LICENSE.txt` 與 `SOURCE-NOTICE.md`，不可移除上游署名。公開 README 只說明授權與來源，不放維護操作指示。

Magpie 路由使用 `context.headerActions`；發布前仍須核對提供該介面的最低公開宿主版本及實際安裝結果。此項追蹤留在維護文件，不把內部候選／驗收進度放進使用者 README。

根 README 頁首沿用 Token Monitor 的 GitHub 排版（靠右語言列、置中圖示與標題），HTML 區塊後保留空行，避免吞掉後續 Markdown。現有 App README renderer 禁止原始 HTML；接入逐插件 README 的宿主 PR 須處理這些展示區塊，不能為了排版直接開放任意 HTML。

## 每個版本的更新內容

完整歷史放在 `plugins/<id>/CHANGELOG.md`（英文預設），其他語言使用 `CHANGELOG.zh-CN.md`、`CHANGELOG.zh-TW.md`、`CHANGELOG.ko.md`、`CHANGELOG.ja.md` 與 `CHANGELOG.pt-BR.md`。每版以獨立 `## <version>` 標題開始，例如 `## 0.1.0`，下面寫一般使用者看的純文字摘要，不放 Markdown 標記。每種語言該版摘要上限 2000 字元。

打包前驗證六種語言都有 manifest 對應版本。catalog 工具從已核對 SHA-256 的 `.tmplugin` 內讀取 CHANGELOG，擷取對應版本寫入 `versions[].changelog` 語言對照，不從工作區新內容替舊包補寫摘要。缺漏版本、重複版本或超限時停止，避免顯示錯誤更新內容。

現有 Token Monitor 已在外掛詳情及版本預覽顯示 catalog `changelog`，以純文字呈現；不會掃 repo 資料夾或直接解析 CHANGELOG。此 repo 的工具只產生本地 catalog，沒有新增宿主行為或發布遠端。逐插件 README 及正式來源接入仍由下一個 Token Monitor PR 處理。

新增插件時，將其實際能力寫入 catalog types；目前收錄的 Magpie Routes 類型為 widget 和 page。

插件 README 使用純 Markdown，不放語言導覽或重複 logo。顯示位置名稱與 Token Monitor 各語言的 `settings.notch.title`、`settings.display.edgeDock` 一致；英文保留產品名稱 Notch／Edge Dock。

## 已配置來源

Catalog URL：`https://raw.githubusercontent.com/Javis603/token-monitor-plugins/dist/catalog.json`。套件與目錄一齊放在 dist 分支，套件不覆蓋原有版本；新版本需先確認 GitHub 原始檔 URL 回傳直接 bytes。產生目錄時 `--app-range` 必須與套件 manifest 的 `engines.tokenMonitor` 完全一致。
