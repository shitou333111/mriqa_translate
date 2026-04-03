# HTML 页面截图工具

这个工具用于将网站的中文页面转换为适合手机阅读的高清图片。

## 功能特性

- ✅ 只保存中文页面
- ✅ 截取 `article-html` 标签内的内容
- ✅ 自动删除"相关问题"部分
- ✅ 自动删除"上一问题/下一问题/完整问题"导航按钮
- ✅ 自动展开"进阶讨论"部分
- ✅ 手机尺寸（393×852，iPhone 14 Pro 尺寸）
- ✅ 高分辨率（3x 缩放）
- ✅ 不会修改原始 HTML 文件

## 安装依赖

```bash
npm install
```

这会安装 Puppeteer 依赖。

## 使用步骤

### 1. 启动开发服务器

首先确保 Vite 开发服务器正在运行：

```bash
npm run dev
```

或者分别启动：

```bash
# 终端 1 - 启动后端服务器
npm run dev:server

# 终端 2 - 启动 Vite 前端服务器
npm run dev:frontend
```

Vite 前端服务器默认运行在 `http://localhost:5173`。

### 2. 运行截图工具

在另一个终端窗口中运行：

```bash
npm run screenshots
```

或者直接运行：

```bash
node screenshot-tool.js
```

## 配置选项

在 `screenshot-tool.js` 文件中可以修改以下配置：

### 服务器地址

```javascript
const SERVER_URL = 'http://localhost:3000';
```

### 手机尺寸

```javascript
const VIEWPORT = {
  width: 393,        // 手机宽度
  height: 852,       // 手机高度
  deviceScaleFactor: 3  // 缩放因子（越高越清晰）
};
```

### 截图保存目录

```javascript
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
```

## 输出结果

截图会保存在 `screenshots` 目录中，文件名与 HTML 文件名对应（扩展名改为 `.png`）。

示例：
- `zh/what-is-a-gradient.html` → `screenshots/what-is-a-gradient.png`

## 工作原理

1. 使用 Puppeteer 启动无头浏览器
2. 访问每个中文页面
3. 等待 React 应用渲染完成
4. 在浏览器中执行 DOM 操作：
   - 删除"相关问题"部分
   - 删除导航按钮
   - 展开"进阶讨论"
5. 截取 `article-html` 元素的内容
6. 保存为 PNG 图片

## 注意事项

- 确保服务器在 `http://localhost:3000` 上运行
- 首次运行会下载 Chromium 浏览器（约 100-200MB）
- 处理大量页面可能需要一些时间
- 每个页面之间有 500ms 延迟避免服务器过载

## 故障排除

### Puppeteer 安装失败

如果 Puppeteer 安装失败，可以尝试：

```bash
npm install puppeteer --ignore-scripts
```

然后手动下载 Chromium 或使用系统安装的 Chrome。

### 页面加载超时

增加超时时间：

```javascript
await page.goto(url, { 
  waitUntil: 'networkidle2',
  timeout: 60000  // 增加到 60 秒
});
```

### 找不到 article-html 元素

确保服务器正在运行并且页面能正常访问。

## 技术栈

- [Puppeteer](https://pptr.dev/) - Headless Chrome Node.js API
- Node.js - 运行环境
