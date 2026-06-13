import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useMemo } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Block, BlockType, CanvasPath, Document } from "../types";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import getCaretCoordinates from "textarea-caret";

// Tag names of inline elements the auto-formatter inserts. We treat these as
// "trap" elements that the caret can get stuck inside, and we provide
// keyboard hooks to escape them.
const INLINE_FORMATTED_TAGS = ["CODE", "B", "STRONG", "A", "I", "EM", "U", "SPAN"];

// Preset templates for the sandbox. Module-level so the PresetMenu component
// can reference it without re-allocating on every BlockItem render.
const SANDBOX_PRESETS = [
  {
    name: "磨砂玻璃卡片",
    html: `<div class="max-w-sm mx-auto p-8 rounded-2xl bg-white/20 dark:bg-white/10 backdrop-blur-md border border-white/20 shadow-xl flex flex-col items-center justify-center text-center transition-all duration-300 hover:shadow-2xl">
  <div class="w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-2xl shadow-lg mb-4 animate-bounce">
    ✨
  </div>
  <h3 class="text-lg font-extrabold text-slate-800 dark:text-white mb-1">交互玻璃计算器</h3>
  <p class="text-xs text-slate-500 dark:text-slate-300 mb-6 leading-relaxed">Tailwind CDN 及 FontAwesome 已经预加载。体验纯粹的前端快速原型设计！</p>

  <!-- Counter Widget -->
  <div class="flex items-center gap-6 bg-slate-900/5 dark:bg-black/20 px-6 py-2.5 rounded-full mb-6">
    <button id="btn-dec" class="w-8 h-8 rounded-full bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow hover:bg-slate-50 active:scale-90 flex items-center justify-center font-bold font-mono transition-transform">-</button>
    <span id="counter" class="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono w-12 text-center">0</span>
    <button id="btn-inc" class="w-8 h-8 rounded-full bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow hover:bg-slate-50 active:scale-90 flex items-center justify-center font-bold font-mono transition-transform">+</button>
  </div>

  <button id="btn-add-p" class="w-full text-xs font-bold text-slate-700 dark:text-white bg-emerald-400/80 hover:bg-emerald-500/80 border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1 transition-all rounded-md py-1.5 shadow-md">点我生成粒子</button>
  <button id="btn-clear-p" class="mt-2 text-[10px] text-slate-500 hover:text-red-500 dark:text-slate-400 transition-colors">清空画布</button>
  <canvas id="particles" class="fixed inset-0 pointer-events-none -z-10"></canvas>
</div>`,
    css: ``,
    js: `// Counter logic
let count = 0;
const counter = document.getElementById('counter');
document.getElementById('btn-inc').onclick = () => { count++; counter.textContent = count; };
document.getElementById('btn-dec').onclick = () => { count--; counter.textContent = count; };

// Particle system
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
let particles = [];

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function createParticle() {
  return {
    x: Math.random() * canvas.width,
    y: canvas.height + 10,
    vx: (Math.random() - 0.5) * 2,
    vy: -Math.random() * 3 - 1,
    size: Math.random() * 4 + 2,
    hue: Math.random() * 360,
    life: 1.0,
    decay: Math.random() * 0.01 + 0.005
  };
}

for(let i = 0; i < 50; i++) particles.push(createParticle());

document.getElementById('btn-add-p').addEventListener('click', () => {
  for(let i = 0; i < 20; i++) particles.push(createParticle());
});

document.getElementById('btn-clear-p').addEventListener('click', () => {
  particles = [];
});

function draw() {
  ctx.fillStyle = 'rgba(11, 15, 25, 0.2)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  particles.forEach((p, idx) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;

    ctx.fillStyle = 'hsla(' + p.hue + ', 80%, 60%, ' + p.life + ')';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    if (p.life <= 0 || p.y < -20) {
      particles[idx] = createParticle();
      particles[idx].y = canvas.height + 10;
    }
  });

  requestAnimationFrame(draw);
}
draw();`,
  },
  {
    name: "新丑撞色事件板",
    html: `<div class="max-w-xs mx-auto p-6 bg-[#ffe4e6] border-4 border-slate-950 rounded-none shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
  <div class="flex justify-between items-center">
    <span class="text-[9.5px] font-mono font-black border-2 border-slate-950 px-2 py-0.5 bg-yellow-300 text-slate-950">NEO-BRUTALISM</span>
    <span class="text-xs font-bold text-slate-900">⚡ ACTIVE</span>
  </div>
  <h2 class="text-xl font-black text-slate-950 tracking-tight">像素微件反应堆</h2>
  <p class="text-xs text-slate-705 leading-normal font-medium">拒绝圆角！采用纯粹的黑度硬核边框和平面色彩块。让纯端排版焕发出别具格调的设计张力。</p>

  <div id="reactor-box" class="p-3 bg-white border-2 border-slate-950 text-xs font-mono font-semibold text-slate-900 text-center transition-all">
    状态：等待指令载入
  </div>

  <button id="trigger-react" class="cursor-pointer text-xs font-black border-2 border-slate-950 py-2 bg-indigo-400 hover:bg-slate-950 hover:text-white transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">试一下触发点击</button>
</div>`,
    css: ``,
    js: `const logTags = [
  "⚡ 核反应堆稳定",
  "🧩 CSS 样式层叠正常",
  "🔮 沙盒内原子扩散完毕",
  "🔋 电池系统充电 98%",
  "✨ 离线数据同步完美"
];
const box = document.getElementById('reactor-box');
document.getElementById('trigger-react').addEventListener('click', () => {
  const chosen = logTags[Math.floor(Math.random() * logTags.length)];
  box.textContent = chosen;
  box.style.backgroundColor = 'hsl(' + (Math.random() * 360) + ', 85%, 90%)';
});`,
  },
];

const normalizeSandboxUrl = (url: string) => {
  const value = url.trim();
  if (!value) return "";
  if (/^(https?:|file:|data:|tauri:)\/\//i.test(value)) return value;
  return `https://${value}`;
};

interface PresetMenuProps {
  loadPresetIntoSandbox: (preset: {
    html: string;
    css: string;
    js: string;
  }) => void;
}

function PresetMenu({ loadPresetIntoSandbox }: PresetMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.parentElement?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer inline-flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        Preset
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 min-w-[180px] bg-white dark:bg-[#252526] border border-slate-200 dark:border-white/[0.08] shadow-lg rounded-md py-1 text-xs">
          {SANDBOX_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => {
                loadPresetIntoSandbox(preset);
                setOpen(false);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-700 dark:text-slate-200"
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SandboxPreviewProps {
  fileSrc: string;
  fileName: string;
  url: string;
  srcDoc: string;
  runIndicator: number;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}

/**
 * Auto-detects the preview source from `fileSrc > url > srcDoc` and renders a
 * single iframe. Shows a small badge for the current source kind and an
 * empty-state placeholder when no source is available.
 */
function SandboxPreview({
  fileSrc,
  fileName,
  url,
  srcDoc,
  runIndicator,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
}: SandboxPreviewProps) {
  const kind: "file" | "url" | "code" | "empty" = fileSrc
    ? "file"
    : normalizeSandboxUrl(url)
      ? "url"
      : srcDoc
        ? "code"
        : "empty";

  const normalizedUrl = normalizeSandboxUrl(url);

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative w-full h-[380px] bg-white dark:bg-slate-900 transition-shadow ${
        isDragging
          ? "ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-[#111111]"
          : ""
      }`}
    >
      {kind === "file" && (
        <>
          <iframe
            key={`file-${fileName}-${runIndicator}`}
            title={`File Preview ${fileName}`}
            src={fileSrc}
            sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
            className="w-full h-full border-none bg-white dark:bg-slate-900"
          />
          <PreviewBadge kind="file">{fileName}</PreviewBadge>
        </>
      )}

      {kind === "url" && (
        <>
          <iframe
            key={`web-${normalizedUrl}-${runIndicator}`}
            title={`Web Preview ${normalizedUrl}`}
            src={normalizedUrl}
            sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
            referrerPolicy="no-referrer"
            className="w-full h-full border-none bg-white dark:bg-slate-900"
          />
          <PreviewBadge kind="url">{normalizedUrl}</PreviewBadge>
        </>
      )}

      {kind === "code" && (
        <>
          <iframe
            key={`code-${runIndicator}`}
            title="Code Preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
            className="w-full h-full border-none bg-white dark:bg-slate-900"
          />
          <PreviewBadge kind="code">Code</PreviewBadge>
        </>
      )}

      {kind === "empty" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Sparkles className="w-5 h-5" />
          <p>写点代码，或者从 URL / File 加载。</p>
        </div>
      )}

      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-indigo-500/5">
          <div className="px-3 py-2 rounded-md bg-indigo-500 text-white text-xs font-medium shadow-lg">
            Drop a file or URL to preview
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewBadge({
  kind,
  children,
}: {
  kind: "file" | "url" | "code";
  children: React.ReactNode;
}) {
  const label = kind === "file" ? "File" : kind === "url" ? "Web" : "Code";
  return (
    <div className="absolute top-2 left-2 pointer-events-none flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-300 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-slate-700/60 max-w-[80%]">
      <span className="font-semibold uppercase tracking-wide opacity-60">
        {label}
      </span>
      <span className="truncate">{children}</span>
    </div>
  );
}

const ContentEditableBlock = forwardRef<HTMLDivElement, {
  html: string;
  onChange: (html: string, text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  tagName?: 'div' | 'h1' | 'h2' | 'h3';
}>(({ html, onChange, onKeyDown, onBlur, placeholder, className, tagName = 'div' }, ref) => {
  const localRef = useRef<HTMLDivElement>(null);
  
  useImperativeHandle(ref, () => localRef.current!);

  useEffect(() => {
    if (localRef.current && localRef.current.innerHTML !== html) {
      localRef.current.innerHTML = html;
    }
  }, [html]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    onChange(e.currentTarget.innerHTML, e.currentTarget.innerText);
  };

  const isEditorContentEmpty = (value: string) => {
    const normalized = value
      .replace(/<br\s*\/?>(\s*)/gi, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/<[^>]*>/g, "")
      .trim();
    return normalized.length === 0;
  };

  const shouldShowPlaceholder = isEditorContentEmpty(html);
  const Tag = tagName as any;

  return (
    <Tag
      ref={localRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={`outline-none break-words whitespace-pre-wrap before:pointer-events-none ${shouldShowPlaceholder ? "before:content-[attr(data-placeholder)] before:text-slate-350 dark:before:text-slate-650" : ""} ${className}`}
      data-placeholder={placeholder}
      data-block-editable="true"
    />
  );
});
import {
  Code,
  Table as TableIcon,
  Palette,
  Image as ImageIcon,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Trash2,
  CornerDownRight,
  Play,
  Edit2,
  Check,
  Plus,
  ArrowUpDown,
  FileCode,
  Sparkles,
  Eye,
  Sun,
  Moon,
  RefreshCw,
  FileText,
  Link,
  Upload,
} from "lucide-react";
import CodeBlock from "./CodeBlock";

function HeadingIcon(props: { className?: string }) {
  return <span className={`text-[10px] font-black ${props.className}`}>H</span>;
}

const SLASH_COMMANDS = [
  { type: "text", label: "文本", icon: MessageSquare },
  { type: "heading-1", label: "标题1", icon: HeadingIcon },
  { type: "heading-2", label: "标题2", icon: HeadingIcon },
  { type: "toggle", label: "折叠主题", icon: ChevronRight },
  { type: "html-render", label: "HTML 沙盒", icon: FileCode },
  { type: "code", label: "代码块", icon: Code },
  { type: "table", label: "表格", icon: TableIcon },
  { type: "whiteboard", label: "画板", icon: Edit2 },
];

interface BlockItemProps {
  block: Block;
  documents: Document[];
  onUpdateBlock: (updatedFields: Partial<Block>) => void;
  onDeleteBlock: (mergeContent?: string) => void;
  onNavigateToDoc: (docId: string) => void;
  onInsertBlockBelow: (type: BlockType) => void;
  autoFocus?: boolean;
  /**
   * Focus the document title input. The block uses this when the user is at
   * the very top of the first block and presses ArrowUp. Returns true on
   * success so the caller can decide whether to suppress the original
   * keypress.
   */
  onRequestFocusTitle?: () => boolean;
  /**
   * Focus another block by relative offset (negative = previous, positive = next).
   * Used as a fallback when there's no DOM sibling (e.g. the very first/last
   * block in the document). Returns true on success.
   */
  onRequestFocusBlock?: (offset: number) => boolean;
}

const BlockItem = forwardRef<HTMLDivElement, BlockItemProps>(function BlockItem(
  {
    block,
    documents,
    onUpdateBlock,
    onDeleteBlock,
    onNavigateToDoc,
    onInsertBlockBelow,
    autoFocus,
    onRequestFocusTitle,
    onRequestFocusBlock,
  },
  forwardedRef,
) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const [slashMenuCoords, setSlashMenuCoords] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [rawText, setRawText] = useState(block.content);

  // Advanced States for Upgraded HTML Sandbox
  const [sandboxHtml, setSandboxHtml] = useState(block.content || "");
  const [sandboxCss, setSandboxCss] = useState(block.properties?.cssCode || "");
  const [sandboxJs, setSandboxJs] = useState(block.properties?.jsCode || "");
  const [sandboxTheme, setSandboxTheme] = useState<"light" | "dark">(
    block.properties?.sandboxTheme || "light",
  );
  // Sandbox source state. The preview iframe's src/srcDoc is auto-derived
  // from these (file > url > code); the user never picks a "mode" explicitly.
  const [sandboxUrl, setSandboxUrl] = useState(
    block.properties?.sandboxUrl ||
      (block.properties?.sandboxPreviewMode === "url"
        ? (block.properties?.sandboxPreviewUrl ?? "")
        : ""),
  );
  const [sandboxFileSrc, setSandboxFileSrc] = useState("");
  const [sandboxFileName, setSandboxFileName] = useState(
    block.properties?.sandboxFileName ||
      (block.properties?.sandboxPreviewMode === "file"
        ? (block.properties?.sandboxPreviewFileName ?? "")
        : ""),
  );
  const [sandboxDebouncedSrcDoc, setSandboxDebouncedSrcDoc] = useState("");
  const [sandboxIsDragging, setSandboxIsDragging] = useState(false);
  const [runIndicator, setRunIndicator] = useState(0); // For forcing reload
  // Local "code sub-tab": which of HTML/CSS/JS is shown in the editor pane.
  const [sandboxCodeTab, setSandboxCodeTab] = useState<"html" | "css" | "js">(
    "html",
  );

  // Preset templates for quick load list
  // (SANDBOX_PRESETS is defined at module scope; the PresetMenu component
  // below reads it directly.)

  // Load block content when initialized to prevent leaks
  useEffect(() => {
    if (block.type === "html-render") {
      setSandboxHtml(block.content || "");
      setSandboxCss(block.properties?.cssCode || "");
      setSandboxJs(block.properties?.jsCode || "");
      setSandboxTheme(block.properties?.sandboxTheme || "light");
      // URL/FileName read from new fields; fall back to old fields for legacy docs.
      setSandboxUrl(
        block.properties?.sandboxUrl ||
          (block.properties?.sandboxPreviewMode === "url"
            ? (block.properties?.sandboxPreviewUrl ?? "")
            : ""),
      );
      setSandboxFileName(
        block.properties?.sandboxFileName ||
          (block.properties?.sandboxPreviewMode === "file"
            ? (block.properties?.sandboxPreviewFileName ?? "")
            : ""),
      );
      setSandboxFileSrc("");
    }
  }, [block.id, block.type]);

  // Real-time sandboxed debouncer updates (so typing doesn't compile on every keystroke)
  useEffect(() => {
    if (block.type !== "html-render") return;
    const timer = setTimeout(() => {
      setSandboxDebouncedSrcDoc(
        compileSandboxSrcDoc(sandboxHtml, sandboxCss, sandboxJs, sandboxTheme),
      );
    }, 550); // 550ms debounce
    return () => clearTimeout(timer);
  }, [
    sandboxHtml,
    sandboxCss,
    sandboxJs,
    sandboxTheme,
    runIndicator,
    block.type,
  ]);

  // Auto-saves fields to document state when they change.
  const handleSandboxCodeChange = (
    htmlVal: string,
    cssVal: string,
    jsVal: string,
    themeVal: "light" | "dark",
  ) => {
    setSandboxHtml(htmlVal);
    setSandboxCss(cssVal);
    setSandboxJs(jsVal);
    setSandboxTheme(themeVal);
    onUpdateBlock({
      content: htmlVal,
      properties: {
        ...block.properties,
        cssCode: cssVal,
        jsCode: jsVal,
        sandboxTheme: themeVal,
      },
    });
  };

  const handleSandboxUrlChange = (url: string) => {
    setSandboxUrl(url);
    onUpdateBlock({
      properties: {
        ...block.properties,
        sandboxUrl: url,
      },
    });
  };

  const handleSandboxClearFile = () => {
    setSandboxFileSrc("");
    setSandboxFileName("");
    onUpdateBlock({
      properties: {
        ...block.properties,
        sandboxFileName: "",
      },
    });
  };

  const handleSandboxClearUrl = () => {
    handleSandboxUrlChange("");
  };

  const handleSandboxClearAll = () => {
    handleSandboxClearFile();
    handleSandboxClearUrl();
  };

  const openSandboxWebPreviewWindow = () => {
    const url = normalizeSandboxUrl(sandboxUrl);
    if (!url) return;

    const label = `sandbox-${block.id}-${Date.now()}`.replace(/[^a-zA-Z0-9-/:_]/g, "-");
    const webview = new WebviewWindow(label, {
      url,
      title: `Sandbox: ${url}`,
      width: 1200,
      height: 800,
      resizable: true,
    });

    webview.once("tauri://error", (event) => {
      // Surfacing the error to the user used to mean setting state; now we
      // simply log it. The main window keeps the URL in its input.
      const message = typeof event.payload === "string" ? event.payload : "open preview window failed";
      console.error("[sandbox] open window error:", message);
    });
  };

  const handleSandboxFileSelect = (file: File | null) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      setSandboxFileSrc(src);
      setSandboxFileName(file.name);
      onUpdateBlock({
        properties: {
          ...block.properties,
          sandboxFileName: file.name,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSandboxDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSandboxIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSandboxFileSelect(e.dataTransfer.files[0]);
      return;
    }
    if (e.dataTransfer.types.includes("text/uri-list")) {
      const url = e.dataTransfer.getData("text/uri-list").split("\n")[0].trim();
      if (url) handleSandboxUrlChange(url);
    }
  };

  const loadPresetIntoSandbox = (preset: {
    html: string;
    css: string;
    js: string;
  }) => {
    handleSandboxCodeChange(
      preset.html,
      preset.css,
      preset.js,
      sandboxTheme,
    );
    setRunIndicator((prev) => prev + 1); // trigger refresh
  };

  // Canvas Drawing States
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [brushColor, setBrushColor] = useState("#4f46e5");
  const [brushWidth, setBrushWidth] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [paths, setPaths] = useState<CanvasPath[]>(
    block.properties?.drawingPaths || [],
  );

  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (autoFocus && elementRef.current) {
      elementRef.current.focus();
      if (
        elementRef.current instanceof HTMLTextAreaElement ||
        elementRef.current instanceof HTMLInputElement
      ) {
        const len = elementRef.current.value.length;
        elementRef.current.setSelectionRange(len, len);
      } else if (elementRef.current.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(elementRef.current);
        range.collapse(false); // move to end
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [autoFocus]);

  useEffect(() => {
    // Only used for textarea types like callout, code, etc. if needed later
    // but not for contentEditable
  }, [rawText, block.type]);

  /**
   * Get the bounding rect of the current caret position inside a contentEditable.
   * Uses an inert zero-width marker as a probe so we always get a real rect
   * (Safari/WebKit often return 0×0 rects from a collapsed Range).
   */
  const getCaretRect = (el: HTMLElement): DOMRect | null => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!el.contains(range.startContainer)) return null;
    if (!range.collapsed) return null;

    const probe = range.cloneRange();
    probe.collapse(true);
    const rects = probe.getClientRects();
    let rect = rects[0] ?? null;
    if (rect && (rect.width > 0 || rect.height > 0)) return rect;

    // Fallback: drop a zero-width span at the caret, measure, then remove it.
    const marker = document.createElement("span");
    marker.appendChild(document.createTextNode("\u200b"));
    marker.setAttribute("data-caret-probe", "1");
    const originalStyles = marker.style.cssText;
    marker.style.cssText =
      "display:inline-block;width:0;height:1em;line-height:inherit;vertical-align:baseline;";
    try {
      probe.insertNode(marker);
      rect = marker.getBoundingClientRect();
    } finally {
      marker.remove();
      marker.style.cssText = originalStyles;
      // Selection may have been invalidated by DOM mutation; restore it.
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return rect;
  };

  /**
   * Estimate the line height of a contentEditable by looking at a single
   * typed character (or the first letter). Falls back to 24px.
   */
  const estimateLineHeight = (el: HTMLElement): number => {
    const computed = window.getComputedStyle(el);
    const lh = parseFloat(computed.lineHeight);
    if (Number.isFinite(lh) && lh > 0) return lh;
    const fs = parseFloat(computed.fontSize);
    if (Number.isFinite(fs) && fs > 0) return fs * 1.5;
    return 24;
  };

  /**
   * Whether the caret is on the "top" or "bottom" line of a contentEditable,
   * within half a line height of the element's bounding box.
   *
   * For textareas/inputs we use the simple newline index approach, which is
   * accurate and DOM-agnostic.
   */
  const isCaretOnEdgeLine = (
    el: HTMLElement,
    direction: "up" | "down",
  ): boolean => {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const value = el.value;
      const cursor = el.selectionStart ?? 0;
      const currentLineStart =
        value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
      const currentLineEndIndex = value.indexOf("\n", cursor);
      const currentLineEnd =
        currentLineEndIndex === -1 ? value.length : currentLineEndIndex;
      const before = value.slice(0, currentLineStart);
      const after = value.slice(currentLineEnd);
      return direction === "up" ? !before.includes("\n") : !after.includes("\n");
    }

    if (!el.isContentEditable) return true;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!el.contains(range.startContainer)) return false;

    // If the user has a non-collapsed selection, never treat the caret as on
    // the edge — they probably want to move within their selection.
    if (!range.collapsed) return false;

    const caretRect = getCaretRect(el);
    if (!caretRect) return true;

    const elRect = el.getBoundingClientRect();
    if (elRect.height === 0) return true;

    const lineHeight = estimateLineHeight(el);
    // Allow a small fudge factor equal to half a line so browsers with
    // sub-pixel layout don't trip the check.
    const slack = Math.max(2, lineHeight / 2);

    if (direction === "up") {
      return Math.abs(caretRect.top - elRect.top) <= slack;
    }
    return Math.abs(caretRect.bottom - elRect.bottom) <= slack;
  };

  /**
   * Walk up the ancestor chain and return the closest element whose tag name
   * is in `INLINE_FORMATTED_TAGS`, or null.
   */
  const findInlineFormatAncestor = (
    node: Node | null,
  ): HTMLElement | null => {
    let cur: Node | null = node;
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as HTMLElement;
      if (INLINE_FORMATTED_TAGS.includes(el.tagName)) return el;
      cur = el.parentElement;
    }
    return null;
  };

  /**
   * If the current selection is collapsed and sitting at the very end of an
   * inline format element (e.g. `<code>foo</code>`), move it just after the
   * element so the user can keep typing plain text.
   *
   * Returns true if the caret was moved (so the caller can preventDefault).
   */
  const tryEscapeInlineFormat = (
    el: HTMLElement,
    direction: "left" | "right",
  ): boolean => {
    if (!el.isContentEditable) return false;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return false;

    const inline = findInlineFormatAncestor(range.startContainer);
    if (!inline) return false;
    // Only act on inline elements that are inside our editable host.
    if (!el.contains(inline)) return false;

    if (direction === "right") {
      // Caret collapsed and the end of the inline is right after the cursor.
      if (
        range.endContainer === inline.lastChild &&
        range.endOffset === (inline.lastChild?.nodeType === Node.TEXT_NODE
          ? (inline.lastChild as Text).data.length
          : inline.childNodes.length)
      ) {
        const parent = inline.parentNode;
        if (!parent) return false;
        const after = document.createRange();
        const idx = Array.prototype.indexOf.call(parent.childNodes, inline) + 1;
        after.setStart(parent, idx);
        after.collapse(true);
        selection.removeAllRanges();
        selection.addRange(after);
        return true;
      }
    } else {
      // Left: caret at the very start of the inline element.
      if (
        range.startContainer === inline.firstChild &&
        range.startOffset === 0
      ) {
        const parent = inline.parentNode;
        if (!parent) return false;
        const before = document.createRange();
        const idx = Array.prototype.indexOf.call(parent.childNodes, inline);
        before.setStart(parent, idx);
        before.collapse(true);
        selection.removeAllRanges();
        selection.addRange(before);
        return true;
      }
    }
    return false;
  };

  const moveFocusToSiblingBlock = (
    current: HTMLElement,
    direction: "up" | "down",
  ): boolean => {
    const blockEl = current.closest<HTMLElement>("[data-block-id]");
    const sibling =
      direction === "up"
        ? (blockEl?.previousElementSibling as HTMLElement | null)
        : (blockEl?.nextElementSibling as HTMLElement | null);
    const target = sibling?.querySelector<HTMLElement>(
      "[data-block-editable='true']",
    );

    if (target) {
      target.focus();
      requestAnimationFrame(() => {
        if (
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLInputElement
        ) {
          const pos = direction === "up" ? target.value.length : 0;
          try {
            target.setSelectionRange(pos, pos);
          } catch {
            /* ignore */
          }
        } else if (target.isContentEditable) {
          const selection = window.getSelection();
          if (!selection) return;
          const range = document.createRange();
          range.selectNodeContents(target);
          range.collapse(direction === "down");
          selection.removeAllRanges();
          selection.addRange(range);
        }
      });
      return true;
    }

    // No DOM sibling (e.g. the first block going up, or the last going down).
    if (direction === "up" && onRequestFocusTitle) {
      return onRequestFocusTitle();
    }
    if (direction === "up" && onRequestFocusBlock) {
      return onRequestFocusBlock(-1);
    }
    if (direction === "down" && onRequestFocusBlock) {
      return onRequestFocusBlock(1);
    }
    return false;
  };

  /**
   * Capture the current caret offset in the editable, relative to its content.
   * Used to restore position after handleBlur rewrites the content.
   */
  const captureCaretOffset = (el: HTMLElement): number | null => {
    if (!el.isContentEditable) {
      if (
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLInputElement
      ) {
        return el.selectionStart ?? 0;
      }
      return null;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!el.contains(range.startContainer)) return null;
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  };

  /**
   * Restore the caret at a given text offset within a contentEditable host.
   * Walks text nodes in document order to find the matching position.
   */
  const restoreCaretOffset = (el: HTMLElement, offset: number) => {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const pos = Math.min(offset, el.value.length);
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
      return;
    }
    if (!el.isContentEditable) return;
    const selection = window.getSelection();
    if (!selection) return;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let target: Text | null = null;
    let targetOffset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const len = node.data.length;
      if (remaining <= len) {
        target = node;
        targetOffset = remaining;
        break;
      }
      remaining -= len;
    }
    if (!target) {
      // Offset past the end — collapse to the end of the element.
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      selection.removeAllRanges();
      selection.addRange(r);
      return;
    }
    const r = document.createRange();
    r.setStart(target, targetOffset);
    r.collapse(true);
    selection.removeAllRanges();
    selection.addRange(r);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (showSlashMenu) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashMenuIndex((prev) =>
          prev > 0 ? prev - 1 : SLASH_COMMANDS.length - 1,
        );
        return;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashMenuIndex((prev) =>
          prev < SLASH_COMMANDS.length - 1 ? prev + 1 : 0,
        );
        return;
      } else if (e.key === "Enter") {
        e.preventDefault();
        executeSlashCommand(SLASH_COMMANDS[slashMenuIndex].type as BlockType);
        return;
      } else if (e.key === "Escape") {
        setShowSlashMenu(false);
        return;
      }
    }

    const el = e.currentTarget;

    // ArrowLeft/ArrowRight: let the user escape inline format elements.
    if (
      (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      el.isContentEditable
    ) {
      if (tryEscapeInlineFormat(el, e.key === "ArrowLeft" ? "left" : "right")) {
        e.preventDefault();
        return;
      }
    }

    // ArrowUp/ArrowDown: cross-block navigation when on the edge.
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey) {
      const direction = e.key === "ArrowUp" ? "up" : "down";
      if (
        isCaretOnEdgeLine(el, direction) &&
        moveFocusToSiblingBlock(el, direction)
      ) {
        e.preventDefault();
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onInsertBlockBelow("text");
    } else if (e.key === "Backspace") {
      // Cmd/Ctrl+Backspace: delete the whole block, merging into the previous
      // block if any. This is the standard Notion / 飞书 shortcut.
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        onDeleteBlock("");
        return;
      }

      if (
        (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) &&
        el.selectionStart === 0 &&
        el.selectionEnd === 0
      ) {
        e.preventDefault();
        onDeleteBlock(rawText);
        return;
      }

      if (el.isContentEditable) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!range.collapsed) return; // let browser delete selection

        // Case 1: caret is right after an inline format element -> delete the
        // entire element in one Backspace.
        const inline = findInlineFormatAncestor(range.startContainer);
        if (inline && el.contains(inline)) {
          const parent = inline.parentNode;
          if (parent) {
            // Make sure the caret sits at the very end of the inline element.
            const inlineRange = document.createRange();
            inlineRange.selectNodeContents(inline);
            inlineRange.collapse(false);
            const isAtInlineEnd =
              range.startContainer === inlineRange.endContainer &&
              range.startOffset === inlineRange.endOffset;
            if (isAtInlineEnd) {
              e.preventDefault();
              inline.remove();
              // The browser will keep the caret in place; that's fine.
              // Push the new HTML upward to keep state in sync.
              setRawText(el.innerHTML);
              onUpdateBlock({ content: el.innerHTML });
              return;
            }
          }
        }

        // Case 2: caret is at the absolute start of the block -> delete block.
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(el);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        if (preCaretRange.toString().length === 0) {
          e.preventDefault();
          onDeleteBlock(el.innerHTML);
        }
      }
    }
  };

  useEffect(() => {
    setRawText(block.content);
  }, [block.content]);

  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    // Light Markdown auto-formatting on blur (so cursor doesn't jump during
    // typing). Capture the caret first so we can put it back after the DOM
    // rewrite, otherwise the user's cursor "teleports" to the start.
    const caretOffset = captureCaretOffset(e.currentTarget as HTMLElement);

    // Defensive: don't run formatting when the user is clearly writing raw
    // HTML (the `>` characters would otherwise become `&gt;` on next render).
    const hasRawAngleBracket = /[<>]/.test(rawText);
    if (hasRawAngleBracket) return;

    let formatted = rawText;

    // **bold** to <b>bold</b>
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    // `code` to <code>code</code>
    formatted = formatted.replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 mx-0.5 rounded bg-slate-100 dark:bg-white/10 text-pink-500 dark:text-pink-400 font-mono text-[13px]">$1</code>',
    );
    // [[Wiki]] to link
    formatted = formatted.replace(/\[\[([^\]]+)\]\]/g, (match, titleStr) => {
      const title = titleStr.trim();
      const matchedDoc = documents.find(
        (d) => d.title.toLowerCase() === title.toLowerCase(),
      );
      if (matchedDoc) {
        return `<a href="#" data-doc-id="${matchedDoc.id}" class="wiki-link px-1.5 py-0.5 mx-0.5 rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900 border-b border-indigo-500 font-semibold text-indigo-700 dark:text-indigo-400 cursor-pointer text-xs inline-flex items-center gap-1 transition-colors"><span>${title}</span></a>`;
      }
      return match;
    });

    if (formatted !== rawText) {
      setRawText(formatted);
      onUpdateBlock({ content: formatted });
      // Restore caret position once React has re-rendered the formatted HTML.
      if (caretOffset != null) {
        requestAnimationFrame(() => {
          const host = elementRef.current;
          if (host) restoreCaretOffset(host, caretOffset);
        });
      }
    }
  };

  // Handle local text editing + Slash `/` command detector
  const handleTextChange = (val: string, element?: HTMLElement, plainText?: string) => {
    setRawText(val);
    onUpdateBlock({ content: val });

    const checkText = plainText !== undefined ? plainText : val;
    // Show command menu if text ends with /
    if (checkText.replace(/\n$/, "").endsWith("/")) {
      setShowSlashMenu(true);
      setSlashMenuIndex(0);
      if (element) {
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
          const coords = getCaretCoordinates(
            element,
            element.selectionEnd || 0,
          );
          setSlashMenuCoords({
            top: coords.top + 24,
            left: Math.min(coords.left, 400),
          });
        } else {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const parentRect = element.getBoundingClientRect();
            setSlashMenuCoords({
              top: rect.bottom - parentRect.top + 24,
              left: Math.min(rect.left - parentRect.left, 400),
            });
          }
        }
      }
    } else {
      setShowSlashMenu(false);
    }
  };

  const executeSlashCommand = (type: BlockType) => {
    // Remove the trailing slash from content
    const sanitized = rawText.replace(/\/((?:\s*<[^>]+>)*\s*)$/, "$1");
    setRawText(sanitized);

    // Convert current block type or insert below
    if (sanitized === "" || sanitized.replace(/<[^>]*>/g, '').trim() === "") {
      onUpdateBlock({
        type,
        content: "",
        properties: getDefaultProperties(type),
      });
    } else {
      // update text block to remove its slash in parent component too
      onUpdateBlock({ content: sanitized });
      onInsertBlockBelow(type);
    }
    setShowSlashMenu(false);
  };

  const getDefaultProperties = (type: BlockType) => {
    switch (type) {
      case "table":
        return {
          tableData: [
            ["标题 A", "标题 B", "标题 C"],
            ["数据 1", "数据 2", "数据 3"],
          ],
        };
      case "callout":
        return { emoji: "" };
      case "image":
        return { caption: "示例插图" };
      case "canvas":
      case "whiteboard":
        return { drawingPaths: [] };
      case "html-render":
        return {
          cssCode: "h1 { color: #6366f1; }",
          jsCode: 'console.log("Demo loaded!");',
          sandboxTheme: "light" as const,
        };
      case "toggle":
        return { isOpen: true };
      default:
        return {};
    }
  };

  // Parsing [[Wiki Links]] in regular markdown-like text blocks
  const renderFormattedText = () => {
    const text = rawText;
    if (!text)
      return (
        <span className="text-slate-300 dark:text-slate-600">
          输入回车另起一行，或输入 / 快速唤出组件...
        </span>
      );

    const regex = /(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|`[^`]+`)/g;
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (part.startsWith("[[") && part.endsWith("]]")) {
        const titleStr = part.slice(2, -2).trim();
        // Match with known docs
        const matchedDoc = documents.find(
          (d) => d.title.toLowerCase() === titleStr.toLowerCase(),
        );

        if (matchedDoc) {
          return (
            <span
              key={index}
              onClick={() => onNavigateToDoc(matchedDoc.id)}
              className="px-1.5 py-0.5 mx-0.5 rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900 border-b border-indigo-500 font-semibold text-indigo-700 dark:text-indigo-400 cursor-pointer text-xs inline-flex items-center gap-1 transition-colors"
              title={`点击跳转至：${matchedDoc.title}`}
            >
              <FileText className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>{matchedDoc.title}</span>
            </span>
          );
        } else {
          return (
            <span
              key={index}
              className="px-1.5 py-0.5 mx-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-b border-amber-300 dark:border-amber-800 text-xs inline-flex items-center gap-1"
              title="此文档未在本地创建，暂时无法点击跳转。"
            >
              <FileText className="w-3 h-3 text-amber-500 shrink-0" />
              <span>{titleStr} (未创建)</span>
            </span>
          );
        }
      } else if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong
            key={index}
            className="font-bold text-slate-900 dark:text-slate-100"
          >
            {part.slice(2, -2)}
          </strong>
        );
      } else if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={index}
            className="px-1 py-0.5 mx-0.5 rounded bg-slate-100 dark:bg-white/10 text-pink-500 dark:text-pink-400 font-mono text-[13px]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return (
        <span key={index} className="whitespace-pre-wrap">
          {part}
        </span>
      );
    });
  };

  // --- DRAWING CANVAS LOGIC ---
  useEffect(() => {
    if (block.type !== "canvas" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and redraw vector lines
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    paths.forEach((path) => {
      if (path.points.length === 0) return;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;

      const start = path.points[0];
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });
  }, [paths, block.type]);

  const startCanvasDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    const newPath: CanvasPath = {
      points: [{ x, y }],
      color: brushColor,
      width: brushWidth,
    };

    const updatedPaths = [...paths, newPath];
    setPaths(updatedPaths);
    onUpdateBlock({
      properties: { ...block.properties, drawingPaths: updatedPaths },
    });
  };

  const drawOnCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const updatedPaths = [...paths];
    const lastPath = updatedPaths[updatedPaths.length - 1];
    if (lastPath) {
      lastPath.points.push({ x, y });
      setPaths(updatedPaths);
    }
  };

  const endCanvasDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    onUpdateBlock({ properties: { ...block.properties, drawingPaths: paths } });
  };

  const clearCanvasAll = () => {
    setPaths([]);
    onUpdateBlock({ properties: { ...block.properties, drawingPaths: [] } });
  };

  // --- HTML SANDBOX SANDBOXED IFRAME COMPILATION ---
  const compileSandboxSrcDoc = (
    htmlVal = sandboxHtml,
    cssVal = sandboxCss,
    jsVal = sandboxJs,
    themeVal = sandboxTheme,
  ) => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: '#6366f1',
          }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { 
      margin: 0; 
      padding: 16px; 
      font-family: system-ui, -apple-system, sans-serif; 
      background: transparent; 
      color: #334155;
      min-height: 100vh;
      transition: background-color 0.2s, color 0.2s;
    }
    body.dark {
      background-color: #0f172a;
      color: #f1f5f9;
    }
    /* Simple Custom Scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(156, 163, 175, 0.3);
      border-radius: 9999px;
    }
    ${cssVal}
  </style>
</head>
<body class="${themeVal === "dark" ? "dark" : ""}">
  ${htmlVal}
  <script>
    try {
      ${jsVal}
    } catch(err) {
      document.body.insertAdjacentHTML('beforeend', '<div style="color:#ef4444; margin-top:12px; padding:10px; border-radius:8px; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); font-family: monospace; font-size:12px;">⚠️ JS Error: ' + err.message + '</div>');
    }
  </script>
</body>
</html>`;
  };

  // --- TABLE EDITING HANDLERS ---
  const handleTableCellEdit = (rowIdx: number, colIdx: number, val: string) => {
    const tableData = block.properties?.tableData
      ? [...block.properties.tableData]
      : [[]];
    tableData[rowIdx] = [...tableData[rowIdx]];
    tableData[rowIdx][colIdx] = val;
    onUpdateBlock({ properties: { ...block.properties, tableData } });
  };

  const addTableColumn = () => {
    const tableData = block.properties?.tableData
      ? [...block.properties.tableData]
      : [["", ""]];
    const updated = tableData.map((row) => [...row, ""]);
    onUpdateBlock({ properties: { ...block.properties, tableData: updated } });
  };

  const removeTableColumn = () => {
    const tableData = block.properties?.tableData
      ? [...block.properties.tableData]
      : [["", ""]];
    if (tableData[0].length <= 1) return;
    const updated = tableData.map((row) => row.slice(0, -1));
    onUpdateBlock({ properties: { ...block.properties, tableData: updated } });
  };

  const addTableRow = () => {
    const tableData = block.properties?.tableData
      ? [...block.properties.tableData]
      : [[""]];
    const numCols = tableData[0].length;
    const newRow = Array(numCols).fill("");
    onUpdateBlock({
      properties: { ...block.properties, tableData: [...tableData, newRow] },
    });
  };

  const removeTableRow = () => {
    const tableData = block.properties?.tableData
      ? [...block.properties.tableData]
      : [[""]];
    if (tableData.length <= 1) return;
    onUpdateBlock({
      properties: { ...block.properties, tableData: tableData.slice(0, -1) },
    });
  };

  // Drag and drop base64 image extractor
  const handleImageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      onUpdateBlock({
        content: base64,
        properties: { ...block.properties, imageType: "base64" },
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      ref={forwardedRef}
      className="group/block relative flex items-start gap-2 py-1.5 px-2 -mx-2 rounded-sm"
      id={`block-row-${block.id}`}
      data-block-id={block.id}
    >
      {/* Left controls (Plus, Delete) - positioned outside block to avoid overlap */}
      <div className="absolute left-0 md:-left-6 lg:-left-8 top-1 flex items-center gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity duration-150 z-20 print:hidden">
        <button
          onClick={() => onInsertBlockBelow("text")}
          className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] p-0.5 rounded transition-colors"
          title="在此行下方添加"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onDeleteBlock()}
          className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-errorForeground)] p-0.5 rounded transition-colors"
          title="删除此块"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* 2. Main content container mapped by block types */}
      <div className="flex-1 min-w-0" id={`block-body-${block.id}`}>
        {/* TYPE 1: HEADING 1 */}
        {block.type === "heading-1" && (
          <ContentEditableBlock
            ref={elementRef as React.RefObject<HTMLDivElement>}
            tagName="h1"
            onKeyDown={handleKeyDown}
            html={rawText}
            onChange={(val, text) => handleTextChange(val, elementRef.current!, text)}
            placeholder="主标题 1"
            className="w-full text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight bg-transparent border-none focus:outline-none focus:ring-0 placeholder-slate-300"
          />
        )}

        {/* TYPE 2: HEADING 2 */}
        {block.type === "heading-2" && (
          <ContentEditableBlock
            ref={elementRef as React.RefObject<HTMLDivElement>}
            tagName="h2"
            onKeyDown={handleKeyDown}
            html={rawText}
            onChange={(val, text) => handleTextChange(val, elementRef.current!, text)}
            placeholder="主题分类 2"
            className="w-full text-xl font-bold text-slate-900 dark:text-slate-150 tracking-tight bg-transparent border-none focus:outline-none focus:ring-0 placeholder-slate-300"
          />
        )}

        {/* TYPE 3: HEADING 3 */}
        {block.type === "heading-3" && (
          <ContentEditableBlock
            ref={elementRef as React.RefObject<HTMLDivElement>}
            tagName="h3"
            onKeyDown={handleKeyDown}
            html={rawText}
            onChange={(val, text) => handleTextChange(val, elementRef.current!, text)}
            placeholder="小标题 3"
            className="w-full text-lg font-semibold text-slate-800 dark:text-slate-200 tracking-tight bg-transparent border-none focus:outline-none focus:ring-0 placeholder-slate-300"
          />
        )}

        {/* TYPE 4: TEXT block */}
        {block.type === "text" && (
          <div 
            className="relative group/text"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              const link = target.closest('.wiki-link');
              if (link) {
                e.preventDefault();
                const docId = link.getAttribute('data-doc-id');
                if (docId) onNavigateToDoc(docId);
              }
            }}
          >
            <ContentEditableBlock
              ref={elementRef as React.RefObject<HTMLDivElement>}
              tagName="div"
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              html={rawText}
              onChange={(val, text) => handleTextChange(val, elementRef.current!, text)}
              placeholder=""
              className="w-full text-sm text-slate-700 dark:text-slate-300 bg-transparent border-none focus:outline-none focus:ring-0 leading-relaxed block"
            />
          </div>
        )}

        {/* TYPE 5: CALLOUT block */}
        {block.type === "callout" && (
          <div className="flex items-start gap-3 p-4 bg-[var(--vscode-textBlockQuote-background)] rounded-sm border-l-4 border-l-[var(--vscode-focusBorder)]">
            <FileText className="w-4 h-4 text-[var(--vscode-icon-foreground)] mt-0.5 shrink-0" />
            <div className="flex-1">
              <input
                data-block-editable="true"
                ref={elementRef as React.RefObject<HTMLInputElement>}
                onKeyDown={handleKeyDown}
                type="text"
                value={rawText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="在此输入高亮提示卡内容..."
                className="w-full text-sm font-medium text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none focus:ring-0"
              />
            </div>
          </div>
        )}

        {/* TYPE 6: CODE block */}
        {block.type === "code" && (
          <CodeBlock
            code={rawText}
            language={block.properties?.language || "javascript"}
            showLineNumbers={true}
            editable={true}
            onChange={(newCode) => handleTextChange(newCode)}
            onLanguageChange={(lang) =>
              onUpdateBlock({
                properties: { ...block.properties, language: lang },
              })
            }
          />
        )}

        {/* TYPE 7: IMAGE block */}
        {block.type === "image" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleImageDrop}
            className="border border-dashed border-[var(--vscode-widget-border)] rounded-sm p-5 flex flex-col items-center justify-center gap-3 bg-[var(--vscode-textBlockQuote-background)]"
          >
            {block.content ? (
              <div className="max-w-md w-full">
                <img
                  src={block.content}
                  alt={block.properties?.caption || "Image content"}
                  referrerPolicy="no-referrer"
                  className="rounded-sm object-contain w-full max-h-72 mx-auto"
                />
                <input
                  type="text"
                  value={block.properties?.caption || ""}
                  onChange={(e) =>
                    onUpdateBlock({
                      properties: {
                        ...block.properties,
                        caption: e.target.value,
                      },
                    })
                  }
                  placeholder="添加说明文字..."
                  className="w-full mt-2 text-center text-xs text-[var(--vscode-descriptionForeground)] bg-transparent border-none focus:outline-none"
                />
              </div>
            ) : (
              <div className="text-center py-4 space-y-2">
                <ImageIcon className="w-8 h-8 text-[var(--vscode-icon-foreground)] mx-auto opacity-60" />
                <p className="text-xs text-[var(--vscode-descriptionForeground)]">
                  可拖放本地图片至此 或
                </p>
                <input
                  type="text"
                  placeholder="粘贴在线图片 URL..."
                  onChange={(e) => onUpdateBlock({ content: e.target.value })}
                  className="px-3 py-1.5 text-xs rounded-sm border border-[var(--vscode-widget-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] focus:outline-none w-64 text-center"
                />
              </div>
            )}
          </div>
        )}

        {/* TYPE 8: DRAWING CANVAS BLOCK (FREE BRUSH SKETCHING) */}
        {block.type === "canvas" && (
          <div className="rounded-sm overflow-hidden bg-[var(--vscode-textBlockQuote-background)]">
            {/* Header controls */}
            <div className="bg-[var(--vscode-textBlockQuote-background)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-[var(--vscode-icon-foreground)]" />
                <span className="text-xs font-semibold text-[var(--vscode-foreground)]">
                  手绘涂鸦 / 脑图画布
                </span>
              </div>

              <div className="flex items-center gap-4">
                {/* Brush size */}
                <div className="flex items-center gap-1.5 text-xs text-[var(--vscode-descriptionForeground)]">
                  <span>粗细:</span>
                  <select
                    value={brushWidth}
                    onChange={(e) => setBrushWidth(parseInt(e.target.value))}
                    className="bg-[var(--vscode-input-background)] border border-[var(--vscode-widget-border)] rounded-sm px-2 py-1 text-[11px] focus:outline-none"
                  >
                    <option value="2">极细 (2px)</option>
                    <option value="4">常规 (4px)</option>
                    <option value="8">中等 (8px)</option>
                    <option value="12">极粗 (12px)</option>
                  </select>
                </div>

                {/* Color Palette */}
                <div className="flex items-center gap-1.5">
                  {[
                    "#4f46e5",
                    "#34d399",
                    "#ef4444",
                    "#f59e0b",
                    "#000000",
                    "#94a3b8",
                  ].map((color) => (
                    <button
                      key={color}
                      onClick={() => setBrushColor(color)}
                      className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                        brushColor === color
                          ? "ring-2 ring-[var(--vscode-focusBorder)] scale-110"
                          : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                {/* Reset button */}
                <button
                  onClick={clearCanvasAll}
                  className="cursor-pointer text-xs text-[var(--vscode-errorForeground)] px-2 py-0.5 rounded"
                >
                  清空
                </button>
              </div>
            </div>

            {/* Canvas body */}
            <div className="relative py-2 flex justify-center">
              <canvas
                ref={canvasRef}
                width={550}
                height={260}
                onMouseDown={startCanvasDrawing}
                onMouseMove={drawOnCanvas}
                onMouseUp={endCanvasDrawing}
                onMouseLeave={endCanvasDrawing}
                className="bg-[var(--vscode-editor-background)] rounded-sm cursor-crosshair"
              />
            </div>

            <div className="p-2 text-[10px] text-center text-[var(--vscode-descriptionForeground)]">
              提示：鼠标按住并拖动即可书写
            </div>
          </div>
        )}

        {/* TYPE 9: TABLE block (Custom fully editable grid) */}
        {block.type === "table" && (
          <div className="overflow-x-auto rounded-sm p-3 bg-[var(--vscode-textBlockQuote-background)]">
            <div className="text-xs font-semibold text-[var(--vscode-foreground)] flex items-center gap-1 mb-2">
              <TableIcon className="w-3.5 h-3.5" />
              <span>交互式数据表格</span>
            </div>

            <table className="w-full text-xs text-left text-[var(--vscode-foreground)] border-collapse">
              <tbody>
                {(block.properties?.tableData || [["A", "B"]]).map(
                  (row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className={`${
                        rowIdx === 0
                          ? "bg-[var(--vscode-list-hoverBackground)] font-semibold"
                          : ""
                      }`}
                    >
                      {row.map((cell, colIdx) => (
                        <td
                          key={colIdx}
                          className="p-1.5"
                        >
                          <input
                            type="text"
                            value={cell}
                            onChange={(e) =>
                              handleTableCellEdit(
                                rowIdx,
                                colIdx,
                                e.target.value,
                              )
                            }
                            className="w-full bg-transparent border-none text-xs text-[var(--vscode-editor-foreground)] focus:outline-none px-1 py-0.5 rounded"
                          />
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>

            {/* Grid control bar */}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-[var(--vscode-descriptionForeground)] justify-end pt-3">
              <div className="flex gap-1.5">
                <button
                  onClick={addTableRow}
                  className="cursor-pointer bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] px-2 py-0.5 rounded"
                >
                  + 新增行
                </button>
                <button
                  onClick={removeTableRow}
                  className="cursor-pointer text-[var(--vscode-errorForeground)] px-2 py-0.5 rounded"
                >
                  - 裁减行
                </button>
              </div>

              <div className="flex gap-1.5">
                <button
                  onClick={addTableColumn}
                  className="cursor-pointer bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] px-2 py-0.5 rounded"
                >
                  + 新增列
                </button>
                <button
                  onClick={removeTableColumn}
                  className="cursor-pointer text-[var(--vscode-errorForeground)] px-2 py-0.5 rounded"
                >
                  - 裁减列
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TYPE 10: TOGGLE FOLDABLE BLOCK */}
        {block.type === "toggle" && (
          <div className="rounded-sm p-3 bg-[var(--vscode-textBlockQuote-background)]">
            <div className="flex items-center gap-2 cursor-pointer">
              <button
                onClick={() =>
                  onUpdateBlock({
                    properties: {
                      ...block.properties,
                      isOpen: !block.properties?.isOpen,
                    },
                  })
                }
                className="cursor-pointer text-[var(--vscode-icon-foreground)]"
              >
                {block.properties?.isOpen ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              <input
                data-block-editable="true"
                ref={elementRef as React.RefObject<HTMLInputElement>}
                onKeyDown={handleKeyDown}
                type="text"
                value={rawText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="折叠区主题..."
                className="w-full text-sm font-semibold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none"
              />
            </div>

            {block.properties?.isOpen && (
              <div className="pl-6 mt-3 pt-3">
                <div className="flex items-start gap-2">
                  <CornerDownRight className="w-4 h-4 text-[var(--vscode-icon-foreground)] opacity-50 mt-1" />
                  <textarea
                    value={block.properties?.caption || ""}
                    onChange={(e) =>
                      onUpdateBlock({
                        properties: {
                          ...block.properties,
                          caption: e.target.value,
                        },
                      })
                    }
                    placeholder="折叠详情与附加段落..."
                    className="w-full text-xs text-[var(--vscode-descriptionForeground)] bg-transparent border-none resize-none focus:outline-none"
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* TYPE 11: LIVE HTML PLAYBOARD & SANDBOX RENDER */}
        {block.type === "html-render" && (
          <div className="rounded-sm overflow-hidden bg-[var(--vscode-textBlockQuote-background)]">
            {/* Slim top toolbar: preset + reload + theme */}
            <div className="px-2.5 py-1.5 flex items-center justify-between bg-[var(--vscode-textBlockQuote-background)]">
              <div className="flex items-center gap-1">
                <PresetMenu loadPresetIntoSandbox={loadPresetIntoSandbox} />
                <button
                  type="button"
                  onClick={() => setRunIndicator((v) => v + 1)}
                  title="刷新预览"
                  className="cursor-pointer inline-flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reload
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleSandboxCodeChange(
                    sandboxHtml,
                    sandboxCss,
                    sandboxJs,
                    sandboxTheme === "light" ? "dark" : "light",
                  )
                }
                title="切换主题"
                className="cursor-pointer inline-flex items-center justify-center w-6 h-6 rounded text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
              >
                {sandboxTheme === "light" ? (
                  <Moon className="w-3.5 h-3.5" />
                ) : (
                  <Sun className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Source bar: URL input + File picker + Clear */}
            <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 bg-[var(--vscode-editor-background)]">
              <div className="min-w-[180px] flex-1 flex items-center gap-1.5">
                <Link className="w-3 h-3 text-[var(--vscode-icon-foreground)] opacity-60 shrink-0" />
                <input
                  type="url"
                  value={sandboxUrl}
                  onChange={(e) => handleSandboxUrlChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setRunIndicator((v) => v + 1);
                    }
                  }}
                  placeholder="example.com 或 https://..."
                  className="min-w-0 flex-1 bg-transparent border-none text-xs text-[var(--vscode-editor-foreground)] focus:outline-none placeholder:text-[var(--vscode-descriptionForeground)]"
                />
                {normalizeSandboxUrl(sandboxUrl) && (
                  <button
                    type="button"
                    onClick={openSandboxWebPreviewWindow}
                    title="在独立窗口中打开"
                    className="cursor-pointer px-1.5 py-0.5 rounded text-[10px] text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                  >
                    打开
                  </button>
                )}
              </div>

              <label className="cursor-pointer inline-flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
                <Upload className="w-3 h-3" />
                <span className="truncate max-w-[160px]">
                  {sandboxFileName || "File"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) =>
                    handleSandboxFileSelect(e.target.files?.[0] || null)
                  }
                />
              </label>

              {(sandboxUrl || sandboxFileName) && (
                <button
                  type="button"
                  onClick={handleSandboxClearAll}
                  title="清除 URL 和文件"
                  className="cursor-pointer inline-flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>

            {/* Preview pane. Auto-detects source (file > url > code). */}
            <SandboxPreview
              fileSrc={sandboxFileSrc}
              fileName={sandboxFileName}
              url={sandboxUrl}
              srcDoc={sandboxDebouncedSrcDoc}
              runIndicator={runIndicator}
              isDragging={sandboxIsDragging}
              onDragOver={(e) => {
                e.preventDefault();
                setSandboxIsDragging(true);
              }}
              onDragLeave={() => setSandboxIsDragging(false)}
              onDrop={handleSandboxDrop}
            />

            {/* Code editor (HTML/CSS/JS sub-tabs). */}
            <div>
              <div className="flex items-center gap-1 px-2.5 py-1 bg-[var(--vscode-textBlockQuote-background)]">
                {[
                  { id: "html", label: "HTML" },
                  { id: "css", label: "CSS" },
                  { id: "js", label: "JS" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSandboxCodeTab(tab.id as "html" | "css" | "js")}
                    className={`cursor-pointer px-2 py-1 rounded text-[10px] transition-colors ${
                      sandboxCodeTab === tab.id
                        ? "bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]"
                        : "text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <textarea
                value={
                  sandboxCodeTab === "html"
                    ? sandboxHtml
                    : sandboxCodeTab === "css"
                      ? sandboxCss
                      : sandboxJs
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (sandboxCodeTab === "html")
                    handleSandboxCodeChange(
                      val,
                      sandboxCss,
                      sandboxJs,
                      sandboxTheme,
                    );
                  else if (sandboxCodeTab === "css")
                    handleSandboxCodeChange(
                      sandboxHtml,
                      val,
                      sandboxJs,
                      sandboxTheme,
                    );
                  else
                    handleSandboxCodeChange(
                      sandboxHtml,
                      sandboxCss,
                      val,
                      sandboxTheme,
                    );
                }}
                className="w-full h-[320px] font-mono text-xs leading-relaxed bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)] p-4 border-none resize-y focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* TYPE 12: TLDRAW WHITEBOARD */}
        {block.type === "whiteboard" && (
          <div className="h-[500px] w-full border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden relative bg-white dark:bg-black">
            <Tldraw persistenceKey={`tldraw-${block.id}`} />
          </div>
        )}

        {/* 3. Slash Menu `/` Floating Commands Menu Popover */}
        {showSlashMenu && (
          <div
            className="absolute z-50 mt-2 w-56 rounded-sm bg-white dark:bg-[#252526] border border-slate-200 dark:border-white/[0.08] shadow-lg overflow-hidden text-slate-700 dark:text-slate-300 p-1"
            style={{
              top: slashMenuCoords ? slashMenuCoords.top : "100%",
              left: slashMenuCoords
                ? Math.max(slashMenuCoords.left - 24, 0)
                : 16,
            }}
          >
            <div className="py-1 max-h-56 overflow-y-auto">
              {SLASH_COMMANDS.map((cmd, idx) => {
                const IconComp = cmd.icon;
                const isSelected = idx === slashMenuIndex;
                return (
                  <button
                    key={cmd.type}
                    onClick={() => executeSlashCommand(cmd.type as BlockType)}
                    className={`cursor-pointer w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors text-xs font-medium ${
                      isSelected
                        ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                        : "hover:bg-slate-100 dark:hover:bg-white/5"
                    }`}
                    id={`slash-cmd-${cmd.type}`}
                  >
                    <IconComp
                      className={`w-3.5 h-3.5 ${isSelected ? "text-indigo-500 dark:text-indigo-400" : "text-slate-400"}`}
                    />
                    <span>{cmd.label}</span>
                    {isSelected && (
                      <span className="ml-auto text-[9px] text-indigo-400 dark:text-indigo-500">
                        ↵
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default BlockItem;

