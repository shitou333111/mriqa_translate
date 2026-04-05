import { useEffect } from "react";

const APPFLOW_SDK_SRC = "https://o.alicdn.com/appflow/chatbot/v1/AppflowChatSDK.js";
const DEFAULT_INTEGRATE_ID = "cit-d60911f5127b4bd7a0fb";
const DEFAULT_REQUEST_DOMAIN = "https://1558140883750619.appflow.aliyunnest.com";
const INIT_FLAG_KEY = "__MRIQA_APPFLOW_CHAT_INIT__";
const LOAD_ABORTED_FLAG_KEY = "__MRIQA_APPFLOW_CHAT_LOAD_ABORTED__";
const LOAD_ABORTED_STORAGE_KEY = "mriqa_appflow_chat_load_aborted";
const APPFLOW_CONTAINER_ID = "appflow-chat-container";
const APPFLOW_OVERRIDE_STYLE_ID = "appflow-chat-widget-overrides";
const APPFLOW_LAYER_BASE_Z_INDEX = 1250;
const APPFLOW_LAYER_POPUP_Z_INDEX = 1260;
const APPFLOW_LOAD_TIMEOUT_MS = 3000;

function getIntegrateId() {
  return String(import.meta.env.VITE_APPFLOW_INTEGRATE_ID || DEFAULT_INTEGRATE_ID).trim();
}

function getRequestDomain() {
  return String(import.meta.env.VITE_APPFLOW_REQUEST_DOMAIN || DEFAULT_REQUEST_DOMAIN).trim();
}

function isAppflowLoadAborted() {
  if (typeof window === "undefined") {
    return false;
  }

  if (window[LOAD_ABORTED_FLAG_KEY]) {
    return true;
  }

  try {
    return window.sessionStorage.getItem(LOAD_ABORTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markAppflowLoadAborted() {
  if (typeof window === "undefined") {
    return;
  }

  window[LOAD_ABORTED_FLAG_KEY] = true;

  try {
    window.sessionStorage.setItem(LOAD_ABORTED_STORAGE_KEY, "1");
  } catch {
    // Ignore storage exceptions in restricted browser modes.
  }
}

function ensureAppflowOverrideStyle() {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById(APPFLOW_OVERRIDE_STYLE_ID)) {
    return;
  }

  const styleEl = document.createElement("style");
  styleEl.id = APPFLOW_OVERRIDE_STYLE_ID;
  styleEl.textContent = `
#${APPFLOW_CONTAINER_ID} {
  position: relative;
  z-index: ${APPFLOW_LAYER_BASE_Z_INDEX};
}

#${APPFLOW_CONTAINER_ID} .Backdrop,
#${APPFLOW_CONTAINER_ID} .Modal,
#${APPFLOW_CONTAINER_ID} .Popup {
  z-index: ${APPFLOW_LAYER_POPUP_Z_INDEX} !important;
}
`;

  document.head.appendChild(styleEl);
}

function elevateAppflowLayers(container) {
  if (!container || typeof window === "undefined") {
    return;
  }

  container.style.setProperty("position", "relative");
  container.style.setProperty("z-index", String(APPFLOW_LAYER_BASE_Z_INDEX), "important");

  const highPriorityLayers = container.querySelectorAll(".Backdrop, .Modal, .Popup");
  highPriorityLayers.forEach((el) => {
    el.style.setProperty("z-index", String(APPFLOW_LAYER_POPUP_Z_INDEX), "important");
  });

  const nodes = container.querySelectorAll("*");
  nodes.forEach((node) => {
    const computed = window.getComputedStyle(node);
    if (computed.position !== "fixed" && computed.position !== "sticky") {
      return;
    }

    const zIndex = Number.parseInt(computed.zIndex, 10);
    if (!Number.isFinite(zIndex) || zIndex < APPFLOW_LAYER_BASE_Z_INDEX) {
      node.style.setProperty("z-index", String(APPFLOW_LAYER_BASE_Z_INDEX), "important");
    }
  });
}

function syncAppflowUiState() {
  if (typeof document === "undefined") {
    return;
  }

  ensureAppflowOverrideStyle();

  const container = document.getElementById(APPFLOW_CONTAINER_ID);
  if (!container) {
    return;
  }

  elevateAppflowLayers(container);
}

function initializeAppflowChat() {
  if (typeof window === "undefined") {
    return;
  }

  if (isAppflowLoadAborted()) {
    return;
  }

  if (window[INIT_FLAG_KEY]) {
    return;
  }

  const sdk = window.APPFLOW_CHAT_SDK;
  if (!sdk || typeof sdk.init !== "function") {
    return;
  }

  const integrateId = getIntegrateId();
  const requestDomain = getRequestDomain();
  if (!integrateId || !requestDomain) {
    return;
  }

  sdk.init({
    integrateConfig: {
      integrateId,
      domain: {
        requestDomain
      }
    }
  });

  window[INIT_FLAG_KEY] = true;

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(syncAppflowUiState);
  }
  window.setTimeout(syncAppflowUiState, 120);
}

export default function AppflowChatWidget() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    if (isAppflowLoadAborted()) {
      return undefined;
    }

    ensureAppflowOverrideStyle();

    let frameId = 0;
    let containerObserver;
    let bodyObserver;
    let observedContainer = null;
    let loadTimeoutId = 0;

    const scheduleSync = () => {
      if (frameId) {
        return;
      }

      if (typeof window.requestAnimationFrame === "function") {
        frameId = window.requestAnimationFrame(() => {
          frameId = 0;
          syncAppflowUiState();
          bindContainerObserver();
        });
        return;
      }

      syncAppflowUiState();
      bindContainerObserver();
    };

    const bindContainerObserver = () => {
      const container = document.getElementById(APPFLOW_CONTAINER_ID);
      if (!container || observedContainer === container) {
        return;
      }

      if (containerObserver) {
        containerObserver.disconnect();
      }

      containerObserver = new MutationObserver(() => {
        scheduleSync();
      });
      containerObserver.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"]
      });

      observedContainer = container;
    };

    if (typeof MutationObserver !== "undefined") {
      bodyObserver = new MutationObserver(() => {
        scheduleSync();
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }

    const scriptSelector = `script[src="${APPFLOW_SDK_SRC}"]`;
    let scriptEl = document.querySelector(scriptSelector);

    const handleLoad = () => {
      if (loadTimeoutId) {
        window.clearTimeout(loadTimeoutId);
        loadTimeoutId = 0;
      }

      if (isAppflowLoadAborted()) {
        return;
      }

      initializeAppflowChat();
      scheduleSync();
    };

    const handleError = () => {
      if (loadTimeoutId) {
        window.clearTimeout(loadTimeoutId);
        loadTimeoutId = 0;
      }

      markAppflowLoadAborted();
      console.warn("Appflow Chat SDK 加载失败，请检查网络或域名配置。");
    };

    if (window.APPFLOW_CHAT_SDK) {
      initializeAppflowChat();
      scheduleSync();
    } else {
      if (!scriptEl) {
        scriptEl = document.createElement("script");
        scriptEl.src = APPFLOW_SDK_SRC;
        scriptEl.async = true;
        document.head.appendChild(scriptEl);
      }

      scriptEl.addEventListener("load", handleLoad);
      scriptEl.addEventListener("error", handleError);

      loadTimeoutId = window.setTimeout(() => {
        if (window.APPFLOW_CHAT_SDK) {
          return;
        }

        markAppflowLoadAborted();
        if (scriptEl) {
          scriptEl.removeEventListener("load", handleLoad);
          scriptEl.removeEventListener("error", handleError);
        }

        console.warn(`Appflow Chat SDK 超过 ${APPFLOW_LOAD_TIMEOUT_MS}ms 未加载完成，已停止后续加载。`);
      }, APPFLOW_LOAD_TIMEOUT_MS);
    }

    scheduleSync();

    return () => {
      if (scriptEl) {
        scriptEl.removeEventListener("load", handleLoad);
        scriptEl.removeEventListener("error", handleError);
      }

      if (loadTimeoutId) {
        window.clearTimeout(loadTimeoutId);
      }

      if (frameId && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frameId);
      }

      if (containerObserver) {
        containerObserver.disconnect();
      }
      if (bodyObserver) {
        bodyObserver.disconnect();
      }
    };
  }, []);

  return null;
}
