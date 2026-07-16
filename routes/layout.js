'use strict';

function layout(title, content) {
  const navLinks = [
    { href: '/wallet',       label: 'Wallet' },
    { href: '/certificates', label: 'Certificaten' },
    { href: '/posts',        label: 'Posts' },
    { href: '/bridges',      label: 'Routing' },
    { href: '/browser',      label: 'Browser' },
    { href: '/admin',        label: 'Admin' },
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
  </script>
</body>
</html>`;
}

module.exports = { layout };
