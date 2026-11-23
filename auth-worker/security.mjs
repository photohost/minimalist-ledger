// 文件回應的安全標頭。獨立成模組，方便在 Node 測試而不必啟動 Worker。
//
// 主站：只允許自己的腳本；Google 登入 SDK、Drive、GitHub API、字型與 Cloudflare 統計來源必須列在白名單。
// style-src 保留 'unsafe-inline'，因為畫面範本以字串組出 style 屬性（金額圓點、分析長條）。
// 腳本來源不放寬，所以仍能擋住注入的腳本與 eval。

const COMMON = [
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
];

const APP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://accounts.google.com https://api.github.com https://www.googleapis.com https://openidconnect.googleapis.com https://cloudflareinsights.com",
  "frame-src https://accounts.google.com",
  "worker-src 'self'",
  ...COMMON
];

export const APP_PAGES = new Set(['', 'index.html', 'privacy.html']);

export function isDocument(file) {
  return APP_PAGES.has(file);
}

export function policyFor() {
  return APP.join('; ');
}

// CSP_MODE=report-only 時只回報違規、不擋；確認正式網域沒有誤擋後再改為 enforce。
export function documentHeaders(file, mode = 'report-only') {
  const name = mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
  return {
    [name]: policyFor(file),
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Content-Type-Options': 'nosniff'
  };
}
