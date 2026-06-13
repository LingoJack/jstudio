import { useRef, useEffect } from 'react';
import { Eraser, Pencil } from 'lucide-react';
import type { BaseBlockProps } from './types';

interface Point {
  x: number;
  y: number;
}

interface DrawingPath {
  points: Point[];
  color: string;
}

/**
 * TYPE: canvas — a hand-drawing canvas.
 * Stores paths in block.properties.drawingPaths.
 */
export default function CanvasBlock({
  block,
  onUpdateBlock,
}: BaseBlockProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingPaths: DrawingPath[] = block.properties?.drawingPaths || [];
  const isDrawingRef = useRef(false);
  const currentPathRef = useRef<DrawingPath | null>(null);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'transparent';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const path of drawingPaths) {
      if (path.points.length === 0) continue;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    }
  };

  useEffect(() => {
    redrawCanvas();
  });

  const getCanvasPos = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDrawingRef.current = true;
    currentPathRef.current = {
      points: [getCanvasPos(e)],
      color: getComputedStyle(document.documentElement)
        .getPropertyValue('--vscode-editor-foreground')
        .trim() || '#333',
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingRef.current || !currentPathRef.current) return;
    currentPathRef.current.points.push(getCanvasPos(e));
    redrawCanvas();

    // Draw current in-progress path
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && currentPathRef.current) {
      ctx.beginPath();
      const path = currentPathRef.current;
      ctx.strokeStyle = path.color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    }
  };

  const handleMouseUp = () => {
    if (isDrawingRef.current && currentPathRef.current) {
      onUpdateBlock({
        properties: {
          ...block.properties,
          drawingPaths: [...drawingPaths, currentPathRef.current],
        },
      });
    }
    isDrawingRef.current = false;
    currentPathRef.current = null;
  };

  const handleClearCanvas = () => {
    onUpdateBlock({ properties: { ...block.properties, drawingPaths: [] } });
  };

  return (
    <div className="border border-[var(--vscode-widget-border)] rounded-sm overflow-hidden bg-[var(--vscode-textBlockQuote-background)]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--vscode-widget-border)] bg-[var(--vscode-editorWidget-background)]">
        <div className="flex items-center gap-2 text-xs text-[var(--vscode-foreground)] font-medium">
          <Pencil className="w-3 h-3" />
          <span>自由画布</span>
        </div>
        <button
          onClick={handleClearCanvas}
          className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-errorForeground)] p-1 rounded"
          title="清空画布"
        >
          <Eraser className="w-3.5 h-3.5" />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={300}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-auto cursor-crosshair"
      />
    </div>
  );
}
