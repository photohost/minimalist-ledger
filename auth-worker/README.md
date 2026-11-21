# 啟用長效 Google 登入

啟用後，使用者授權一次即可在同一瀏覽器保持登入最多 30 天。Cloudflare Worker 在 `blog.harunoji.one` 提供登入和續期，GitHub Pages 繼續提供網頁，帳目直接存於個人的 Google Drive。

1. 在 [Google Auth Platform 的用戶端頁](https://console.cloud.google.com/auth/clients?project=706785860796) 開啟目前的網頁用戶端。將下列網址加入「已授權的重新導向 URI」，並保留原有的 JavaScript 來源。

   ```text
   https://blog.harunoji.one/minimalist-ledger-auth/callback
   ```

2. 在已登入 Cloudflare 的本機環境，從 `auth-worker` 資料夾執行下列命令。設定仍使用現有 `drive.file` 權限。兩個機密以提示輸入，只放進 Workers Secrets。

   ```powershell
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put SESSION_KEY
   ```

   `GOOGLE_CLIENT_SECRET` 是上述 Google 網頁用戶端的密碼。`SESSION_KEY` 使用隨機的 32 位元組，並以 base64url 編碼。在自己的終端可用 `node -p "require('node:crypto').randomBytes(32).toString('base64url')"` 產生。機密請勿貼到聊天或提交 GitHub。路由只涵蓋 `blog.harunoji.one/minimalist-ledger-auth/*`。

3. 驗證服務可用後，把 `google-config.js` 的 `keepSignedIn` 改成 `true` 並部署網頁。正式瀏覽器重新整理頁面後，進行一次 Google 授權。之後重開網頁應自動回到同一個帳本。使用開發測試帳目確認 Drive 上傳與登出。

Google 專案若仍處於「測試中」，Drive 的 refresh token 可能在 7 天後到期。正式使用前，依 Google 主控台的要求發布及完成驗證。清除 Cookie、登出或撤銷授權後需要重新登入。[Google 授權期限](https://developers.google.com/identity/protocols/oauth2#expiration)

長效登入的 Cookie 經 AES-GCM 加密，具備 `Secure`、`HttpOnly` 與 `SameSite=Lax` 屬性。瀏覽器只會取得短效 Drive 存取權杖。登出會清除本瀏覽器的登入 Cookie。更換 `SESSION_KEY` 會使現有的長效登入一併失效。
