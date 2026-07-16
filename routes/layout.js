'use strict';

function layout(title, content) {
  const navLinks = [
    { href: '/wallet',       label: 'Wallet' },
    { href: '/certificates', label: 'Certificaten' },
    { href: '/posts',        label: 'Posts' },
    { href: '/bridges',      label: 'Routing' },
    { href: '/browser',      label: 'Browser' },
    { href: '/admin',        label: 'Admin' },
    { href: '/sandbox',      label: '🛠 Sandbox' },
  ];
  const navHtml = navLinks.map(({ href, label }) =>
    `<a href="${href}">${label}</a>`
  ).join('');

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
    <button class="nav-toggle" aria-label="Menu openen" aria-expanded="false">☰</button>
    <div id="nav-links" class="nav-links">
      ${navHtml}
    </div>
  </nav>
  <div id="update-banner" class="update-banner" style="display:none;" role="alert">
    <span>🆕 Update beschikbaar – versie <strong class="update-version"></strong></span>
    <a href="/download/apk" class="update-apk-link btn btn-small" style="margin-left:auto">⬇ APK downloaden</a>
    <button class="update-dismiss" onclick="this.closest('#update-banner').style.display='none'" aria-label="Melding sluiten">✕</button>
  </div>
  <main class="container">
    ${content}
  </main>
  <footer>
    <p>&copy; ${new Date().getFullYear()} Card-virtuweel</p>
  </footer>
  <script>
    (function () {
      var path = window.location.pathname;
      document.querySelectorAll('.nav-links a').forEach(function (a) {
        var href = a.getAttribute('href');
        if (href !== '/' && (path === href || path.startsWith(href + '/'))) {
          a.classList.add('nav-active');
        }
      });
      var toggle = document.querySelector('.nav-toggle');
      var navLinks = document.getElementById('nav-links');
      if (toggle && navLinks) {
        toggle.addEventListener('click', function () {
          var expanded = toggle.getAttribute('aria-expanded') === 'true';
          toggle.setAttribute('aria-expanded', String(!expanded));
          navLinks.classList.toggle('nav-open');
        });
      }
    })();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function(err) {
        console.warn('Service worker registratie mislukt:', err);
      });
    }
    // In-app update check
    (function () {
      var UPDATE_KEY = 'cvw_last_version_check';
      var ONE_HOUR_MS = 3600 * 1000;
      var lastCheck = Number(localStorage.getItem(UPDATE_KEY) || 0);
      if (Date.now() - lastCheck < ONE_HOUR_MS) return;
      fetch('/api/version').then(function (r) { return r.json(); }).then(function (data) {
        localStorage.setItem(UPDATE_KEY, String(Date.now()));
        var stored = localStorage.getItem('cvw_installed_version');
        if (!stored) { localStorage.setItem('cvw_installed_version', data.version); return; }
        if (stored !== data.version) {
          var banner = document.getElementById('update-banner');
          if (banner) {
            banner.querySelector('.update-version').textContent = data.version;
            if (data.apkUrl) banner.querySelector('.update-apk-link').href = data.apkUrl;
            banner.style.display = 'flex';
          }
        }
      }).catch(function () {});
    })();
  </script>
</body>
</html>`;
}

module.exports = { layout };
