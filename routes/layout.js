'use strict';

function layout(title, content) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <nav class="topnav">
    <a href="/" class="brand">Card-virtuweel</a>
    <div class="nav-links">
      <a href="/certificates">Certificaten</a>
      <a href="/posts">Posts</a>
      <a href="/admin">Admin</a>
    </div>
  </nav>
  <main class="container">
    ${content}
  </main>
  <footer>
    <p>&copy; ${new Date().getFullYear()} Card-virtuweel</p>
  </footer>
</body>
</html>`;
}

module.exports = { layout };
