import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

// 前端入口：挂载 React 根节点，并启用 BrowserRouter。
// App 内部会根据 URL 解析 slug，再向后端请求 zh/en 对应 HTML 内容。
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
