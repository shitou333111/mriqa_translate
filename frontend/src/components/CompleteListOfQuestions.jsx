import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import sidebarData from "../meta/sidebar.json";

const IS_GITHUB_PAGES = typeof window !== "undefined" && /github\.io$/i.test(window.location.hostname);

export default function CompleteListOfQuestions() {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLevel1, setSelectedLevel1] = useState(null);
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [reviewStatus, setReviewStatus] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add("complete-list-page");
    return () => {
      document.body.classList.remove("complete-list-page");
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      setLoading(true);
      setError("");
      try {
        let menuData = [];
        let statusData = {};

        if (IS_GITHUB_PAGES) {
          menuData = Array.isArray(sidebarData) ? sidebarData : [];
        } else {
          const [menuResp, statusResp] = await Promise.all([
            fetch("/api/menu"),
            fetch("/api/review-status")
          ]);

          if (!menuResp.ok || !statusResp.ok) {
            throw new Error("加载数据失败");
          }

          [menuData, statusData] = await Promise.all([menuResp.json(), statusResp.json()]);
        }
        
        if (ignore) {
          return;
        }
        
        const excludeIds = ["copyright-legal", "forumsblogslinks", "rf-pulses"];
        const filtered = menuData.filter((item) => 
          item.id !== "index" && 
          item.id !== "complete-list-of-questions" &&
          item.id !== "copyrightlegal" &&
          !excludeIds.includes(item.id)
        );
        
        setMenu(filtered);
        setReviewStatus(statusData || {});
        
        if (filtered.length > 0) {
          setSelectedLevel1(filtered[0].id);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "加载失败");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  const handleCardClick = (slug) => {
    navigate(`/${slug}`);
  };

  const countPendingInLevel2 = (level2) => {
    let count = 0;
    if (level2.children && level2.children.length > 0) {
      for (const level3 of level2.children) {
        if (reviewStatus[level3.id]?.needsReview) {
          count++;
        }
      }
    } else {
      if (reviewStatus[level2.id]?.needsReview) {
        count++;
      }
    }
    return count;
  };

  const countPendingInLevel1 = (level1) => {
    let count = 0;
    if (level1.children) {
      for (const level2 of level1.children) {
        count += countPendingInLevel2(level2);
      }
    }
    return count;
  };

  const getAllPendingItems = () => {
    const items = [];
    for (const level1 of menu) {
      if (level1.children) {
        for (const level2 of level1.children) {
          if (level2.children && level2.children.length > 0) {
            for (const level3 of level2.children) {
              if (reviewStatus[level3.id]?.needsReview) {
                items.push(level3);
              }
            }
          } else {
            if (reviewStatus[level2.id]?.needsReview) {
              items.push(level2);
            }
          }
        }
      }
    }
    return items;
  };

  const totalPending = getAllPendingItems().length;

  if (loading) {
    return <section className="card card-single">正在加载...</section>;
  }
  if (error) {
    return <section className="card card-single error">{error}</section>;
  }

  const currentLevel1 = menu.find((item) => item.id === selectedLevel1);

  return (
    <div className="complete-list-container">
      <aside className="complete-list-sidebar">
        <div className="sidebar-content">
          <nav className="sidebar-nav">
            <button
              type="button"
              className={`nav-level-1 nav-pending ${showOnlyPending ? "active" : ""}`}
              onClick={() => setShowOnlyPending(true)}
            >
              <span className="nav-text">待审核页面汇总</span>
              {totalPending > 0 && (
                <span className="nav-badge">{totalPending}</span>
              )}
            </button>
            {menu.map((level1) => {
              const pendingCount = countPendingInLevel1(level1);
              return (
                <button
                  key={level1.id}
                  type="button"
                  className={`nav-level-1 ${!showOnlyPending && selectedLevel1 === level1.id ? "active" : ""}`}
                  onClick={() => {
                    setShowOnlyPending(false);
                    setSelectedLevel1(level1.id);
                  }}
                >
                  <span className="nav-text">{level1.title.zh}</span>
                  {pendingCount > 0 && (
                    <span className="nav-badge">{pendingCount}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="complete-list-main">
        <div className="main-content">
          {showOnlyPending ? (
            <div className="pending-items-masonry">
              {getAllPendingItems().map((item) => (
                <div
                  key={item.id}
                  className="level3-card needs-review"
                  onClick={() => handleCardClick(item.id)}
                >
                  <div className="level3-card-content">
                    <h4 className="level3-card-title">{item.title.zh}</h4>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            currentLevel1?.children && currentLevel1.children.length > 0 && (
              <div className="level2-card-grid">
                {currentLevel1.children.map((level2) => {
                  const hasChildren = level2.children && level2.children.length > 0;
                  const pendingCount = countPendingInLevel2(level2);
                  
                  if (hasChildren) {
                    return (
                      <div key={level2.id} className="level2-card">
                        <div className="level2-card-header">
                          <h3 className="level2-card-title">{level2.title.zh}</h3>
                          {pendingCount > 0 && (
                            <span className="card-badge">{pendingCount}</span>
                          )}
                        </div>
                        <div className="level2-card-body">
                          <div className="level3-card-grid">
                            {level2.children.map((level3) => {
                              const needsReview = reviewStatus[level3.id]?.needsReview;
                              return (
                                <div
                                  key={level3.id}
                                  className={`level3-card ${needsReview ? "needs-review" : ""}`}
                                  onClick={() => handleCardClick(level3.id)}
                                >
                                  <div className="level3-card-content">
                                    <h4 className="level3-card-title">{level3.title.zh}</h4>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    const needsReview = reviewStatus[level2.id]?.needsReview;
                    return (
                      <div key={level2.id} className="level2-card level2-card-transparent">
                        <div className="level2-card-body">
                          <div className="level3-card-grid">
                            <div
                              className={`level3-card ${needsReview ? "needs-review" : ""}`}
                              onClick={() => handleCardClick(level2.id)}
                            >
                              <div className="level3-card-content">
                                <h4 className="level3-card-title">{level2.title.zh}</h4>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
