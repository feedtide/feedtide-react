import { useEffect, useRef } from "react";
import { POSITION_STYLES } from "../constants";
import type { WidgetPosition } from "../types";

// Mirrors embed.js button exactly — same element IDs, classes, styles, and SVG

const ARROW_ROTATION: Record<string, string> = {
  bottom: "0",
  top: "180",
  left: "90",
  right: "-90",
};

const ARROW_POSITION: Record<string, string> = {
  bottom: "top: 2px; left: 50%; transform: translateX(-50%);",
  top: "bottom: 2px; left: 50%; transform: translateX(-50%);",
  left: "right: 2px; top: 50%; transform: translateY(-50%);",
  right: "left: 2px; top: 50%; transform: translateY(-50%);",
};

function buildButtonCSS(position: WidgetPosition): string {
  const posStyles = POSITION_STYLES[position];
  const axis = posStyles.hideAxis;

  return `
    @keyframes ft-wave-vertical {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-12px); }
    }
    @keyframes ft-wave-horizontal {
      0%, 100% { transform: translateX(0); }
      50% { transform: translateX(-12px); }
    }
    #feedback-widget-button.ft-peeking {
      animation: ft-wave-vertical 1.5s ease-in-out infinite;
    }
    #feedback-widget-button.ft-peeking-h {
      animation: ft-wave-horizontal 1.5s ease-in-out infinite;
    }
    #feedback-widget-button.ft-visible {
      animation: none;
    }
    #feedback-widget-button {
      position: fixed;
      ${posStyles.button}
      height: 48px;
      padding: 0;
      padding-right: 0;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 24px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      transition: bottom 0.4s ease, top 0.4s ease, left 0.4s ease, right 0.4s ease, transform 0.2s ease, box-shadow 0.2s ease;
      display: flex;
      align-items: center;
      overflow: hidden;
    }
    #feedback-widget-button.ft-visible:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }
    #feedback-widget-button .feedback-icon {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #feedback-widget-button .feedback-icon svg {
      width: 26px;
      height: 26px;
    }
    #feedback-widget-button .feedback-text {
      max-width: 0;
      padding-right: 0;
      opacity: 0;
      overflow: hidden;
      white-space: nowrap;
      transition: max-width 0.3s ease, opacity 0.2s ease, padding-right 0.3s ease;
    }
    #feedback-widget-button:hover .feedback-text {
      max-width: 80px;
      padding-right: 16px;
      opacity: 1;
    }
    #feedback-widget-button .ft-arrow {
      position: absolute;
      ${ARROW_POSITION[axis]}
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.9;
      transition: opacity 0.2s ease;
    }
    #feedback-widget-button .ft-arrow svg {
      width: 10px;
      height: 10px;
    }
    #feedback-widget-button.ft-visible .ft-arrow,
    #feedback-widget-button.ft-peeking .ft-arrow,
    #feedback-widget-button.ft-peeking-h .ft-arrow {
      opacity: 0;
      pointer-events: none;
    }
  `;
}

interface WidgetButtonProps {
  position: WidgetPosition;
  onClick: () => void;
}

export function WidgetButton({ position, onClick }: WidgetButtonProps) {
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const axis = POSITION_STYLES[position].hideAxis;

  // Inject styles into <head> (mirrors embed.js approach for ID-based selectors)
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = buildButtonCSS(position);
    document.head.appendChild(style);
    styleRef.current = style;
    return () => {
      style.remove();
    };
  }, [position]);

  const arrowSvg = (
    <svg
      viewBox="0 0 12 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform: `rotate(${ARROW_ROTATION[axis]}deg)` }}
    >
      <path
        d="M1.5 6.5L6 2L10.5 6.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <button id="feedback-widget-button" className="ft-visible" onClick={onClick}>
      <span className="feedback-icon">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="11" r="9" stroke="#ffffff" strokeWidth="2" fill="none" />
          <path d="M6 18.5 L9 15" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M5 9.5c1.5-1.5 3-2 4.5-2s3 1.5 4.5 1.5 3-1.5 4.5-1.5"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M5 13c1.5-1.5 3-2 4.5-2s3 1.5 4.5 1.5 3-1.5 4.5-1.5"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>
      </span>
      <span className="feedback-text">Feedtide</span>
      <span className="ft-arrow">{arrowSvg}</span>
    </button>
  );
}
