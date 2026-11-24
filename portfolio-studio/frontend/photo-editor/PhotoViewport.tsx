// The photo, its crop rectangle and level guide, with one shared transform for every gesture.
// With no tool selected the left mouse button drags to pan; the wheel zooms about the pointer.
import { useEffect, useRef, useState } from "react";
import {
  cropFromDrag,
  DEFAULT_VIEWPORT,
  imageToScreen,
  moveCrop,
  panBy,
  resizeCrop,
  screenToImage,
  toPixels,
  zoomAt,
  type CropHandle,
  type CropRect,
  type Point,
  type Size,
  type Viewport,
} from "./geometry";
import type { Tool } from "./tools";

interface PhotoViewportProps {
  image: Size & { url: string };
  tool: Tool;
  crop: CropRect | undefined;
  /** Width over height of the locked crop shape, in pixels; none leaves the crop free. */
  aspect: number | undefined;
  height: number | string;
  onCrop: (crop: CropRect) => void;
  /** Both points are pixels of the straightened photo. */
  onGuide: (mode: "H" | "V", start: Point, end: Point) => void;
}

type Drag =
  | { kind: "pan"; last: Point }
  | { kind: "new"; start: Point }
  | { kind: "move"; last: Point }
  | { kind: "resize"; handle: CropHandle }
  | { kind: "guide"; mode: "H" | "V"; start: Point };

const HANDLES: CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HIT = 10;
const WHEEL_STEP = 1.1;

function handlePoint(crop: CropRect, handle: CropHandle): Point {
  const x = handle.includes("w")
    ? crop.x
    : handle.includes("e")
      ? crop.x + crop.width
      : crop.x + crop.width / 2;
  const y = handle.includes("n")
    ? crop.y
    : handle.includes("s")
      ? crop.y + crop.height
      : crop.y + crop.height / 2;
  return { x, y };
}

export function PhotoViewport({
  image,
  tool,
  crop,
  aspect,
  height,
  onCrop,
  onGuide,
}: PhotoViewportProps) {
  const box = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<Size>({ width: 600, height: 400 });
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [dragCrop, setDragCrop] = useState<CropRect | undefined>();
  const [guide, setGuide] = useState<{ start: Point; end: Point } | null>(null);
  const drag = useRef<Drag | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const shown = dragCrop ?? crop;

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const { width, height: tall } = element.getBoundingClientRect();
      if (width && tall) setContainer({ width, height: tall });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A passive React wheel handler cannot stop the page from scrolling, so listen natively.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      const current = viewportRef.current;
      setViewport(zoomAt(current, current.zoom * factor, anchor, container, image));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [container, image]);

  const local = (event: React.PointerEvent): Point => {
    const rect = box.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const toScreen = (point: Point) => imageToScreen(point, viewport, container, image);
  const toImage = (point: Point) => screenToImage(point, viewport, container, image);

  function hitHandle(screen: Point): CropHandle | null {
    if (!shown) return null;
    for (const handle of HANDLES) {
      const at = toScreen(handlePoint(shown, handle));
      if (Math.hypot(at.x - screen.x, at.y - screen.y) <= HIT) return handle;
    }
    return null;
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    const screen = local(event);
    const at = toImage(screen);
    box.current!.setPointerCapture(event.pointerId);
    if (tool === "none") drag.current = { kind: "pan", last: screen };
    else if (tool === "levelH" || tool === "levelV") {
      const mode = tool === "levelH" ? "H" : "V";
      drag.current = { kind: "guide", mode, start: at };
      setGuide({ start: at, end: at });
    } else {
      const handle = hitHandle(screen);
      const inside =
        shown &&
        at.x >= shown.x &&
        at.x <= shown.x + shown.width &&
        at.y >= shown.y &&
        at.y <= shown.y + shown.height;
      if (handle) drag.current = { kind: "resize", handle };
      else if (inside) drag.current = { kind: "move", last: at };
      else drag.current = { kind: "new", start: at };
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const active = drag.current;
    if (!active) return;
    const screen = local(event);
    const at = toImage(screen);
    if (active.kind === "pan") {
      setViewport(
        panBy(viewport, screen.x - active.last.x, screen.y - active.last.y, container, image),
      );
      active.last = screen;
    } else if (active.kind === "guide") {
      setGuide({ start: active.start, end: at });
    } else if (active.kind === "new") {
      const next = cropFromDrag(active.start, at, image, aspect);
      if (next) setDragCrop(next);
    } else if (active.kind === "move" && shown) {
      setDragCrop(moveCrop(shown, at.x - active.last.x, at.y - active.last.y));
      active.last = at;
    } else if (active.kind === "resize" && shown) {
      setDragCrop(resizeCrop(shown, active.handle, at, image, aspect));
    }
  }

  function onPointerCancel() {
    drag.current = null;
    setDragCrop(undefined);
    setGuide(null);
  }

  function onPointerUp(event: React.PointerEvent) {
    const active = drag.current;
    drag.current = null;
    if (box.current?.hasPointerCapture(event.pointerId))
      box.current.releasePointerCapture(event.pointerId);
    if (!active) return;
    if (active.kind === "guide" && guide) {
      onGuide(active.mode, toPixels(guide.start, image), toPixels(guide.end, image));
      setGuide(null);
    } else if (dragCrop) {
      onCrop(dragCrop);
      setDragCrop(undefined);
    }
  }

  const topLeft = toScreen({ x: 0, y: 0 });
  const bottomRight = toScreen({ x: 1, y: 1 });
  const cropBox =
    shown &&
    (() => {
      const a = toScreen({ x: shown.x, y: shown.y });
      const b = toScreen({ x: shown.x + shown.width, y: shown.y + shown.height });
      return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
    })();
  const cursor = tool === "none" ? "grab" : "crosshair";

  return (
    <div
      ref={box}
      role="application"
      aria-label="Photo viewport"
      style={{
        position: "relative",
        overflow: "hidden",
        height,
        touchAction: "none",
        cursor,
        background: "var(--mantine-color-default-hover)",
        userSelect: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <img
        src={image.url}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: topLeft.x,
          top: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
          maxWidth: "none",
          pointerEvents: "none",
        }}
      />
      <svg
        width={container.width}
        height={container.height}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {cropBox && (
          <>
            <path
              fillRule="evenodd"
              fill="rgba(0,0,0,0.45)"
              d={`M0 0H${container.width}V${container.height}H0Z M${cropBox.x} ${cropBox.y}h${cropBox.width}v${cropBox.height}h${-cropBox.width}Z`}
            />
            <rect {...cropBox} fill="none" stroke="#fff" strokeWidth={1.5} />
            {shown &&
              HANDLES.map((handle) => {
                const at = toScreen(handlePoint(shown, handle));
                return (
                  <rect
                    key={handle}
                    x={at.x - 5}
                    y={at.y - 5}
                    width={10}
                    height={10}
                    fill="#fff"
                    stroke="#228be6"
                  />
                );
              })}
          </>
        )}
        {guide && (
          <>
            <line
              x1={toScreen(guide.start).x}
              y1={toScreen(guide.start).y}
              x2={toScreen(guide.end).x}
              y2={toScreen(guide.end).y}
              stroke="#fab005"
              strokeWidth={2}
            />
            <circle
              cx={toScreen(guide.start).x}
              cy={toScreen(guide.start).y}
              r={4}
              fill="#fab005"
            />
            <circle cx={toScreen(guide.end).x} cy={toScreen(guide.end).y} r={4} fill="#fab005" />
          </>
        )}
      </svg>
    </div>
  );
}
