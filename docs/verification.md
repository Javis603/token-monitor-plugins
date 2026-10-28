# 驗證計畫

自動測試與手動 App 驗收分開記錄，不把 synthetic fixture 宣稱為 live Magpie 或跨平台接受測試。

## 自動測試

- Magpie：loopback JSON 讀取、重新導向拒絕、取消請求、trace metadata 投影、敏感正文不進入 renderer、帳號打碼及固定請求選擇。
- Repo：manifest source paths、imports、identity PNG及完整套件。
- Electron fixture：真實 renderer、來源文字與 identity 圖示；主頁／Dock／Notch layouts 使用合成狀態驗證，沒有讀取個人資料。另覆蓋 Notch 縮放中掛載、關閉重開、切頁及 CSS zoom，檢查 SVG 座標、雀仔比例與連線對齊。

- 發布摘要：對應版本選取、重複／缺漏版本、空內容／超長摘要，以及六語套件內容讀取。實際打包 → catalog → 宿主 parser 另核對摘要來自套件 bytes、工作區後續修改不影響摘要，以及改包／本機測試包被拒絕。

## 重現本機 Chromium 檢查

在有 Electron 的 Token Monitor 開發 checkout 上執行：

```sh
TOKEN_MONITOR_CHECKOUT=/path/to/token-monitor \
  /path/to/token-monitor/node_modules/.bin/electron tests/ui-smoke.cjs
```

它使用獨立 profile、真實插件模組與宿主 renderer，所有測試截圖及結果輸出至 `_local/verification/`，不覆蓋插件 README 的維護者實際截圖，不需要額外私人素材。這不是正式 App 安裝／升級驗收。

## App 手動接受測試

1. 使用獨立 profile 安裝精確 `.tmplugin`，檢視版本、來源、初始位置及停用安裝。
2. 在支援 headerActions 的宿主啟用 Magpie Routes，檢查主頁、窄視窗、獨立視窗、Notch、Dock 操作區與帳號打碼同步。實際 gateway 的連線／離線／重連應另測。
3. 隱藏、減少動態、停用、更新及卸載後沒有殘留動畫／請求；主程式其他插件不受影響。
4. 更新舊版至候選版本，既有 ID、配對、資料及位置保留。原始資料不能為了修復 manifest 而刪掉。

正式公開前補齊實際支持的 App 版本、OS／架構及 packaged acceptance 結果。沒有做過的格子保留未驗證，不沿用舊日誌冒充本輪結果。
