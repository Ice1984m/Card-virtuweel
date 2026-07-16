'use strict';

function layout(title, content) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#2563eb">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Card-virtuweel">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <title>${title}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <nav class="topnav">
    <a href="/" class="brand">Card-virtuweel</a>
    <div class="nav-links">
      <a href="/certificates">Certificaten</a>
      <a href="/posts">Posts</a>
      <a href="/bridges">Routing</a>
      <a href="/browser">Browser</a>
      <a href="/admin">Admin</a>
    </div>
  </nav>
  <main class="container">
    ${content}
  </main>
  <footer>
    <p>&copy; ${new Date().getFullYear()} Card-virtuweel</p>
  </footer>
  <script src="/install.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function(err) {
        console.warn('Service worker registratie mislukt:', err);
      });
    }
  </script>
</body>
</html>`;
}

module.exports = { layout };
