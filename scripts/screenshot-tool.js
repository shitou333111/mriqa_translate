const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'screenshots');
const ZH_DIR = path.join(ROOT_DIR, 'zh');
const SERVER_URL = 'http://localhost:5173';

// 选择要截图的元素：取消注释其中一个
// const TARGET_SELECTOR = '.article-html';
const TARGET_SELECTOR = '.card.card-single';

// 手机尺寸（iPhone 14 Pro 尺寸）
const VIEWPORT = {
  width: 393,
  height: 852,
  deviceScaleFactor: 3 // 高分辨率
};

async function ensureScreenshotDir() {
  try {
    await fs.access(SCREENSHOT_DIR);
  } catch {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  }
}

const SIDEBAR_PATH = path.join(ROOT_DIR, 'frontend', 'src', 'meta', 'sidebar.json');

// Build an ordered list of pages (leaf nodes) from sidebar.json with hierarchical numbering.
async function buildOrderedPagesFromSidebar() {
  let raw;
  try {
    raw = await fs.readFile(SIDEBAR_PATH, 'utf-8');
  } catch (e) {
    console.warn('Could not read sidebar.json, falling back to directory order', e.message);
    const files = await fs.readdir(ZH_DIR);
    return files.filter(f => f.endsWith('.html')).map(f => ({ file: f, id: f.replace(/\.html$/i, ''), numbering: null }));
  }

  let menu;
  try {
    menu = JSON.parse(raw);
  } catch (e) {
    console.warn('Invalid sidebar.json, falling back to directory order', e.message);
    const files = await fs.readdir(ZH_DIR);
    return files.filter(f => f.endsWith('.html')).map(f => ({ file: f, id: f.replace(/\.html$/i, ''), numbering: null }));
  }

  const pages = [];
  // 先计算有效的一级章节（排除index和complete-list-of-questions）
  let effectiveTopLevelIndex = 0;
  
  function traverse(nodes, prefix, isTopLevel = false) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((node, idx) => {
      let indices;
      if (isTopLevel) {
        // 一级标题：只对有效章节编号
        if (node.id !== 'index' && node.id !== 'complete-list-of-questions') {
          effectiveTopLevelIndex++;
          indices = [effectiveTopLevelIndex];
        } else {
          // index 和 complete-list-of-questions 没有编号前缀
          indices = [];
        }
      } else {
        // 其他层级：正常编号
        indices = prefix.concat(idx + 1);
      }
      
      if (Array.isArray(node.children) && node.children.length > 0) {
        traverse(node.children, indices, false);
      } else {
        // leaf node -> a page
        const numbering = indices.length > 0 ? indices.join('-') : null;
        pages.push({ id: node.id, numbering });
      }
    });
  }

  traverse(menu, [], true);

  // Filter pages to those that actually exist in zh/ directory and preserve order
  const result = [];
  for (const p of pages) {
    // 排除 complete-list-of-questions 页面
    if (p.id === 'complete-list-of-questions') {
      console.log(`Skipping: ${p.id}`);
      continue;
    }
    const fileName = `${p.id}.html`;
    try {
      await fs.access(path.join(ZH_DIR, fileName));
      // index 页面不需要编号
      const finalNumbering = p.id === 'index' ? null : p.numbering;
      result.push({ file: fileName, id: p.id, numbering: finalNumbering });
    } catch (e) {
      // file missing; skip but log for visibility
      console.warn(`Sidebar entry ${p.id} -> ${fileName} not found in zh/; skipping`);
    }
  }

  return result;
}

async function processPage(page, slug, numbering = null) {
  const cleanSlug = slug.replace('.html', '');
  const url = `${SERVER_URL}/${cleanSlug}`;
  
  console.log(`Processing: ${url}`);
  
  await page.goto(url, { 
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  
  // 等待 React 渲染完成 - 增加超时时间并尝试多个选择器
  let targetFound = false;
  const selectorsToTry = [TARGET_SELECTOR, '.article-html'];
  
  for (const selector of selectorsToTry) {
    try {
      console.log(`  尝试等待选择器: ${selector}`);
      await page.waitForSelector(selector, { timeout: 15000 });
      console.log(`  ✅ 选择器找到: ${selector}`);
      targetFound = true;
      break;
    } catch (e) {
      console.log(`  ⚠️ 选择器未找到: ${selector}`);
    }
  }
  
  if (!targetFound) {
    console.warn(`  ⚠️ 所有选择器都未找到，尝试继续...`);
  }
  
  // 先设置一个大的视口，确保所有内容能正确渲染
  await page.setViewport({
    width: VIEWPORT.width,
    height: 3000,  // 先设置一个足够大的高度
    deviceScaleFactor: VIEWPORT.deviceScaleFactor
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 在页面中执行 DOM 操作
  await page.evaluate((trySelectors) => {
    // 尝试多个选择器找到目标元素
    let targetElement = null;
    for (const selector of trySelectors) {
      targetElement = document.querySelector(selector);
      if (targetElement) break;
    }
    
    if (!targetElement) return;
    
    // 找到实际的文章内容容器（可能在目标元素内部）
    let articleContainer = targetElement.querySelector('.article-html');
    if (!articleContainer) {
      // 如果目标元素本身就是 .article-html，直接使用它
      articleContainer = targetElement;
    }
    
    // 1. 删除"相关问题"部分
    const relatedQuestions = Array.from(articleContainer.querySelectorAll('div.paragraph')).find(el => 
      el.textContent.includes('相关问题')
    );
    if (relatedQuestions) {
      let nextEl = relatedQuestions.nextElementSibling;
      relatedQuestions.remove();
      // 删除后面的分隔线
      if (nextEl && nextEl.tagName === 'DIV' && nextEl.querySelector('hr.styled-hr')) {
        nextEl.remove();
      }
    }
    
    // 2. 删除"上一问题/下一问题/完整问题"部分
    // 找到所有包含 wsite-button 的元素
    const allButtons = Array.from(articleContainer.querySelectorAll('a.wsite-button'));
    const navButtons = allButtons.filter(btn => 
      btn.textContent.includes('上一问题') || 
      btn.textContent.includes('下一问题') || 
      btn.textContent.includes('问题完整列表')
    );
    
    navButtons.forEach(btn => {
      let parent = btn.closest('.wsite-multicol') || btn.closest('div[style*="text-align"]');
      if (parent) {
        parent.remove();
      } else {
        // 如果找不到父容器，直接删除按钮本身
        const wrapper = btn.closest('div');
        if (wrapper) wrapper.remove();
      }
    });
    
    // 3. 删除"参考文献"部分（新的标记是references-collapsible）
    const referencesCollapsible = articleContainer.querySelector('.references-collapsible');
    if (referencesCollapsible) {
      referencesCollapsible.remove();
    }
    
    // 4. 展开"进阶讨论"部分
    const advancedDiscussions = articleContainer.querySelectorAll('div.Q[style*="display:none"]');
    advancedDiscussions.forEach(el => {
      el.style.display = 'block';
    });
    
    // 5. 额外清理：删除所有剩余的分隔线
    const extraDividers = articleContainer.querySelectorAll('hr.styled-hr');
    extraDividers.forEach(hr => {
      const wrapper = hr.closest('div');
      if (wrapper) wrapper.remove();
    });
    
    // 6. 强制重排，清除浮动
    document.body.offsetHeight;
  }, selectorsToTry);
  
  // 等待 DOM 稳定
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 获取目标元素的位置和尺寸 - 尝试多个选择器
  let elementHandle = null;
  let foundSelector = null;
  for (const selector of selectorsToTry) {
    elementHandle = await page.$(selector);
    if (elementHandle) {
      foundSelector = selector;
      console.log(`  ✅ 截图使用选择器: ${selector}`);
      break;
    }
  }
  
  if (!elementHandle) {
    console.warn(`No target element found for ${slug}, tried:`, selectorsToTry);
    return;
  }
  
  const boundingBox = await elementHandle.boundingBox();
  if (!boundingBox) {
    console.warn(`Could not get bounding box for ${slug}`);
    return;
  }
  
  // 设置视口高度为元素高度 + 一些边距
  await page.setViewport({
    width: VIEWPORT.width,
    height: Math.ceil(boundingBox.height) + 150,
    deviceScaleFactor: VIEWPORT.deviceScaleFactor
  });
  
  // 再等待一下，确保视口设置生效
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 截图
  const baseName = numbering ? `${numbering}-${cleanSlug}` : `${cleanSlug}`;
  const screenshotPath = path.join(SCREENSHOT_DIR, `${baseName}.png`);
  await elementHandle.screenshot({
    path: screenshotPath,
    type: 'png',
    fullPage: false
  });
  
  console.log(`Saved: ${screenshotPath}`);
}

async function main() {
  console.log('Starting screenshot generation...');
  console.log(`Server URL: ${SERVER_URL}`);
  
  await ensureScreenshotDir();
  
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  
  let processed = 0;
  let failed = 0;
  const successFiles = [];
  const failedFiles = [];
  
  // Build ordered page list from sidebar.json
  const orderedPages = await buildOrderedPagesFromSidebar();
  console.log(`Will process ${orderedPages.length} pages (ordered by sidebar.json)`);

  for (const pageInfo of orderedPages) {
    const file = pageInfo.file;
    try {
      await processPage(page, file, pageInfo.numbering);
      processed++;
      successFiles.push(`${file} -> ${pageInfo.numbering}`);
    } catch (error) {
      console.error(`Failed to process ${file}:`, error.message);
      failed++;
      failedFiles.push(`${file}: ${error.message}`);
    }

    // 小延迟避免服务器过载
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  await browser.close();
  
  // 生成时间戳
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // 保存成功记录
  const successLogPath = path.join(SCREENSHOT_DIR, `success-${timestamp}.txt`);
  let successContent = `=== Success Log - ${new Date().toLocaleString()} ===\n\n`;
  successContent += `Total: ${successFiles.length}\n\n`;
  successContent += successFiles.join('\n');
  await fs.writeFile(successLogPath, successContent, 'utf-8');
  
  // 保存失败记录
  const failedLogPath = path.join(SCREENSHOT_DIR, `failed-${timestamp}.txt`);
  let failedContent = `=== Failed Log - ${new Date().toLocaleString()} ===\n\n`;
  failedContent += `Total: ${failedFiles.length}\n\n`;
  failedContent += failedFiles.join('\n');
  await fs.writeFile(failedLogPath, failedContent, 'utf-8');
  
  console.log('\n=== Summary ===');
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`Success log: ${successLogPath}`);
  console.log(`Failed log: ${failedLogPath}`);
}

main().catch(console.error);
