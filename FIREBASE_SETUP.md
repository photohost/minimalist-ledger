# Google 登入與雲端記帳設定

此版本已包含網站端功能；尚未替你建立或連接 Firebase 專案。完成下列設定後，才可測試真實 Google 登入與雲端同步。現有 GitHub 帳目不會自動搬移。

## 1. 建立 Firebase 專案

1. 開啟 https://console.firebase.google.com/ ，以你的 Google 帳號登入。
2. 新增專案；此記帳功能不需要 Google Analytics，可以不啟用。
3. 專案設定 → 一般 → 你的應用程式，新增「網頁」應用程式（`</>`）。不必啟用 Firebase Hosting，網站仍使用 GitHub Pages。
4. 保留網頁設定中的 `apiKey`、`authDomain`、`projectId`、`appId`。可複製 `const firebaseConfig = { ... };` 這段，或整理為 JSON。

這是公開的網頁應用程式設定，不是服務帳戶金鑰。不要產生或貼入 private_key、client_secret 或服務帳戶 JSON。網站會拒絕這些欄位。

## 2. 啟用 Google 登入

1. Firebase Authentication → 開始使用 → Sign-in method / 登入方式。
2. 啟用 Google，填寫專案的支援電子郵件，儲存。
3. Authentication → Settings / 設定 → Authorized domains / 授權網域，新增：
   - `blog.harunoji.one`（目前正式網站，不含 https:// 或路徑）
   - 若使用 GitHub 原生網址，另加 `photohost.github.io`。
   - 僅在本機測試時另加 `localhost`、`127.0.0.1`。
4. 保留網頁設定中專案原始的 `專案ID.firebaseapp.com` 為 authDomain；不要自行改成網站網域。

手機請使用 Safari、Chrome 等一般瀏覽器；LINE 等內嵌瀏覽器可能阻擋 Google 登入。登入彈出視窗需要允許；本版不使用重新導向登入。

## 3. 建立資料庫，先維持拒絕存取

1. Cloud Firestore → 建立資料庫，使用 **Standard edition、預設資料庫 `(default)`**。
2. 選擇適合自己的地區。先用正式模式（Production mode）；不要開放測試模式的公開讀寫規則。
3. 暫時保留預設拒絕所有帳目存取的規則。下一步取得自己的 UID 後再設定。

## 4. 在網站連線，取得你的 UID

1. 開啟 https://blog.harunoji.one/minimalist-ledger/?v=1.6.0 。
2. 設定 → Google 帳號 → 展開「首次連線設定」。
3. 貼上第 1 步的網頁設定（JSON 或 `const firebaseConfig = { ... };`），按「儲存連線設定」。
4. 顯示就緒後，按「使用 Google 登入」，選擇自己的帳號。
5. 視窗會顯示電子郵件與 **UID**。此時讀取帳目被拒絕是預期行為，因為尚未放行你的 UID。
6. UID 也可在 Firebase Authentication → Users / 使用者找到。

## 5. 只允許你的 Google 帳號存取

1. 開啟本倉庫的 [firestore.rules](firestore.rules)，複製完整內容。
2. 把 `REPLACE_WITH_YOUR_UID` 換成上一步你的實際 UID（保留前後單引號）。
3. 將規則貼到 Cloud Firestore → Rules / 規則，按 Publish / 發布。
4. 回到網站按「讀取雲端帳目」。若顯示尚無帳目，就可開始移轉或建立帳本。

規則限制：Google 登入、UID 與資料路徑一致、指定個人 UID、正確版本遞增、限定欄位與大小，預設不允許刪除。不要改成 `allow read, write: if true`。每筆帳目存於 `users/{你的UID}/ledger/main`，資料欄位為 JSON 字串；完整帳本上限 800 KB。

若將來確定要讓其他人用自己的帳號管理自己的帳目，可以另外調整 UID 白名單；本版預設只給你自己使用。

若使用 Firebase CLI，也可以在確認專案後執行：

```text
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

不要使用這份規則覆蓋已有其他應用程式規則的共用專案；請使用專用的記帳專案。

## 6. 移轉現有 GitHub 帳目

1. 先在原本的 GitHub 模式下載最新帳目，並匯出 JSON 備份。
2. 登入 Google 後，按「匯入原本的本機／GitHub 帳目」。
3. 檢查目前 Google 帳號是否正確，再確認移轉。此操作複製目前瀏覽器原有帳目，不會直接讀取 GitHub，也不刪除原始帳目。
4. 若 Google 已有不同資料，網站會再次確認並先下載被取代的雲端備份。
5. 只有看到「已同步至 Google」才表示雲端已保存。
6. 第二台裝置填入相同 Firebase 網頁設定，登入相同帳號，會讀取雲端資料；不要再次把空白本機帳本移轉過去。

若要讓第二台裝置不必填設定，可以將**公開網頁設定**填入 `firebase-config.js` 的 `window.LEDGER_FIREBASE_CONFIG` 並部署。這個檔案不包含帳目、OAuth 權杖或服務帳戶私鑰。

## 同步與保存限制

- Google 登入後停止 GitHub 自動同步；單次只使用一個雲端來源。
- 登入後帳目暫存於此分頁的 sessionStorage，與原本 localStorage 帳本分開；重新整理後需再次按 Google 登入，才能載入帳號暫存與雲端。不同 UID 使用不同暫存鍵。
- 未同步內容可能因關閉分頁而遺失。離線仍可輸入；恢復連線後，按「上傳此分頁」核對雲端版本並同步，不承諾背景自動補傳。
- 每次儲存約 1.2 秒後上傳；切回頁面且沒有本機變更時會重新讀取雲端。本版不是即時協作工具。
- 兩台裝置同時修改完整帳本時，以交易檢查版本；衝突會停止上傳並保留本頁變更，沒有自動合併。先匯出備份，再選讀取雲端或確認取代。
- 登出清除此帳號在本分頁的暫存並恢復原本的本機帳本；有未同步帳目會要求確認並先下載備份。原本未登入的本機帳本不會被刪除。
- Google 登入失效時會關閉帳號資料顯示。未同步工作階段仍可在原分頁重新登入同帳號取回；不要在共用裝置留下未登出的分頁。
- Firebase 網頁設定與帳目存取權不同；真正權限由 Authentication 和 Firestore 規則限制。
- Firebase 的配額、用量與費用由你的專案管理；請留意主控台用量。此版本不會替你啟用付費方案。

## 問題排查

| 畫面訊息 | 處理方式 |
| --- | --- |
| 尚未授權此網站網域 | Authentication 加入 `blog.harunoji.one` |
| 請先啟用 Google 登入 | 登入方式中啟用 Google |
| 登入視窗被封鎖 | 允許彈出視窗，準備完成後再點登入；避免內嵌瀏覽器 |
| 帳目存取被拒絕 | 核對規則已發布、UID 正確、資料庫是 `(default)`、專案設定一致 |
| Google 尚無帳目 | 移轉原帳目，或上傳新帳本 |
| 另一裝置已更新 | 先匯出本頁備份，再讀取雲端或確認取代 |
| 目前無法連線 | 保留分頁與備份，恢復網路後按上傳此分頁 |

## 驗證範圍

自動測試涵蓋帳號隔離、明確移轉、登出清理、離線保留、損壞資料拒絕、版本衝突與延遲回應。SDK 由 Google 官方 CDN 載入，網址可連線。尚未連接真實專案時，無法完成真人 Google 登入或已發布 Firestore 規則的端到端驗證；完成設定後應再以兩台裝置測試。

官方參考：[網頁 Google 登入](https://firebase.google.com/docs/auth/web/google-signin)、[Firestore 交易](https://firebase.google.com/docs/firestore/manage-data/transactions)、[安全規則](https://firebase.google.com/docs/rules/basics)、[Firebase 網頁 API Key](https://firebase.google.com/docs/projects/api-keys)。
