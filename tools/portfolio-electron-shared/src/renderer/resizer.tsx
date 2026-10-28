import React, { useRef } from "react";
export function Resizer({
  value,
  min,
  max,
  change,
  label,
  reverse = false,
}: {
  value: number;
  min: number;
  max: number;
  change: (value: number) => void;
  label: string;
  reverse?: boolean;
}) {
  const start = useRef({ x: 0, width: value });
  const clamp = (width: number) => Math.max(min, Math.min(max, width));
  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          change(
            clamp(
              value +
                (event.key === "ArrowRight" ? 16 : -16) * (reverse ? -1 : 1),
            ),
          );
        }
        if (event.key === "Home") {
          event.preventDefault();
          change(min);
        }
        if (event.key === "End") {
          event.preventDefault();
          change(max);
        }
      }}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, width: value };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          change(
            clamp(
              start.current.width +
                (event.clientX - start.current.x) * (reverse ? -1 : 1),
            ),
          );
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    />
  );
}
