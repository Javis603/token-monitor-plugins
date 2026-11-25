# CodingPass

在 Token Monitor 的額度（Limits）視圖中顯示 [CodingPass](https://codingpass.ai) 的 5 小時、每週、每月額度用量和重設時間，並顯示方案名稱、本期結束日期、額度重設次數和按量錢包餘額。

這是非官方整合。CodingPass 沒有可用 API Key 查詢額度的介面，外掛使用你的瀏覽器登入 Cookie 讀取 `codingpass.ai/app` 控制台同樣使用的介面。網站更新可能導致外掛失效。

## 相容性與安裝

需要 **Token Monitor 0.88.0 或更新版本**。已在 Windows 11 測試，macOS 和 Linux 未測試。

在 **設定 → 外掛 → 探索** 中安裝；也可以在 **設定 → 外掛 → 從檔案安裝** 中匯入 `.tmplugin` 檔案或完整外掛資料夾。檢視後啟用。

## 設定

1. 開啟 **設定 → AI 工具額度**，勾選 **CodingPass** 並展開。
2. 在瀏覽器登入 `https://codingpass.ai/app`，按 F12 開啟開發者工具 → **網路（Network）**，重新整理頁面。
3. 點選名為 `usage`（或 `state`）的請求，在 **請求標頭（Request Headers）** 中複製完整的 `Cookie` 值。
4. 貼到 **控制台 Cookie 請求標頭** 並儲存。外掛會自動驗證，狀態顯示 **已連接** 即成功。

之後額度頁會顯示 5 小時、每週、每月三個視窗。沒有上限的視窗以備註顯示而不是進度條；5 小時視窗在有請求開啟它之前不顯示重設時間。如果狀態變為 **憑證被拒絕** 或 **憑證已過期**，代表網站登入已失效，請重新複製 Cookie。

## 資料與存取

- 網路：只存取 `https://codingpass.ai`，僅在 Token Monitor 可見的額度介面請求讀數或你驗證 Cookie 時發起。

  | 請求 | 用途 |
  | --- | --- |
  | `GET /api/auth/state` | 驗證 Cookie（回傳 `userId` 表示已登入） |
  | `POST /api/app/usage` | 額度視窗、即時計數、訂閱資訊 |
  | `POST /api/app/wallet` | 按量錢包餘額（選用） |

- 憑證：你貼上的 Cookie 請求標頭。Token Monitor 以**未加密**形式儲存在本機，外掛只會把它傳送到 codingpass.ai。它等同於你的登入狀態，請勿分享。
- 外掛不讀取本機檔案，也不向其他地方傳送任何資料。

## 授權

[MIT](LICENSE)。CodingPass 是第三方服務，其名稱和標誌僅用於識別該服務，不代表其認可。
