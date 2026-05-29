// components/ui/viewport-controls.tsx — shared bottom-center viewport
// controller (horizontal row of zoom-in / zoom-out / fit).
//
// Visual contract is owned by `.viewport-controls` in app/globals.css,
// which combines with `.react-flow__controls` so the Knowledge Graph's
// built-in React Flow controls and this primitive look identical. If
// you want to change the look (color, divider, hover), edit globals.css
// — not this component.
//
// Use this anywhere a render surface needs zoom in / zoom out / fit so
// the graph viewer and the Mermaid viewer feel like one product.

"use client";

import { Plus, Minus, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Disables the + button when the viewer is at max zoom. */
  canZoomIn?: boolean;
  /** Disables the − button when the viewer is at min zoom. */
  canZoomOut?: boolean;
  className?: string;
}

export function ViewportControls({
  onZoomIn,
  onZoomOut,
  onFit,
  canZoomIn = true,
  canZoomOut = true,
  className,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Viewport controls"
      className={cn("viewport-controls flex flex-row", className)}
    >
      <ControlButton onClick={onZoomIn} disabled={!canZoomIn} ariaLabel="Zoom in">
        <Plus size={15} strokeWidth={2.5} />
      </ControlButton>
      <ControlButton onClick={onZoomOut} disabled={!canZoomOut} ariaLabel="Zoom out">
        <Minus size={15} strokeWidth={2.5} />
      </ControlButton>
      <ControlButton onClick={onFit} ariaLabel="Fit to view">
        <Maximize2 size={13} strokeWidth={2.25} />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  onClick,
  disabled,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        // Layout + sizing — visual styling (bg / color / border) is
        // owned by .viewport-controls in globals.css.
        "w-7 h-7 grid place-items-center transition-colors",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-inset",
      )}
    >
      {children}
    </button>
  );
}
