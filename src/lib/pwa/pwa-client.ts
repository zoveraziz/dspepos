/**
 * Progressive Web App (PWA) Registration & Seamless Auto-Update Bridge
 */
export function initPWA() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("[PWA] Service Worker registered with scope:", registration.scope);

        // Periodically check for updates (every 60 seconds)
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60000);

        // Detect new versions
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              console.log("[PWA] New update available. Auto-activating...");
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[PWA] Service Worker registration failed:", err);
      });

    // Auto-refresh when new worker claims clients
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        console.log("[PWA] Controller changed. Seamlessly reloading page.");
        window.location.reload();
      }
    });
  });
}
