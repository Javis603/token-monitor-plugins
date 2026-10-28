# 維護與發布

每個插件放在 `plugins/<id>/`，使用自己的 manifest SemVer、README、CHANGELOG 及授權文件。首次公開版為 `0.1.0`；首次版本記錄介紹功能，後續版本才列出新增、變更與修正。

## 自動發布

`main` 更新後，GitHub Actions 的 **Publish plugin catalog** 會自動執行；產物沒有變化就不新增分發 commit。也可以在 Actions 頁面選擇此 workflow，從 `main` 手動執行 **Run workflow**。

1. 執行來源測試及檢查。
2. 以固定 Token Monitor commit 的正式 manifest／package／catalog 工具驗證、打包並產生 SHA-256。宿主依賴用 `npm ci --ignore-scripts` 安裝，不啟動 App 或下載 tokscale。
3. Build job 上傳產物；具備 `contents: write` 的 publish job 下載同一次 run 的產物。
4. 更新 `dist` 分支的 `catalog.json` 和 `.tmplugin`，以一般 fast-forward push 發布。來源已落後 `main` 的 run 會跳過，並行發布會序列化。

首次成功執行會建立 `dist`，不需要先手動推送。流程使用 GitHub 提供的 `GITHUB_TOKEN`，不需要新增 PAT。它不建立 GitHub Release、不發布 npm，也不修改 Token Monitor App。

Catalog URL：`https://raw.githubusercontent.com/Javis603/token-monitor-plugins/dist/catalog.json`。套件與目錄同一次 commit 發布，使用直接回傳 bytes 的 raw URL；宿主不跟隨 Release 下載重新導向。

已發布套件不可覆蓋。同版本相同 bytes 可以重跑；同版本不同 bytes 會停止，須先提升該插件的版本。新目錄保留較舊版本與套件，供版本選擇及恢復使用。首次公開前的本機候選修改可以維持 `0.1.0`，不用為準備過程逐次升版。

## 更新插件

修改插件後更新其 manifest 版本及六語 CHANGELOG，同步 README。使用 `context.headerActions` 的 Magpie Routes 最低宿主為 **0.81.0**；manifest 與 catalog 的相容範圍須一致。更改最低版本時同步 workflow 的 `--app-range`。固定宿主 commit 的更新應另行驗證，不自動追蹤浮動版本。

來源檢查與打包不能取代實際 App 安裝和 gateway 驗收。發布前確認支援的正式宿主版本可用，並在獨立 profile 驗證，不動既有本機插件或設定。

## 本機檢查與打包

```sh
npm test
npm run check -- --host /path/to/token-monitor
npm run build -- --host /path/to/token-monitor --local-only
```

`dist/local-only/` 只供測試，不進公開目錄。公開打包不帶 `--local-only`，輸出至 `dist/release/`；build 拒絕覆蓋同名輸出，重跑前使用新的輸出目錄。

```sh
npm run build -- --host /path/to/token-monitor
npm run catalog -- --host /path/to/token-monitor --app-range '>=0.81.0' \
  --base-url https://raw.githubusercontent.com/Javis603/token-monitor-plugins/dist/ \
  --repository https://github.com/Javis603/token-monitor-plugins
```

這些命令只產生本機檔案；實際公開由 Actions 的最後 push 完成。

## README 與更新內容

根 README 介紹外掛集合，保留品牌頁首與六語入口。插件 README 使用純 Markdown，不重複語言列或 logo；截圖及用法放在各自目錄，由 App 的 `readmePaths` 選取語言。來源品牌由宿主決定，作者欄保留作者身份。

完整更新歷史放在 `plugins/<id>/CHANGELOG.md` 及對應的 zh-CN、zh-TW、ko、ja、pt-BR 檔案。每版以 `## <version>` 開始，每種語言提供 1–2000 字元的使用者純文字摘要。catalog 工具從已核對 SHA-256 的套件讀取對應版本，寫入 `versions[].changelog`；不從後來的工作區替舊包補寫內容。App 顯示此欄位，不直接掃描 CHANGELOG。

## 新增插件與授權

在 `scripts/common.mjs` 的 `ids` 明確收錄已準備好公開維護的插件，加入 manifest、六語 README／CHANGELOG、測試與實際能力類型。不要把本機實驗或私人資料放進 Git。

保留來源所需的 LICENSE、MAGPIE-LICENSE.txt、SOURCE-NOTICE.md 及上游署名；使用者 README 只介紹授權和來源，不放內部維護指示。
