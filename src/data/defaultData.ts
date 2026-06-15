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
        id: 'block-welcome-2',
        type: 'text',
        content: '这是一个离线优先 (Offline-First) 的本地文档编辑器。您在此编辑的所有内容均保存在本机的 LocalStorage 中，隐私数据不出本地。'
      },
      {
        id: 'block-welcome-3',
        type: 'heading-2',
        content: '核心亮点与特色'
      },
      {
        id: 'block-welcome-4',
        type: 'text',
        content: '1. 块级设计: 基于 BlockNote 的块编辑器，支持标题、文本、代码、图片等多种块类型。'
      },
      {
        id: 'block-welcome-5',
        type: 'text',
        content: '2. 双链知识库: 输入双括号 [[ 即可选择或新建关联文档，建立知识互联结构。'
      },
      {
        id: 'block-welcome-6',
        type: 'text',
        content: '3. 快捷指令菜单: 在任意空白行输入 /，即可呼出快捷创建菜单，支持标题、代码块、图片等。'
      },
      {
        id: 'block-welcome-7',
        type: 'heading-2',
        content: '代码示例'
      },
      {
        id: 'block-welcome-8',
        type: 'text',
        content: '下方是一个代码块示例：'
      },
      {
        id: 'block-welcome-9',
        type: 'code',
        content: 'function greet(name: string) {\n  console.log(`Hello, ${name}!`);\n}\n\ngreet("JStudio");',
        properties: {
          language: 'typescript'
        }
      },
      {
        id: 'block-welcome-10',
        type: 'heading-3',
        content: '下一步'
      },
      {
        id: 'block-welcome-11',
        type: 'text',
        content: '试试输入 / 呼出快捷菜单，或者输入 [[ 创建文档链接。更多块类型将陆续添加！'
      }
    ]
  },
  {
    id: 'doc-markdown-cheatsheet',
    title: 'Markdown 语法速查',
    emoji: '',
    createdAt: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    isFavorite: true,
    blocks: [
      {
        id: 'block-md-1',
        type: 'heading-1',
        content: 'Markdown 语法速查表'
      },
      {
        id: 'block-md-2',
        type: 'text',
        content: '在 JStudio 中，你可以使用块编辑器来实现类似 Markdown 的写作体验。以下是一些常用语法。'
      },
      {
        id: 'block-md-3',
        type: 'heading-2',
        content: '标题'
      },
      {
        id: 'block-md-4',
        type: 'text',
        content: '输入 / 然后选择 Heading，或者使用 Markdown 快捷输入 # ## ### 来快速创建不同级别的标题。'
      },
      {
        id: 'block-md-5',
        type: 'heading-2',
        content: '代码'
      },
      {
        id: 'block-md-6',
        type: 'code',
        content: '// 支持语法高亮的代码块\nconst numbers = [1, 2, 3, 4, 5];\nconst doubled = numbers.map(n => n * 2);\nconsole.log(doubled); // [2, 4, 6, 8, 10]',
        properties: {
          language: 'javascript'
        }
      },
      {
        id: 'block-md-7',
        type: 'heading-2',
        content: '图片'
      },
      {
        id: 'block-md-8',
        type: 'text',
        content: '通过 / 菜单选择 Image，或直接粘贴/拖拽图片到编辑器中即可插入。'
      },
      {
        id: 'block-md-9',
        type: 'heading-3',
        content: '提示'
      },
      {
        id: 'block-md-10',
        type: 'text',
        content: '块编辑器支持拖拽排序、嵌套等操作。点击块左侧的拖拽手柄即可移动块的位置。'
      }
    ]
  }
];
