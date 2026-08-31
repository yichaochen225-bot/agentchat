if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.warn("AgentChat service worker registration failed", error);
    });
  });
}

const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
document.documentElement.dataset.installMode = standalone ? "standalone" : "browser";
