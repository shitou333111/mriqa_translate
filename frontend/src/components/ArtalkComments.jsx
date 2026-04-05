import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Artalk from "artalk";

const DEFAULT_SITE_NAME = "mriqa_translate";
const DEFAULT_SERVER_PORT = "23366";
const DEFAULT_SERVER_HOST = "39.102.96.105";
const DEV_SERVER_PROXY = "/artalk-api";
const ANONYMOUS_EMAIL = "fake@email.com";
const OPTIONAL_EMAIL_PLACEHOLDER = "邮箱（可选）";

function stripTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}

function normalizeServerUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (raw.startsWith("/")) {
    return stripTrailingSlashes(raw);
  }

  const hasProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(raw);
  const normalizedInput = hasProtocol ? raw : `http://${raw}`;

  try {
    const parsed = new URL(normalizedInput);
    if (!hasProtocol && !parsed.port) {
      parsed.port = DEFAULT_SERVER_PORT;
    }
    return stripTrailingSlashes(parsed.toString());
  } catch {
    return "";
  }
}

function getConfiguredServerUrl() {
  if (import.meta.env.DEV) {
    return DEV_SERVER_PROXY;
  }

  const envServer = normalizeServerUrl(import.meta.env.VITE_ARTALK_SERVER);
  if (envServer) {
    return envServer;
  }

  return normalizeServerUrl(`${DEFAULT_SERVER_HOST}:${DEFAULT_SERVER_PORT}`);
}

function normalizePageKey(pathname) {
  const basePath = stripTrailingSlashes(import.meta.env.BASE_URL || "/");
  let normalized = pathname || "/";

  if (basePath && basePath !== "/" && normalized.startsWith(basePath)) {
    normalized = normalized.slice(basePath.length) || "/";
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "/index";
  }

  if (segments[0] === "edit" || segments[0] === "review") {
    return `/${segments[1] || "index"}`;
  }

  return normalized;
}

function resolveSiteDarkMode() {
  if (typeof document !== "undefined") {
    const theme = document.documentElement?.dataset?.theme;
    if (theme === "dark") {
      return true;
    }
    if (theme === "light") {
      return false;
    }
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  return false;
}

function syncArtalkDarkMode(instance) {
  if (!instance || typeof instance.setDarkMode !== "function") {
    return;
  }
  instance.setDarkMode(resolveSiteDarkMode());
}

function setInputValue(input, value) {
  if (!input) {
    return;
  }

  if (input.value !== value) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function applyIdentityInputPolicy(editor) {
  if (!editor || typeof editor.getHeaderInputEls !== "function") {
    return null;
  }

  const { email, link } = editor.getHeaderInputEls();
  if (email) {
    email.required = false;
    email.readOnly = false;
    email.tabIndex = 0;
    email.placeholder = OPTIONAL_EMAIL_PLACEHOLDER;
  }

  if (link) {
    link.readOnly = true;
    link.tabIndex = -1;
    setInputValue(link, "");
  }

  return { email };
}

function applyIdentityInputPolicyByDom(root) {
  if (!root) {
    return;
  }

  const email = root.querySelector(".atk-main-editor > .atk-header .atk-email");
  if (email) {
    email.required = false;
    email.readOnly = false;
    email.tabIndex = 0;
    if (email.placeholder !== OPTIONAL_EMAIL_PLACEHOLDER) {
      email.placeholder = OPTIONAL_EMAIL_PLACEHOLDER;
    }
  }

  const link = root.querySelector(".atk-main-editor > .atk-header .atk-link");
  if (link) {
    link.readOnly = true;
    link.tabIndex = -1;
    setInputValue(link, "");
  }
}

function prepareIdentityForSubmit(editor) {
  const inputs = applyIdentityInputPolicy(editor);
  if (!inputs || !inputs.email) {
    return null;
  }

  const emailValue = String(inputs.email.value || "").trim();
  if (emailValue) {
    if (emailValue !== inputs.email.value) {
      setInputValue(inputs.email, emailValue);
    }
    return null;
  }

  setInputValue(inputs.email, ANONYMOUS_EMAIL);
  return () => {
    setInputValue(inputs.email, "");
  };
}

export default function ArtalkComments() {
  const location = useLocation();
  const containerRef = useRef(null);
  const [statusMessage, setStatusMessage] = useState("");

  const serverUrl = useMemo(() => getConfiguredServerUrl(), []);
  const pageKey = useMemo(() => normalizePageKey(location.pathname), [location.pathname]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const controller = new AbortController();
    let instance;
    let syncTimerA;
    let syncTimerB;
    let syncByEvent;
    let syncDarkModeByTheme;
    let themeObserver;
    let darkMediaQuery;
    let handleDarkMediaQueryChange;

    if (!serverUrl) {
      setStatusMessage("评论服务地址无效，请检查 VITE_ARTALK_SERVER 配置。");
      return undefined;
    }

    container.innerHTML = "";
    setStatusMessage("");

    const bootstrap = async () => {
      try {
        const confResponse = await fetch(`${serverUrl}/api/v2/conf`, { signal: controller.signal });
        if (!confResponse.ok) {
          setStatusMessage(`评论服务不可用（HTTP ${confResponse.status}），请检查 Artalk 后端或反向代理。`);
          return;
        }

        instance = Artalk.init({
          el: container,
          pageKey,
          pageTitle: typeof document !== "undefined" ? document.title : pageKey,
          server: serverUrl,
          site: String(import.meta.env.VITE_ARTALK_SITE || DEFAULT_SITE_NAME),
          locale: String(import.meta.env.VITE_ARTALK_LOCALE || "zh-CN"),
          beforeSubmit: (editor, next) => {
            const rollback = prepareIdentityForSubmit(editor);
            next();
            if (rollback) {
              window.setTimeout(rollback, 0);
            }
          }
        });

        // Keep Artalk built-in dark mode in sync with site theme.
        syncDarkModeByTheme = () => {
          syncArtalkDarkMode(instance);
        };

        syncDarkModeByTheme();

        if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
          themeObserver = new MutationObserver((mutations) => {
            if (mutations.some((item) => item.attributeName === "data-theme")) {
              syncDarkModeByTheme();
            }
          });
          themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"]
          });
        }

        if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
          darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
          handleDarkMediaQueryChange = () => {
            syncDarkModeByTheme();
          };

          if (typeof darkMediaQuery.addEventListener === "function") {
            darkMediaQuery.addEventListener("change", handleDarkMediaQueryChange);
          } else if (typeof darkMediaQuery.addListener === "function") {
            darkMediaQuery.addListener(handleDarkMediaQueryChange);
          }
        }

        // Artalk may rewrite placeholders during mount, so re-apply policy after mount/update.
        syncByEvent = () => {
          const editor = instance?.ctx?.get?.("editor");
          applyIdentityInputPolicy(editor);
          applyIdentityInputPolicyByDom(container);
        };

        syncByEvent();
        syncTimerA = window.setTimeout(syncByEvent, 0);
        syncTimerB = window.setTimeout(syncByEvent, 160);
        instance.on("mounted", syncByEvent);
        instance.on("updated", syncByEvent);

        instance.on("list-failed", (error) => {
          const reason = error?.msg ? `，原因：${error.msg}` : "";
          setStatusMessage(`评论服务连接失败，请检查 ${serverUrl}${reason}`);
        });

        instance.on("list-loaded", () => {
          setStatusMessage("");
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }
        setStatusMessage(`评论服务请求失败，请检查 ${serverUrl} 与网络连通性。`);
      }
    };

    bootstrap();

    return () => {
      controller.abort();
      if (syncTimerA) {
        window.clearTimeout(syncTimerA);
      }
      if (syncTimerB) {
        window.clearTimeout(syncTimerB);
      }
      if (instance && syncByEvent) {
        instance.off("mounted", syncByEvent);
        instance.off("updated", syncByEvent);
      }
      if (themeObserver) {
        themeObserver.disconnect();
      }
      if (darkMediaQuery && handleDarkMediaQueryChange) {
        if (typeof darkMediaQuery.removeEventListener === "function") {
          darkMediaQuery.removeEventListener("change", handleDarkMediaQueryChange);
        } else if (typeof darkMediaQuery.removeListener === "function") {
          darkMediaQuery.removeListener(handleDarkMediaQueryChange);
        }
      }
      if (instance && typeof instance.destroy === "function") {
        instance.destroy();
      }
      container.innerHTML = "";
    };
  }, [pageKey, serverUrl]);

  return (
    <div className="comments-shell card" aria-label="Comments section">
      <h3 className="comments-title">评论区</h3>
      <div className="artalk-comments" ref={containerRef} />
      {statusMessage ? <p className="comments-status">{statusMessage}</p> : null}
    </div>
  );
}
