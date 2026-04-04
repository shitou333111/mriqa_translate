import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

function toRoutePath(id) {
  if (!id || id === "index") {
    return "/index";
  }
  return `/${encodeURIComponent(id)}`;
}

// 判断某节点的后代中是否包含当前激活文章，决定默认展开哪些分组。
function containsActiveDescendant(node, activeId) {
  const children = Array.isArray(node?.children) ? node.children : [];
  for (const child of children) {
    if (child?.id === activeId || containsActiveDescendant(child, activeId)) {
      return true;
    }
  }
  return false;
}

function SidebarNode({ node, lang, activeId, level = 1, onNavigate }) {
  // level 来自递归深度，对应 sidebar.json 的层级结构（一级/二级/三级）。
  // 样式中的 .level-1/.level-2/.level-3 直接以这个值作为依据。
  const hasChildren = node.children && node.children.length > 0;
  const defaultOpen = hasChildren && containsActiveDescendant(node, activeId);
  const [open, setOpen] = useState(defaultOpen);
  const label = node.title?.[lang] || node.title?.en || "Untitled";
  // 约定：有 children 的节点视为分组标题，只负责展开/收起；
  // 纯叶子节点才作为可跳转文章链接。
  const isLink = Boolean(node.id) && !hasChildren;
  const isSection = hasChildren;

  return (
    <li className={`sidebar-node level-${level} ${isSection ? "has-children" : ""}`.trim()}>
      <div className="sidebar-row">
        {isLink ? (
          <Link
            to={toRoutePath(node.id)}
            className={node.id === activeId ? "active" : ""}
            onClick={onNavigate}
          >
            {label}
          </Link>
        ) : isSection ? (
          <button
            type="button"
            className="sidebar-group"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {label}
          </button>
        ) : (
          <span className="sidebar-label-static" title={label}>
            {label}
          </span>
        )}
        {hasChildren ? (
          <button
            type="button"
            className={`toggle ${open ? "open" : ""}`}
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
          >
            <span className="toggle-icon" aria-hidden="true">
              {open ? (
                <svg viewBox="0 0 16 16" height="16" width="16">
                  <path
                    fill="currentColor"
                    fillRule="evenodd"
                    d="m14.06 5.5-.53.53-4.82 4.82a1 1 0 0 1-1.42 0L2.47 6.03l-.53-.53L3 4.44l.53.53L8 9.44l4.47-4.47.53-.53z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" height="16" width="16">
                  <path
                    fill="currentColor"
                    fillRule="evenodd"
                    d="m5.5 1.94.53.53 4.82 4.82a1 1 0 0 1 0 1.42l-4.82 4.82-.53.53L4.44 13l.53-.53L9.44 8 4.97 3.53 4.44 3z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </span>
          </button>
        ) : null}
      </div>
      {hasChildren ? (
        <div className={`sidebar-children ${open ? "open" : ""}`}>
          <ul>
            {node.children.map((child) => (
              <SidebarNode
                key={child.id}
                node={child}
                lang={lang}
                activeId={activeId}
                level={Math.min(level + 1, 3)}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export default function Sidebar({ menu, lang, activeId, collapsed, open, onClose }) {
  // menu 来自 /api/menu（后端读取 public/meta/sidebar.json 生成），
  // 每个节点最终映射到某个 slug，再由 App 去请求 zh/en HTML 内容。
  const nodes = useMemo(() => (Array.isArray(menu) ? menu : []), [menu]);
  const sidebarClass = `app-sidebar ${collapsed ? "collapsed" : ""} ${open ? "open" : ""}`.trim();

  return (
    <aside className={sidebarClass}>
      <div className="sidebar-head">
        <Link to="/" className="sidebar-brand" onClick={onClose}>磁共振成像问答</Link>
        <button type="button" onClick={onClose} className="mobile-only">
          关闭
        </button>
      </div>
      <nav className="sidebar-nav">
        <ul>
          {nodes.map((node) => (
            <SidebarNode
              key={node.id}
              node={node}
              lang={lang}
              activeId={activeId}
              onNavigate={onClose}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}
