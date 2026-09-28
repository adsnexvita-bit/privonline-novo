export const ADMIN_PWA_BOOTSTRAP_SCRIPT = String.raw`
(() => {
  if (!location.pathname.startsWith('/admin') || !('serviceWorker' in navigator)) return;

  const workerUrl = '/admin-sw.js?v=7';
  const reloadKey = 'privadinhos:pwa-recovery';
  const reloadWindowMs = 30000;
  let reloading = false;

  const reloadOnce = () => {
    if (reloading) return;
    const previous = Number(sessionStorage.getItem(reloadKey) || 0);
    const now = Date.now();
    if (now - previous < reloadWindowMs) return;
    reloading = true;
    sessionStorage.setItem(reloadKey, String(now));
    location.reload();
  };

  const activateWaitingWorker = (registration) => {
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  };

  const refreshRegistration = async () => {
    const registration = await navigator.serviceWorker.register(workerUrl, {
      scope: '/admin',
      updateViaCache: 'none',
    });
    activateWaitingWorker(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          activateWaitingWorker(registration);
        }
      });
    });
    await registration.update().catch(() => undefined);
    activateWaitingWorker(registration);
  };

  const clearLegacyCaches = async () => {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('privadinhos-admin-'))
        .map((key) => caches.delete(key)),
    );
  };

  const recoverFromAssetFailure = async () => {
    if (reloading) return;
    await clearLegacyCaches();
    await refreshRegistration().catch(() => undefined);
    reloadOnce();
  };

  const isAssetFailure = (value) =>
    /dynamically imported module|failed to fetch module|importing a module script|preload|chunkloaderror|loading chunk/i
      .test(String(value || ''));

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    void recoverFromAssetFailure();
  });
  window.addEventListener('error', (event) => {
    if (isAssetFailure(event.message || event.error)) void recoverFromAssetFailure();
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isAssetFailure(event.reason?.message || event.reason)) void recoverFromAssetFailure();
  });
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PWA_UPDATED') reloadOnce();
  });
  window.addEventListener('online', () => void refreshRegistration());
  void clearLegacyCaches().then(refreshRegistration).catch(() => undefined);
})();
`;
