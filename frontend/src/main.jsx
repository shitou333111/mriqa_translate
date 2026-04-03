import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

const APP_BASE_URL = import.meta.env.BASE_URL || "/";

function restoreSpaPathFromQuery() {
  const params = new URLSearchParams(window.location.search || "");
  const encodedPath = params.get("p");
  if (!encodedPath) {
    return;
  }

  const encodedQuery = params.get("q");
  const baseNoTrailingSlash = APP_BASE_URL === "/" ? "" : APP_BASE_URL.replace(/\/+$/, "");
  const decodedPath = decodeURIComponent(encodedPath);
  const normalizedPath = decodedPath.startsWith("/") ? decodedPath : `/${decodedPath}`;
  const restoredQuery = encodedQuery ? `?${decodeURIComponent(encodedQuery)}` : "";
  const hash = window.location.hash || "";
  const target = `${baseNoTrailingSlash}${normalizedPath}${restoredQuery}${hash}`;

  window.history.replaceState(null, "", target || "/");
}

restoreSpaPathFromQuery();

// 前端入口：挂载 React 根节点，并启用 BrowserRouter。
// App 内部会根据 URL 解析 slug，再向后端请求 zh/en 对应 HTML 内容。
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={APP_BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
