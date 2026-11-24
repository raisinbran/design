// Which tool owns the left mouse button in the viewport. Without a tool the drag pans the photo.
export type Tool = "none" | "crop" | "levelH" | "levelV";

/** Clicking the active tool again deselects it, which returns to panning. */
export const toggleTool = (current: Tool, next: Exclude<Tool, "none">): Tool =>
  current === next ? "none" : next;

/** Aspect and Clear crop work only while cropping or once a crop exists; zoom and grid always work. */
export const cropControlsEnabled = (tool: Tool, hasCrop: boolean): boolean =>
  tool === "crop" || hasCrop;
