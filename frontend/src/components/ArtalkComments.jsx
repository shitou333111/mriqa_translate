import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Artalk from "artalk";

const DEFAULT_SITE_NAME = "mriqa_translate";
const DEFAULT_SERVER_PORT = "23366";
const DEFAULT_SERVER_HOST = "39.102.96.105";
const DEV_SERVER_PROXY = "/artalk-api";
const ANONYMOUS_EMAIL = "fake@email.com";

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

function fillAnonymousIdentity(editor) {
  if (!editor || typeof editor.getHeaderInputEls !== "function") {
    return;
  }

  const { email, link } = editor.getHeaderInputEls();
  if (email) {
    email.required = false;
    email.readOnly = true;
    email.tabIndex = -1;
    setInputValue(email, ANONYMOUS_EMAIL);
  }

  if (link) {
    link.readOnly = true;
    link.tabIndex = -1;
    setInputValue(link, "");
  }
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
            fillAnonymousIdentity(editor);
            next();
          }
        });

        // Ensure initial user state is populated even before first submit.
        const editor = instance?.ctx?.get?.("editor");
        fillAnonymousIdentity(editor);

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
