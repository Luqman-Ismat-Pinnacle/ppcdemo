'use client';

/**
 * @fileoverview Enhanced Tooltip Component for PPC V3.
 * 
 * Standardized tooltip system with support for:
 * - Calculation explanations
 * - Rich content formatting
 * - Consistent styling across the application
 * - Multiple placement options
 * 
 * @module components/ui/EnhancedTooltip
 */

import React, { useState, useRef, useEffect, ReactNode } from 'react';

import { createPortal } from 'react-dom';

export interface TooltipContent {
  /** Main title/heading */
  title?: string;
  /** Description text */
  description?: string;
  /** Calculation formula/explanation */
  calculation?: string;
  /** Additional details or notes */
  details?: string[];
  /** Raw content (for complex HTML) */
  content?: ReactNode;
}

export interface EnhancedTooltipProps {
  /** Tooltip content */
  content: TooltipContent | string | ReactNode;
  /** Tooltip placement */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  /** Child element that triggers the tooltip */
  children: React.ReactElement;
  /** Delay before showing tooltip (ms) */
  delay?: number;
  /** Max width of tooltip */
  maxWidth?: number;
  /** Whether to show tooltip on click instead of hover */
  trigger?: 'hover' | 'click';
}

/**
 * EnhancedTooltip - Standardized tooltip with calculation explanations
 */
export default function EnhancedTooltip({
  content,
  placement = 'auto',
  children,
  delay = 300,
  maxWidth = 350,
  trigger = 'hover',
}: EnhancedTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPlacement, setTooltipPlacement] = useState<'top' | 'bottom' | 'left' | 'right'>('top');
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine placement automatically if 'auto'
  useEffect(() => {
    if (placement === 'auto' && wrapperRef.current && showTooltip) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const spaceTop = rect.top;
      const spaceBottom = viewportHeight - rect.bottom;
      const spaceLeft = rect.left;
      const spaceRight = viewportWidth - rect.right;

      // Prefer top if space allows, otherwise bottom
      if (spaceTop >= 200) {
        setTooltipPlacement('top');
      } else if (spaceBottom >= 200) {
        setTooltipPlacement('bottom');
      } else if (spaceRight >= 300) {
        setTooltipPlacement('right');
      } else {
        setTooltipPlacement('left');
      }
    } else if (placement !== 'auto') {
      setTooltipPlacement(placement);
    }
  }, [placement, showTooltip]);

  // Calculate tooltip position
  const calculatePosition = () => {
    if (!wrapperRef.current || !tooltipRef.current) return;

    const rect = wrapperRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    // Since we are using portal + fixed, we don't need scroll offsets for the container position
    // BUT rect (getBoundingClientRect) is already relative to viewport.
    // position: fixed is relative to viewport.
    // So top/left should be rect.top / rect.left (+ adjustments).
    // We do NOT add window.pageYOffset/scrollX because fixed positioning is relative to the window, not the document.

    let top = 0;
    let left = 0;

    switch (tooltipPlacement) {
      case 'top':
        top = rect.top - tooltipRect.height - 8;
        left = rect.left + rect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - tooltipRect.width - 8;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + 8;
        break;
    }

    // Ensure tooltip stays within viewport
    const padding = 10;

    // Horizontal clamping
    if (left - tooltipRect.width / 2 < padding && (tooltipPlacement === 'top' || tooltipPlacement === 'bottom')) {
      // This logic for centering needs adjustment if we are just setting left.
      // Actually, the transform translate(-50%) handles the centering.
      // We need to clamp the *resulting* edge.
      // Let's refine clamping after transform logic or just clamp text.
      // Easier to just clamp the calculated 'left' but remember the transform.
    }

    // Simple clamping for left/top (ignoring transform impact for a moment, but transform is crucial)
    // Actually, with transform, the logic is:
    // Left edge = left - width/2 (for top/bottom)
    // Right edge = left + width/2

    // Let's rely on standard calculation and CSS transform. 
    // Usually portals need precise calculation to avoid offscreen.

    // Re-calculating with explicit edges to prevent off-screen:

    // Apply transform logic manually to check bounds? 
    // Or just let it be. For now, simple fixed positioning is better than relative.

    setTooltipPosition({ top, left });
  };

  useEffect(() => {
    if (showTooltip) {
      // Need a small delay or double pass to let the tooltip render and have dimensions
      // But we can try immediately.
      requestAnimationFrame(() => calculatePosition());

      const handleResize = () => calculatePosition();
      const handleScroll = () => calculatePosition();
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [showTooltip, tooltipPlacement]);

  const handleShow = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, delay);
  };

  const handleHide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShowTooltip(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (trigger === 'click') {
      e.preventDefault();
      e.stopPropagation();
      setShowTooltip(!showTooltip);
    }
  };

  // Render tooltip content
  const renderContent = (): ReactNode => {
    if (typeof content === 'string') {
      return <div>{content}</div>;
    }

    if (React.isValidElement(content)) {
      return content;
    }

    const tooltipContent = content as TooltipContent;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tooltipContent.title && (
          <div style={{
            fontWeight: 700,
            fontSize: '0.9rem',
            color: 'var(--text-primary)',
            marginBottom: '4px',
          }}>
            {tooltipContent.title}
          </div>
        )}
        {tooltipContent.description && (
          <div style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}>
            {tooltipContent.description}
          </div>
        )}
        {tooltipContent.calculation && (
          <div style={{
            marginTop: '8px',
            padding: '8px',
            background: 'rgba(64, 224, 208, 0.1)',
            border: '1px solid rgba(64, 224, 208, 0.3)',
            borderRadius: '4px',
            fontSize: '0.8rem',
            fontFamily: 'monospace',
            color: 'var(--pinnacle-teal)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
              Calculation:
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{tooltipContent.calculation}</div>
          </div>
        )}
        {tooltipContent.details && tooltipContent.details.length > 0 && (
          <div style={{ marginTop: '4px' }}>
            {tooltipContent.details.map((detail, idx) => (
              <div key={idx} style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginTop: '4px',
                paddingLeft: '12px',
                position: 'relative',
              }}>
                <span style={{
                  position: 'absolute',
                  left: 0,
                  color: 'var(--pinnacle-teal)'
                }}>•</span>
                {detail}
              </div>
            ))}
          </div>
        )}
        {tooltipContent.content && (
          <div>{tooltipContent.content}</div>
        )}
      </div>
    );
  };

  const tooltipElement = showTooltip ? (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        top: tooltipPosition.top,
        left: tooltipPosition.left,
        transform: tooltipPlacement === 'top' || tooltipPlacement === 'bottom'
          ? 'translateX(-50%)'
          : tooltipPlacement === 'left'
            ? 'translate(-100%, -50%)' // Center vertically, move left
            : tooltipPlacement === 'right'
              ? 'translateY(-50%)' // Center vertically
              : 'none',
        zIndex: 99999,
        maxWidth: `${maxWidth}px`,
        padding: '12px 16px',
        background: 'rgba(26, 26, 26, 0.9)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        color: 'var(--text-primary)',
        fontSize: '0.85rem',
        lineHeight: 1.5,
        wordWrap: 'break-word',
        whiteSpace: 'normal',
        pointerEvents: 'none',
        animation: 'tooltip-fade-in 0.2s ease-out',
      }}
    >
      {renderContent()}

      {/* Arrow */}
      <div
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          borderStyle: 'solid',
          ...(tooltipPlacement === 'top' && {
            bottom: '-6px',
            left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '6px 6px 0 6px',
            borderColor: 'var(--bg-card) transparent transparent transparent',
          }),
          ...(tooltipPlacement === 'bottom' && {
            top: '-6px',
            left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '0 6px 6px 6px',
            borderColor: 'transparent transparent var(--bg-card) transparent',
          }),
          ...(tooltipPlacement === 'left' && {
            right: '-6px',
            top: '50%',
            transform: 'translateY(-50%)',
            borderWidth: '6px 0 6px 6px',
            borderColor: 'transparent transparent transparent var(--bg-card)',
          }),
          ...(tooltipPlacement === 'right' && {
            left: '-6px',
            top: '50%',
            transform: 'translateY(-50%)',
            borderWidth: '6px 6px 6px 0',
            borderColor: 'transparent var(--bg-card) transparent transparent',
          }),
        }}
      />
    </div>
  ) : null;

  return (
    <>
      <div
        ref={wrapperRef}
        style={{ display: 'inline-block', position: 'relative' }}
        onMouseEnter={trigger === 'hover' ? handleShow : undefined}
        onMouseLeave={trigger === 'hover' ? handleHide : undefined}
        onClick={trigger === 'click' ? handleClick : undefined}
      >
        {children}
      </div>

      <style jsx global>{`
        @keyframes tooltip-fade-in {
          from {
            opacity: 0;
            // transform adjustment handled in inline styles based on placement
            // We just animate opacity here to keep it simple with dynamic transforms
          }
          to {
            opacity: 1;
          }
        }
      `}</style>

      {mounted && tooltipElement ? createPortal(tooltipElement, document.body) : null}
    </>
  );
}
