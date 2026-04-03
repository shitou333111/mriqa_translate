export default function GuidePage({ onStartGuideTour }) {
  return (
    <section className="card card-single guide-card guide-landing">
      <div className="guide-hero">
        {/* <p className="guide-eyebrow">MRI QA 中文翻译项目</p> */}
        <h2>欢迎来到 MRI 问答中文站</h2>
        <p className="guide-summary">
          这里是对
          {" "}
          <a
            href="https://mriquestions.com"
            target="_blank"
            rel="noreferrer"
            className="guide-inline-link"
          >
            mriquestions.com
          </a>
          {" "}
          网站内容的中文翻译。这其实是之前的翻译项目，最近整理文件翻出来，就索性把它分享出来吧。很多专业的老师是不需要看中文的，但或许也有不少从业人员看中文会容易些。而且原网站在国外，访问性能比较差。近期生活不顺，本来没心思分享，但丢掉也可惜，希望能帮到大家，进一步最终帮助到患者。谨向原作者 Allen D Elster 致敬，
          感谢其长期开放、系统且高质量的 MRI 教育资源。
        </p>
      </div>

      <div className="guide-grid">
        <article className="guide-panel">
          <h3>版权与知识产权声明</h3>
          <p>
            本站仅做学习用途的翻译与分享，所有知识产权与版权均归原作者及原网站所有。
          </p>
          <a
            href="/copyright-issues.html"
            target="_blank"
            rel="noreferrer"
            className="guide-panel-link"
          >
            查看原作者版权声明
          </a>
        </article>

        <article className="guide-panel">
          <h3>医疗临床免责声明</h3>
          <p>
            本站内容仅用于教育和科普，不构成医学诊疗建议，不能替代医师的临床判断。
          </p>
          <a
            href="/legal-disclaimers.html"
            target="_blank"
            rel="noreferrer"
            className="guide-panel-link"
          >
            查看原作者免责声明
          </a>
        </article>

        <article className="guide-panel">
          <h3>建议与反馈</h3>
          <p>
            欢迎大家在页面下方的评论区提交网站建议，每个页面的评论区讨论内容翻译建议。你的反馈可以帮助本站持续改进。有比较私密的建议也可以直接发邮件给我。
          </p>
          <a href="mailto:songbenshen@126.com" className="guide-panel-link">发送邮件反馈</a>
        </article>

        <article className="guide-panel guide-panel-todo">
          <h3>To do</h3>
          <ul className="guide-todo-list">
            <li>增加留言功能</li>
            <li>增强中文搜索功能</li>
            <li>现在是github服务器，迁移到国内服务器</li>
            <li>购买使用mriquestions.cn域名</li>
            <li>完善夜间模式</li>
          </ul>
        </article>

        <article className="guide-panel">
          <h3>贡献翻译</h3>
          <p>
            由于近期没心思优化翻译，所以开发了这套共享翻译系统。任何人都可以参与，并且直接在页面修改提交，希望大家积极参与。我不是专业程序员，选择的也是简便的修改策略，翻译功能并不稳健，大家可以先从 test 页面练手。
          </p>
          <a href="/test" className="guide-panel-link">打开 test 页面练习</a>
        </article>

        <article className="guide-panel guide-panel-support">
          <h3>支持与打赏</h3>
          <p>欢迎支持翻译维护与服务器运行。以及打赏奶茶鼓励翻译内容，还是花了很多精力和时间的。可直接扫码打赏。</p>
          <img className="guide-qcode-image" src="/images/Qcode.jpg" alt="支持与打赏二维码" />
        </article>
      </div>

      <div className="guide-tour-entry">
        <button type="button" className="toolbar-btn guide-tour-btn" onClick={onStartGuideTour}>
          点击查看网站使用指南
        </button>
      </div>
    </section>
  );
}
