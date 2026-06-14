import { Document } from '../types';

export const DEFAULT_DOCUMENTS: Document[] = [
  {
    id: 'doc-welcome',
    title: '欢迎体验 JStudio 本地知识库',
    emoji: '',
    createdAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString(), // 3 days ago
    updatedAt: new Date().toISOString(),
    isFavorite: true,
    blocks: [
      {
        id: 'block-welcome-1',
        type: 'heading-1',
        content: '欢迎来到 JStudio 个性化本地文档系统'
      },
      {
        id: 'block-welcome-callout',
        type: 'callout',
        content: '这是一个离线优先 (Offline-First) 且高度自由的本地双链知识库编辑器。您在此编辑的所有内容均保存在本机的 LocalStorage 中，隐私数据不出本地。',
        properties: {
          emoji: ''
        }
      },
      {
        id: 'block-welcome-2',
        type: 'heading-2',
        content: '核心亮点与特色'
      },
      {
        id: 'block-welcome-3',
        type: 'text',
        content: '1. 网页嵌入 & 附件: 支持在文档中内嵌外部网页（URL），也可以添加各种文件附件（HTML、图片等），支持预览和卡片两种展示模式。参考：[[HTML 互动实验室]]。'
      },
      {
        id: 'block-welcome-4',
        type: 'text',
        content: '2. 块级设计与无缝链接: 输入双括号 `[[` 即可选择或新建关联文档（例如：[[专业画板测试]]），建立知识互联结构。'
      },
      {
        id: 'block-welcome-5',
        type: 'text',
        content: '3. 快捷指令菜单: 在任意空白行输入 `/`，将立刻唤出快捷创建组件菜单，提供对 代码块、表格、画板、引用块、图片、折叠区 的极速写入支持。'
      },
      {
        id: 'block-welcome-6',
        type: 'heading-2',
        content: '快捷测试：编辑下方的组件'
      },
      {
        id: 'block-welcome-7',
        type: 'text',
        content: '下方附带了一个简易任务状态表，您可以自由对下列表格的内容、列数进行添加和删除：'
      },
      {
        id: 'block-welcome-table',
        type: 'table',
        content: '任务清单数据',
        properties: {
          tableData: [
            ['功能模块', '当前状态', '重要度', '备注说明'],
            ['HTML 在线渲染', '已实现', '核心', '代码块支持 HTML 渲染预览'],
            ['网页嵌入 & 附件', '已实现', '核心', 'URL 嵌入 + 文件附件双模式'],
            ['离线数据存储', '已实现', '核心', '不依赖外网的本地状态'],
            ['白板支持 (tldraw)', '已实现', '高级', '引入 tldraw 作为专业画板'],
            ['跨平台云同步', '模拟中', '拓展', '本地多机同步同步演示'],
            ['/ 快捷指令呼出', '已实现', '基础', '快捷指令全块支持']
          ]
        }
      },
      {
        id: 'block-welcome-8',
        type: 'heading-3',
        content: '下一步建议'
      },
      {
        id: 'block-welcome-9',
        type: 'text',
        content: '点击上方或侧边栏的 [[HTML 互动实验室]] 体验动态组件的震撼效果，或者前往 [[Canvas 涂鸦画板]] 随意进行手绘草图创作！'
      }
    ]
  },
  {
    id: 'doc-html-lab',
    title: 'HTML 互动实验室',
    emoji: '',
    createdAt: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    isFavorite: true,
    blocks: [
      {
        id: 'block-html-1',
        type: 'heading-1',
        content: 'HTML 渲染与网页嵌入演示'
      },
      {
        id: 'block-html-desc',
        type: 'text',
        content: '在 JStudio 中，代码块支持 HTML 语言的渲染预览。点击代码块右上角的 Eye 图标即可切换渲染效果。此外，我们还提供了独立的「网页」块用于嵌入外部 URL，以及「附件」块用于管理各类文件。'
      },
      {
        id: 'block-html-callout',
        type: 'callout',
        content: '这是在 [[欢迎体验 JStudio 本地知识库]] 提到过的最有趣的特色之一。您可以点击编辑按钮直接修改底下的代码，页面渲染内容会随之立竿见影地更新！',
        properties: {
          emoji: ''
        }
      },
      {
        id: 'block-html-sandbox',
        type: 'code',
        content: `<!DOCTYPE html>
<html>
<head>
  <style>
    .interactive-card {
      font-family: system-ui, sans-serif;
      background: linear-gradient(135deg, #1e1e38 0%, #3b3b75 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
      max-width: 360px;
      margin: 16px auto;
    }
    .interactive-card h3 { margin-top: 0; color: #a78bfa; }
    .counter-box { display: flex; align-items: center; gap: 15px; margin: 15px 0; }
    #counter-value { font-size: 2rem; font-weight: bold; color: #34d399; }
    button {
      background-color: #4f46e5; color: white; border: none;
      padding: 8px 16px; border-radius: 6px; cursor: pointer; transition: background 0.2s;
    }
    button:hover { background-color: #4338ca; }
    .progress-bar-container {
      background-color: rgba(255,255,255,0.1); height: 8px;
      border-radius: 4px; overflow: hidden;
    }
    #progress-bar { background: #34d399; height: 100%; transition: width 0.3s; }
  </style>
</head>
<body>
  <div class="interactive-card">
    <h3>我的动态数据跟踪器</h3>
    <p>点击右侧「渲染」按钮即可预览 HTML 效果。</p>
    <div class="counter-box">
      <span id="counter-value">12</span>
      <button id="add-btn">点击新增记录</button>
    </div>
    <div class="progress-bar-container">
      <div id="progress-bar" style="width: 60%"></div>
    </div>
  </div>
  <script>
    const btn = document.getElementById('add-btn');
    const value = document.getElementById('counter-value');
    const bar = document.getElementById('progress-bar');
    let count = 12;
    btn.addEventListener('click', () => {
      count += 1;
      value.innerText = count;
      const percent = Math.min((count / 30) * 100, 100);
      bar.style.width = percent + '%';
    });
  </script>
</body>
</html>`,
        properties: {
          language: 'html'
        }
      },
      {
        id: 'block-html-web-embed-demo',
        type: 'heading-3',
        content: '网页嵌入示例'
      },
      {
        id: 'block-html-web-embed',
        type: 'web-embed',
        content: '',
        properties: {
          embedUrl: 'https://example.com'
        }
      },
      {
        id: 'block-html-conclusion',
        type: 'text',
        content: '通过代码块的渲染功能，您可以把各种交互页面集成进文档。网页块和附件块则分别处理外部链接和文件管理，让文档内容更加丰富。'
      }
    ]
  },
  {
    id: 'doc-canvas-lab',
    title: 'Canvas 涂鸦画板',
    emoji: '',
    createdAt: new Date(Date.now() - 3600000 * 24 * 1.5).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    isFavorite: false,
    blocks: [
      {
        id: 'block-canvas-1',
        type: 'heading-1',
        content: '自由脑图与涂鸦空间'
      },
      {
        id: 'block-canvas-intro',
        type: 'text',
        content: '文档中如果只能打字是非常有局限性的。现在，JStudio 支持了内嵌式 `HTML5 Drawing Canvas`（涂鸦画板）块。您可以使用鼠标、触控笔在页面里随便画线、批改或是勾画脑图。'
      },
      {
        id: 'block-canvas-widget',
        type: 'canvas',
        content: '',
        properties: {
          drawingPaths: []
        }
      },
      {
        id: 'block-whiteboard-title',
        type: 'heading-2',
        content: '专业画板 (Tldraw)'
      },
      {
        id: 'block-whiteboard-intro',
        type: 'text',
        content: '另外，新引入了基于 TLDraw 的无限扩展电子白板（支持箭头、多边形框、文字和自由排版等），适合流程图、架构图等专业绘图需求。'
      },
      {
        id: 'block-whiteboard-widget',
        type: 'whiteboard',
        content: '',
        properties: {}
      },
      {
        id: 'block-canvas-tip',
        type: 'callout',
        content: '您可以通过调色盘更换颜色，也可以切换线条宽度，甚至是一键清除重画。数据自动保存至本地对应的 Document 节点块。通过 [[欢迎体验 JStudio 本地知识库]] 就能随时跳转回起点。',
        properties: {
          emoji: ''
        }
      }
    ]
  }
];
