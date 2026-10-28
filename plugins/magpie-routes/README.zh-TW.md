# Magpie 路由

在 Token Monitor 查看本機 Magpie 的即時路由、上下文摘要及近期請求。

### 主視窗

![主視窗](docs/images/page.png)

### 瀏海面板

![瀏海面板](docs/images/notch.png)

### 側邊欄

![側邊欄](docs/images/edge-dock.png)

## 相容性與安裝

需要 **Token Monitor 0.81.0 或更新版本**。安裝 Token Monitor，並在同一台電腦運行 Magpie。在 **設定 → 外掛 → 從檔案安裝** 匯入完整外掛資料夾或 `.tmplugin`，檢視後啟用。使用者無須另裝 Node.js。瀏海面板 適用於支援該功能的 Mac。

## 顯示位置

**主頁**：路由圖、決策敘述、時間分佈、上下文與近期請求。選取請求可固定查看，再返回即時。

**瀏海面板**：使用宿主頂部操作區顯示即時路由、Agent 篩選、帳號打碼及統計；需要支援此功能的 macOS 宿主。

**側邊欄**：窄欄顯示圖示與請求數，展開卡片查看路由及帳號列表。

首次安裝建議這三個位置，可在安裝確認中修改或清空。更新保留原有位置，不會自動開啟 瀏海面板、Dock 或背景執行。

## 設定與使用

在外掛設定選擇連接埠。保留 `0` 會讀取 Magpie 設定中的連接埠；未設定時使用 `3425`。

帳號名稱預設打碼，選項會同步到各個介面。可選取近期請求固定查看，或返回即時檢視。Magpie 離線時保留最後資料，並自動嘗試重新連接。

介面支援英文、繁體中文與簡體中文，其他 App 語言使用英文。

## 資料與執行

外掛從本機 Magpie 讀取路由、並行狀態與上下文 metadata，不發送模型請求、不讀取請求／回應正文、不修改 Magpie 帳號或路由設定，亦不將路由歷史保存到磁碟。

帳號打碼僅影響顯示，metadata 可能包含工具名稱或檔案路徑。外掛以本機使用者權限執行。

## 授權與維護

Token Monitor 社群整合，**並非 Magpie 官方產品**。部分程式與圖像改編自 [yetone/magpie](https://github.com/yetone/magpie)。原創程式採 [MIT](LICENSE)，上游來源與授權詳見 [SOURCE-NOTICE.md](SOURCE-NOTICE.md) 及 [MAGPIE-LICENSE.txt](MAGPIE-LICENSE.txt)。

[版本記錄](CHANGELOG.zh-TW.md) · [所有外掛](../../README.zh-TW.md)
