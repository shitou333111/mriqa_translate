import { useState, useEffect, useRef } from "react";
import "./SiteFooter.css";

const OriginalFooterContent = () => (
  <div className="wsite-multicol" style={{ width: '100%' }}>
    <div className="wsite-multicol-table-wrap" style={{ margin: "0 -15px" }}>
      <table className="wsite-multicol-table">
        <tbody className="wsite-multicol-tbody">
          <tr className="wsite-multicol-tr">
            <td className="wsite-multicol-col" style={{ width: "34%", padding: "0 15px" }}>
              <div className="paragraph" style={{ textAlign: "center" }}>
                <font size="2">
                  &copy; 2026 AD Elster, ELSTER LLC<br />
                  All rights reserved.<br />
                  <a href="https://mriquestions.com" target="_blank" rel="noreferrer">MRIquestions.com - Home</a>
                </font>
              </div>
            </td>
            <td className="wsite-multicol-col" style={{ width: "31.87%", padding: "0px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ height: "0px", overflow: "hidden" }}></div>
                <span className="wsite-social wsite-social-default">
                  <a className="first-child wsite-social-item wsite-social-facebook" href="https://www.facebook.com/pages/Questions-and-Answers-in-MRI/1552262288323817" target="_blank" rel="noreferrer" aria-label="Facebook">
                    <span className="wsite-social-item-inner"></span>
                  </a>
                  <a className="wsite-social-item wsite-social-pinterest" href="https://www.pinterest.com/MRIquestions/boards/" target="_blank" rel="noreferrer" aria-label="Pinterest">
                    <span className="wsite-social-item-inner"></span>
                  </a>
                  <a className="wsite-social-item wsite-social-twitter" href="http://twitter.com/MRIQuestions" target="_blank" rel="noreferrer" aria-label="Twitter">
                    <span className="wsite-social-item-inner"></span>
                  </a>
                  <a className="wsite-social-item wsite-social-mail" href="mailto:elsterllc@gmail.com" target="_blank" rel="noreferrer" aria-label="Mail">
                    <span className="wsite-social-item-inner"></span>
                  </a>
                  <a className="last-child wsite-social-item wsite-social-youtube" href="https://www.youtube.com/channel/UCoTjouO2V2VigXhKtu-xC3A" target="_blank" rel="noreferrer" aria-label="Youtube">
                    <span className="wsite-social-item-inner"></span>
                  </a>
                </span>
                <div style={{ height: "0px", overflow: "hidden" }}></div>
              </div>
            </td>
            <td className="wsite-multicol-col" style={{ width: "34%", padding: "0px" }}>
              <div>
                <div className="wsite-multicol">
                  <div className="wsite-multicol-table-wrap" style={{ margin: "0 -15px" }}>
                    <table className="wsite-multicol-table">
                      <tbody className="wsite-multicol-tbody">
                        <tr className="wsite-multicol-tr">
                          <td className="wsite-multicol-col" style={{ width: "80%", padding: "10px 0 0 0" }}>
                            <div align="center" style={{ width: "100%", overflowY: "hidden" }} className="wcustomhtml">
                              <a style={{ background: "#3498db url(https://donorbox.org/images/white_logo.svg) no-repeat 25px", color: "#fff", textDecoration: "none", fontFamily: "Verdana,sans-serif", display: "inline-block", fontSize: "16px", padding: "15px 45px", paddingLeft: "70px", borderRadius: "8px" }} href="https://donorbox.org/support-the-mriquestions-educational-mission">Donate</a>
                            </div>
                            <div className="paragraph" style={{ textAlign: "center" }}>
                              Please help keep this site free for everyone in the world!
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const SelfFooterContent = () => (
  <div className="wsite-multicol" style={{ width: "100%" }}>
    <div className="wsite-multicol-table-wrap" style={{ margin: "0 -15px" }}>
      <table className="wsite-multicol-table">
        <tbody className="wsite-multicol-tbody">
          <tr className="wsite-multicol-tr">
            <td className="wsite-multicol-col" style={{ width: "34%", padding: "0 15px" }}>
              <div className="paragraph" style={{ textAlign: "center"}}>
                <font size="2">
                  译文仅供学习参考，<br />内容版权归原作者所有，致敬!<br />
                  <a href="https://mriquestions.cn" target="_blank" rel="noreferrer">MRIquestions.cn</a>
                </font>
              </div>
            </td>
            <td className="wsite-multicol-col" style={{ width: "31.87%", padding: "0px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ height: "0px", overflow: "hidden" }}></div>
                <span className="wsite-social wsite-social-default" style={{ display: "inline-flex", alignItems: "center", gap: "12px" }}>
                  <a href="https://mp.weixin.qq.com" target="_blank" rel="noreferrer" title="WeChat">
                    <img src="images/微信.ico" style={{ width: "24px", height: "24px", objectFit: "contain" }} alt="WeChat" />
                  </a>
                  <a href="https://www.zhihu.com" target="_blank" rel="noreferrer" title="Zhihu">
                    <img src="images/知乎.ico" style={{ width: "24px", height: "24px", objectFit: "contain" }} alt="Zhihu" />
                  </a>
                  <a href="https://www.xiaohongshu.com" target="_blank" rel="noreferrer" title="Xiaohongshu">
                    <img src="images/小红书.ico" style={{ width: "24px", height: "24px", objectFit: "contain" }} alt="Xiaohongshu" />
                  </a>
                </span>
                <div style={{ height: "0px", overflow: "hidden" }}></div>
              </div>
            </td>
            <td className="wsite-multicol-col" style={{ width: "34%", padding: "0px" }}>
              <div>
                <div className="wsite-multicol">
                  <div className="wsite-multicol-table-wrap" style={{ margin: "0 -15px" }}>
                    <table className="wsite-multicol-table">
                      <tbody className="wsite-multicol-tbody">
                        <tr className="wsite-multicol-tr">
                          <td className="wsite-multicol-col" style={{ width: "80%", padding: "0px 0 0 0" }}>
                            <div align="center" style={{ width: "100%", overflowY: "hidden", padding: "0 0 0 0" }}>
                              <img src="images/Qcode.jpg" alt="Qcode" style={{ width: "100%", maxWidth: "60px", height: "auto" }} />
                            </div>
                            <div className="paragraph" style={{ textAlign: "center", padding: "0 0 5px 0" }}>
                              打赏维持服务器开销
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

function FooterHalf({ children, onImgClick }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  const designWidth = 720;
  const baseHeight = 100;

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      setScale(Math.min(1, width / designWidth));
    });
    if (ref.current) {
      observer.observe(ref.current);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="footer-half"
      ref={ref}
      onClick={onImgClick}
      style={{
        flex: "1 1 500px", // Stack vertically seamlessly
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        maxWidth: "100%",
        height: `${baseHeight * scale}px`,
        position: "relative",
      }}
    >
      <div
        style={{
          width: `${designWidth}px`,
          height: `${baseHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          position: "absolute",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          className="footer-half-content"
          style={{ width: "100%" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default function SiteFooter() {
  const [modalOpen, setModalOpen] = useState(false);

  const handleHalfClick = (e) => {
    if (e.target.tagName === "IMG" && e.target.src.includes("Qcode")) {
      setModalOpen(true);
    }
  };

  return (
    <>
      <footer className="global-site-footer">
        <div className="global-site-footer-split">
          <FooterHalf>
             <OriginalFooterContent />
          </FooterHalf>

          <div className="footer-divider" />

          <FooterHalf onImgClick={handleHalfClick}>
             <SelfFooterContent />
          </FooterHalf>
        </div>
      </footer>

      {modalOpen && (
        <div className="sponsor-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="sponsor-modal-content" onClick={(e) => e.stopPropagation()}>
            <img src="/images/Qcode.jpg" alt="Qcode Enlarge" className="sponsor-modal-img" />
            <div style={{ textAlign: "center", marginTop: "16px", color: "white", fontSize: "18px" }}>
               扫码支持，感谢您的慷慨！
            </div>
            <button className="sponsor-modal-close" onClick={() => setModalOpen(false)}>✕</button>
          </div>
        </div>
      )}
    </>
  );
}

