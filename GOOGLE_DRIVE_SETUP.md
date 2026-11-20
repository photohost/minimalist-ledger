# 直接 Google 登入＋Google Drive 儲存

v1.7 使用 Google Identity Services 及 Google Drive API，主網站不載入 Firebase SDK，也不使用 Firestore。網站仍由 GitHub Pages 提供。

此指南給網站管理者使用，訪客不需操作 Google Cloud。

## 管理者需要準備什麼

一個 Google Cloud 專案與「網頁應用程式」OAuth 用戶端 ID（結尾 `.apps.googleusercontent.com`）。這個 ID 是公開設定，不是用戶端密碼。可以使用原本 Firebase 專案對應的同一個 Google Cloud 專案，不需要另建 Firebase 或資料庫。

## 1. 啟用 Google Drive API

1. 開啟 https://console.cloud.google.com/ ，選擇你的專案。
2. API 和服務 → 程式庫，搜尋 **Google Drive API**，按啟用。

## 2. 設定 Google Auth Platform

1. 左側 Google Auth Platform → Branding / 品牌資訊（舊介面為 OAuth 同意畫面）。
2. 應用程式名稱填「日常留白記帳」，填你的支援電子郵件與開發者聯絡電子郵件。
3. Audience / 目標對象：個人 Gmail 選 External / 外部。
4. 開發測試階段可維持 Testing / 測試中，在 Test users / 測試使用者加入自己的 Google 電子郵件。只允許你測試，不需要先開放所有人。
5. Data Access / 資料存取使用：`openid`、電子郵件，以及 `https://www.googleapis.com/auth/drive.file`。不申請整個 Drive 的讀寫權限。
6. 如要求網站與隱私權政策，使用：
   - 網站：https://blog.harunoji.one/minimalist-ledger/
   - 隱私權政策：https://blog.harunoji.one/minimalist-ledger/privacy.html
   - 授權頂層網域：`harunoji.one`（若 Google 要求，需由網域擁有者驗證）。

測試狀態的授權可能有期限；到期可重新授權。正式對外開放時須依 Google 主控台要求完成發布設定，不以測試名單代替正式發布。

## 3. 建立 OAuth 用戶端

1. Google Auth Platform → Clients / 用戶端 → Create client / 建立用戶端。
2. 類型選 **Web application / 網頁應用程式**。
3. 在 **Authorized JavaScript origins / 已授權的 JavaScript 來源** 加入：
   ```text
   https://blog.harunoji.one
   ```
4. 不要加 `/minimalist-ledger/`、查詢字串或結尾路徑。本版使用 Google 官方彈出授權，不需新增 Firebase 的重新導向網址。
5. 若使用 GitHub 原生網址，另加 `https://photohost.github.io`；本機測試才加 `http://localhost:4173` 與 `http://127.0.0.1:4173`。
6. 建立後複製 **Client ID / 用戶端 ID**。不要複製 Client secret / 用戶端密碼。

若原本 Firebase 已建立 Web OAuth client，可以在同一專案檢視並使用該網頁用戶端 ID，但仍需加入本網站的 JavaScript 來源並啟用 Drive API。

## 4. 管理者設定網站一次

將上一步取得的公開 Client ID 提供給網站維護者，或自行填入 google-config.js 並部署：

```javascript
window.LEDGER_GOOGLE_CONFIG = {
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com'
};
```

所有訪客共用這個網站用戶端 ID，各自登入 Google 帳號，帳目仍分別儲存在各自 Drive，不共用帳本。訪客不需要建立專案、設定 API 或貼入 ID。網站尚未設定 ID 時，登入會保持停用並顯示尚未開放。

## 5. 對外公開

1. Google Auth Platform → Audience / 目標對象，確認使用者類型為 External / 外部。
2. 完成網站、隱私權政策與聯絡資料後，按 Publish app / 發布應用程式，將狀態改為 In production / 正式環境。
3. 依主控台要求完成網域擁有權、品牌或其他必要驗證；發布與品牌驗證為不同步驟，不保證按發布後立刻完成所有驗證。
4. 使用非測試名單的帳號驗證登入與 Drive 上傳。Google Workspace 管理者仍可能限制其成員授權第三方服務。

官方參考：[目標對象與發布](https://support.google.com/cloud/answer/15549945)、[品牌驗證](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)。

## 訪客的操作

開啟網站 → 設定 → Google 帳號 → 使用 Google 登入 → 首次同意 Drive 檔案權限。之後在不同裝置登入同一帳號即可讀取自己的帳本。Google 要求的首次授權與到期重登仍需由使用者操作。

## 舊資料移轉

- 本機／GitHub：先下載最新帳目到本機並匯出備份，再登入 Drive，按匯入原本帳目。
- Firebase：網站提供 [舊版匯出頁](https://blog.harunoji.one/minimalist-ledger/firebase-legacy.html)。以原本設定及帳號登入，讀取 Firebase 帳目並「匯出備份」。再回新版登入 Drive，到設定匯入這份 JSON，然後上傳。
- 舊版只供取回舊帳目；新版主頁不載入 Firebase。既有 Firebase 帳目、專案與 GitHub 檔案均不會被自動刪除或搬移。
- 主網站的 Drive 暫存使用獨立鍵，不會把舊 Firebase 工作階段當成 Drive 帳本。

## Drive 中的檔案與同步

- 第一次儲存會在「我的雲端硬碟」建立 **日常留白記帳** 資料夾，內含各版本 JSON 檔，檔名包含儲存時間。
- 每個版本是可直接匯入網站的完整帳本，不包含 OAuth 權杖或帳號密碼；沒有自動公開或分享檔案。
- 為避免兩台裝置互相覆蓋，每次同步新增版本並標記其前一版本，不修改舊版本。
- 同時更新形成分支時，網站提示選擇要採用的版本，保留其他版本供備份。選定後會建立整合版本，沒有自動合併明細。
- 若上傳成功但回應遺失，重試會讀取已建立的版本，避免重複新增同一內容。
- 版本會占用你的 Drive 空間；本版不自動刪除歷史。不要在使用期間任意移除最新版本，否則可能讀回較舊資料。整理前請先匯出備份並確認最後採用版本。
- 請在不同裝置使用同一 OAuth 用戶端 ID 及 Google 帳號，才能接續讀取同一組網站建立的檔案。

## 登入與離線限制

- 這是靜態網站的 Google 官方瀏覽器授權流程，Google 負責帳號選擇、登入與同意；網站不接收你的 Google 密碼。
- Access token 僅保留於記憶體，不寫入帳本、本機儲存或備份；沒有伺服器保存 refresh token。
- Google 授權到期時，登出再登入同一帳號即可接續同步。
- 登出是斷開本網站的 Drive 連線，不會登出整個瀏覽器的 Google 帳號。若要撤銷應用程式權限，可至 https://myaccount.google.com/connections 管理。
- 每次儲存先將帳目寫到同一瀏覽器的本機儲存，按 Google 帳號隔離。關頁、重新整理或登出後，登入同一帳號即可取回。清除網站資料或結束無痕工作階段可能移除尚未同步的本機資料。
- 網站開著時可離線儲存。重連時會核對 Drive 版本再補傳。已關閉的網站要等重新開啟並登入才會同步。雲端版本若已變更或暫時讀到較舊版本，會先保留本機資料，等你確認再處理。
- GitHub 與 Drive 擇一自動同步，登入 Drive 會停止 GitHub 上傳。

## 排查

| 訊息／情況 | 檢查 |
| --- | --- |
| origin_mismatch | Client 必須為網頁類型；JavaScript 來源是 `https://blog.harunoji.one`，沒有路徑 |
| access_denied／無法登入 | 測試名單是否加入你的帳號，是否拒絕檔案權限 |
| Drive 無法存取 | Drive API 已啟用、授權有同意檔案範圍、Drive 有空間 |
| 權杖到期 | 登出後登入同一 Google 帳號繼續同步 |
| 沒讀到原帳目 | 相同 OAuth 專案／用戶端 ID 與相同 Google 帳號；Firebase 舊帳目須明確移轉 |
| 多個同時編輯版本 | 在 Google 帳號視窗選擇要採用的版本；其他版本仍留在 Drive |

## 驗證

自動測試涵蓋檔案建立、版本關係、雙裝置分支、選版整合、離線與到期、成功回應遺失、限定權限與權杖清除。關頁重開、離線回復與帳號隔離使用測試帳目及模擬 Drive 回應驗證。

官方文件：[Google 官方瀏覽器授權](https://developers.google.com/identity/oauth2/web/guides/use-token-model)、[Drive 檔案權限](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)、[Drive 上傳與安全重試](https://developers.google.com/workspace/drive/api/guides/manage-uploads)。
