'use client';

/**
 * @fileoverview Overflow Tooltip Component for PPC V3.
 * 
 * Detects text overflow and shows full text on hover.
 * Features:
 * - Automatic overflow detection
 * - Themed tooltip matching dark theme
 * - High z-index to display above all content
 * - Smooth animation
 * 
 * @module components/ui/OverflowTooltip
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface OverflowTooltipProps {
  /** Text content to display */
  children: React.ReactNode;
  /** Additional className for the wrapper */
  className?: string;
  /** Max width for the text container */
  maxWidth?: string | number;
  /** Tooltip placement preference */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Custom styles for the wrapper */
  style?: React.CSSProperties;
  /** Always show tooltip regardless of overflow */
  alwaysShow?: boolean;
}

/**
 * OverflowTooltip - Shows full text in tooltip when content is truncated
 */
export default function OverflowTooltip({
  children,
  className = '',
  maxWidth = '100%',
  placement = 'top',
  style = {},
  alwaysShow = false,
}: OverflowTooltipProps) {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const textRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Check if content is overflowing
  const checkOverflow = useCallback(() => {
    if (textRef.current) {
      const isOver = textRef.current.scrollWidth > textRef.current.clientWidth;
      setIsOverflowing(isOver);
    }
  }, []);

  // Check overflow on mount and resize
  useEffect(() => {
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [checkOverflow, children]);

  // Calculate tooltip position
  const calculatePosition = useCallback(() => {
    if (!textRef.current) return;
    
    const rect = textRef.current.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    let top = 0;
    let left = 0;
    
    switch (placement) {
      case 'top':
        top = rect.top + scrollTop - 8;
        left = rect.left + scrollLeft + rect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + scrollTop + 8;
        left = rect.left + scrollLeft + rect.width / 2;
        break;
      case 'left':
        top = rect.top + scrollTop + rect.height / 2;
        left = rect.left + scrollLeft - 8;
        break;
      case 'right':
        top = rect.top + scrollTop + rect.height / 2;
        left = rect.right + scrollLeft + 8;
        break;
    }
    
    setTooltipPosition({ top, left });
  }, [placement]);

  const handleMouseEnter = () => {
    if (alwaysShow || isOverflowing) {
      calculatePosition();
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  // Get text content for tooltip
  const getTextContent = (): string => {
    if (typeof children === 'string') return children;
    if (textRef.current) return textRef.current.textContent || '';
    return '';
  };

  return (
    <>
      {/* Text Container */}
      <div
        ref={textRef}
        className={`overflow-tooltip-text ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          maxWidth,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: (alwaysShow || isOverflowing) ? 'help' : 'default',
          ...style,
        }}
      >
        {children}
      </div>

      {/* Tooltip Portal */}
      {showTooltip && (alwaysShow || isOverflowing) && (
        <div
          ref={tooltipRef}
          className="overflow-tooltip"
          style={{
            position: 'fixed',
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: placement === 'top' || placement === 'bottom'
              ? 'translateX(-50%)'
              : placement === 'left'
                ? 'translate(-100%, -50%)'
                : 'translateY(-50%)',
            marginTop: placement === 'top' ? '-8px' : placement === 'bottom' ? '8px' : 0,
            marginLeft: placement === 'right' ? '8px' : 0,
            zIndex: 99999,
            maxWidth: '400px',
            padding: '8px 12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            lineHeight: 1.4,
            wordWrap: 'break-word',
            whiteSpace: 'normal',
            pointerEvents: 'none',
            animation: 'tooltip-fade-in 0.15s ease-out',
          }}
        >
          {getTextContent()}
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              width: 0,
              height: 0,
              borderStyle: 'solid',
              ...(placement === 'top' && {
                bottom: '-6px',
                left: '50%',
                transform: 'translateX(-50%)',
                borderWidth: '6px 6px 0 6px',
                borderColor: 'var(--bg-card) transparent transparent transparent',
              }),
              ...(placement === 'bottom' && {
                top: '-6px',
                left: '50%',
                transform: 'translateX(-50%)',
                borderWidth: '0 6px 6px 6px',
                borderColor: 'transparent transparent var(--bg-card) transparent',
              }),
              ...(placement === 'left' && {
                right: '-6px',
                top: '50%',
                transform: 'translateY(-50%)',
                borderWidth: '6px 0 6px 6px',
                borderColor: 'transparent transparent transparent var(--bg-card)',
              }),
              ...(placement === 'right' && {
                left: '-6px',
                top: '50%',
                transform: 'translateY(-50%)',
                borderWidth: '6px 6px 6px 0',
                borderColor: 'transparent var(--bg-card) transparent transparent',
              }),
            }}
          />
        </div>
      )}

      {/* Global styles for animation */}
      <style jsx global>{`
        @keyframes tooltip-fade-in {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </>
  );
}

/**
 * Utility component for table cells with overflow tooltip
 */
export function TooltipCell({
  children,
  maxWidth = '150px',
  className = '',
}: {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <OverflowTooltip maxWidth={maxWidth} className={className}>
      {children}
    </OverflowTooltip>
  );
}

