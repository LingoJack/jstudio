/**
 * RippleButton — button with Material-style ripple effect.
 *
 * On click, a circular ripple expands from the click point and fades out.
 * Multiple clicks can spawn overlapping ripples (no interference).
 *
 * Usage:
 *   <RippleButton onClick={...}>Click me</RippleButton>
 *   <RippleButton className="..." style={...}>Custom styles</RippleButton>
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import type { ReactNode, MouseEvent, CSSProperties } from 'react';

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

interface RippleButtonProps {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
  rippleColor?: string; // CSS color for ripple (default: rgba(255,255,255,0.35))
  rippleDuration?: number; // ms (default: 600)
}

export default function RippleButton({
  children,
  onClick,
  className = '',
  style,
  disabled,
  title,
  'aria-label': ariaLabel,
  rippleColor = 'rgba(255,255,255,0.35)',
  rippleDuration = 600,
}: RippleButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleIdRef = useRef(0);

  // Create ripple on click
  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;

      const button = buttonRef.current;
      if (!button) return;

      // Get click position relative to button
      const rect = button.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Calculate ripple size (cover entire button)
      // Ripple should expand from click point to cover the button edge
      const maxRadius = Math.max(
        Math.hypot(x, y),
        Math.hypot(rect.width - x, y),
        Math.hypot(x, rect.height - y),
        Math.hypot(rect.width - x, rect.height - y)
      );
      const size = maxRadius * 2;

      // Add ripple
      const id = ++rippleIdRef.current;
      setRipples((prev) => [...prev, { id, x, y, size }]);

      // Remove ripple after animation
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, rippleDuration);

      // Call original onClick
      onClick?.(e);
    },
    [disabled, rippleDuration, onClick]
  );

  // Cleanup remaining ripples on unmount
  useEffect(() => {
    return () => {
      setRipples([]);
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      {children}
      {/* Ripple elements */}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
            marginLeft: -ripple.size / 2,
            marginTop: -ripple.size / 2,
            background: rippleColor,
            animation: `ripple-expand ${rippleDuration}ms ease-out forwards`,
          }}
        />
      ))}
    </button>
  );
}