import type { GraphNodeShape } from './graphSnapshot';

/* ------------------------------------------------------------------ */
/* ShapeGlyph — 工具栏按钮上的真实形状预览                             */
/*                                                                    */
/* 直接画出对应形状的样貌（而非 lucide 抽象图标），用 currentColor      */
/* 描边，自动跟随按钮文字色 → 明暗主题天然适配，与画布上的实际图形一致。*/
/* 描边宽度对齐 graphTheme.SHAPE_STROKE_WIDTH(1.5)。                    */
/* ------------------------------------------------------------------ */

export function ShapeGlyph({ shape }: { shape: GraphNodeShape }) {
  const sw = 1.5;
  switch (shape) {
    case 'rectangle':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="3.5" width="12" height="9" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'rounded':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="3.5" width="12" height="9" rx="2.5" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'ellipse':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <ellipse cx="8" cy="8" rx="6.5" ry="5" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'diamond':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8 2 L14 8 L8 14 L2 8 Z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    case 'text':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3.5 4 H12.5 M8 4 V13" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case 'actor':
      // 用例图角色：小人图标（头圆 + 身体 + 手臂 + 腿），手臂略向下倾斜
      return (
        <svg width="16" height="16" viewBox="0 0 16 20" fill="none" aria-hidden>
          {/* 头 */}
          <circle cx="8" cy="3.5" r="3" stroke="currentColor" strokeWidth={sw} />
          {/* 身体 */}
          <line x1="8" y1="7" x2="8" y2="11" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          {/* 手臂：略向下倾斜 */}
          <line x1="8" y1="8" x2="3" y2="10" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <line x1="8" y1="8" x2="13" y2="10" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          {/* 腿 */}
          <line x1="8" y1="11" x2="4" y2="17" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <line x1="8" y1="11" x2="12" y2="17" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case 'swimlane-v':
      // 垂直泳道：矩形 + 标题栏
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth={sw} />
          <line x1="6" y1="2" x2="6" y2="14" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'swimlane-h':
      // 水平泳道：矩形 + 标题栏横线
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth={sw} />
          <line x1="2" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'lifeline':
      // 时序图生命线：矩形 + 虚线
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="3" y="2" width="10" height="4" rx="1" stroke="currentColor" strokeWidth={sw} />
          <line x1="8" y1="6" x2="8" y2="14" stroke="currentColor" strokeWidth={sw} strokeDasharray="2 2" />
        </svg>
      );
    case 'activation':
      // 时序图激活框：带填充的窄矩形，与画布实际样式一致
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="5" y="2" width="6" height="12" fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'note':
      // 注释框：折角矩形
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 2 L12 2 L14 4 L14 14 L2 14 Z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
          <path d="M12 2 L12 4 L14 4" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    case 'database':
      // 数据库：圆柱体（上下椭圆 + 主体）
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <ellipse cx="8" cy="3.5" rx="5" ry="1.8" stroke="currentColor" strokeWidth={sw} fill="none" />
          <path d="M3 3.5 L3 12.5" stroke="currentColor" strokeWidth={sw} />
          <path d="M13 3.5 L13 12.5" stroke="currentColor" strokeWidth={sw} />
          <path d="M3 12.5 C3 13.5 5.5 14.3 8 14.3 C10.5 14.3 13 13.5 13 12.5" stroke="currentColor" strokeWidth={sw} fill="none" />
        </svg>
      );
    case 'edge-line':
      // 直线 + V 字形箭头
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <line x1="2" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <path d="M10 6 L13 8 L10 10" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'edge-ortho':
      // 拐角 + V 字形箭头
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 4 L2 8 L12 8" stroke="currentColor" strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 6 L13 8 L10 10" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'edge-dashed':
      // 虚线 + 开放 V 形箭头（UML 返回消息惯例，与 openThin 样式一致）
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <line x1="2" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth={sw} strokeDasharray="2 2" strokeLinecap="round" />
          <path d="M10 6 L13 8 L10 10" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'edge-no-arrow':
      // 无箭头连线
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    default:
      return null;
  }
}
