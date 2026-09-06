/**
 * Shared inline SVG icons for block NodeViews.
 *
 * Extracted from ImageView / FileView to avoid duplication.
 * We use inline SVG (rather than lucide-react) for block-placeholder icons
 * so the stroke width and viewBox match across all block types.
 */

/** Upload icon — cloud-upload arrow. Used by Image/File placeholder buttons. */
export function UploadIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

/**
 * Globe icon — 线框地球（圆 + 经线椭圆 + 赤道 + 两条弧形纬线）。
 *
 * lucide 的 Globe 只有一条经线加一条赤道，在活动栏 20px 下过于空旷；
 * 这里的经纬网格更立体，strokeWidth 1.8 在 20px 时约 1.5px，
 * 比旁边 lucide 图标（1.67px）略细，抵消多线条带来的视觉变重。
 * 同时兼容 className（tailwind 定尺寸）与 size（固定像素）两种用法。
 */
export function GlobeIcon({
  size,
  className,
}: {
  size?: number | string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
      <path d="M4.6 7.2c1.9 1.5 4.6 2.3 7.4 2.3s5.5-.8 7.4-2.3" />
      <path d="M4.6 16.8c1.9-1.5 4.6-2.3 7.4-2.3s5.5.8 7.4 2.3" />
    </svg>
  );
}

/** Align-left icon — used by the Image floating toolbar. */
export function AlignLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  );
}

/** Align-center icon — used by the Image floating toolbar. */
export function AlignCenterIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}