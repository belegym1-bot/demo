(() => {
  const intro = document.querySelector('#bele-intro');
  const app = document.querySelector('#app');
  const video = intro?.querySelector('video');
  if (!intro || !app || !video) return;

  // A apresentação não pode atrasar a inicialização do aplicativo.
  const storageKey = 'bele-intro-seen-session';
  let finished = false;
  let watchdog;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    video.pause();
    intro.hidden = true;
    intro.remove();
  }

  function startIntro() {
    if (finished || intro.dataset.started) return;
    intro.dataset.started = 'true';

    try {
      if (sessionStorage.getItem(storageKey)) {
        finish();
        return;
      }
      sessionStorage.setItem(storageKey, '1');
    } catch {
      // Se o armazenamento estiver bloqueado, ainda exibimos uma apresentação curta.
    }

    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !video.dataset.src) {
      finish();
      return;
    }

    intro.hidden = false;
    video.src = video.dataset.src;
    video.load();
    video.play().catch(finish);
    watchdog = setTimeout(finish, 1600);
    video.addEventListener('ended', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
  }

  window.addEventListener('bele:ready', startIntro, { once: true });
  // Evita deixar a tela presa caso o carregamento da API falhe.
  window.addEventListener('error', finish, { once: true });
})();
