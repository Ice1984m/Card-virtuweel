'use strict';

(function () {
  var deferredPrompt = null;

  function showPwaButtons() {
    document.querySelectorAll('.btn-pwa-install').forEach(function (btn) {
      btn.style.display = 'inline-block';
    });
  }

  function hidePwaButtons() {
    document.querySelectorAll('.btn-pwa-install').forEach(function (btn) {
      btn.style.display = 'none';
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showPwaButtons();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    document.querySelectorAll('.btn-pwa-install').forEach(function (btn) {
      btn.textContent = '✅ App geïnstalleerd';
      btn.disabled = true;
    });
  });

  function triggerInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      deferredPrompt = null;
      hidePwaButtons();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Attach click handler to all PWA install buttons (present and future)
    document.querySelectorAll('.btn-pwa-install').forEach(function (btn) {
      btn.addEventListener('click', triggerInstall);
    });

    // Check if already installed as standalone
    if (window.matchMedia('(display-mode: standalone)').matches) {
      document.querySelectorAll('.install-panel').forEach(function (panel) {
        var note = document.createElement('p');
        note.className = 'install-hint';
        note.textContent = '✅ App is al geïnstalleerd en draait als standalone app.';
        panel.prepend(note);
      });
    }
  });
})();
