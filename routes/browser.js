'use strict';

const express = require('express');
const { layout } = require('./layout');

const router = express.Router();

router.get('/', (req, res) => {
  res.send(layout('Internet Browser', `
    <div class="page-header">
      <h1>🌐 Internet Browser</h1>
    </div>
    <div class="browser-panel">
      <form class="browser-bar" id="browserForm" action="#" onsubmit="return openSearch(event)">
        <input
          id="browserQuery"
          type="text"
          class="browser-input"
          placeholder="Zoek op internet of voer een URL in…"
          autocomplete="off"
          autofocus
        >
        <button type="submit" class="btn">🔍 Zoeken</button>
      </form>
      <div class="browser-links">
        <p class="browser-hint">Populaire sites:</p>
        <div class="browser-shortcuts">
          <a href="https://www.google.com" target="_blank" rel="noopener" class="shortcut-btn">🔍 Google</a>
          <a href="https://www.bol.com" target="_blank" rel="noopener" class="shortcut-btn">🛒 Bol.com</a>
          <a href="https://www.amazon.nl" target="_blank" rel="noopener" class="shortcut-btn">📦 Amazon NL</a>
          <a href="https://www.marktplaats.nl" target="_blank" rel="noopener" class="shortcut-btn">🏷️ Marktplaats</a>
          <a href="https://www.coolblue.nl" target="_blank" rel="noopener" class="shortcut-btn">💻 Coolblue</a>
          <a href="https://www.zalando.nl" target="_blank" rel="noopener" class="shortcut-btn">👗 Zalando</a>
        </div>
      </div>
      <div class="browser-notice">
        <p>🔒 Links worden geopend in een nieuw tabblad van uw browser.</p>
      </div>
    </div>

    <script>
      function openSearch(e) {
        e.preventDefault();
        var q = document.getElementById('browserQuery').value.trim();
        if (!q) return false;
        var url = /^https?:\\/\\//i.test(q) ? q : 'https://www.google.com/search?q=' + encodeURIComponent(q);
        window.open(url, '_blank', 'noopener,noreferrer');
        return false;
      }
    </script>
  `));
});

module.exports = router;
