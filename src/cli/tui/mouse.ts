export interface TerminalPoint {
  x: number;
  y: number;
}

export interface TerminalRectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ToolResultHitTarget {
  toolCallId: string;
  rectangle: TerminalRectangle;
}

export interface SgrMouseInput extends TerminalPoint {
  button: "left" | "middle" | "right" | "unknown";
  action: "press" | "release";
}

const SGR_MOUSE_PATTERN = /^\u001B?\[<(\d+);(\d+);(\d+)([mM])$/;

export const ENABLE_SGR_MOUSE = "\u001B[?1000h\u001B[?1006h";
export const DISABLE_SGR_MOUSE = "\u001B[?1006l\u001B[?1000l";

export function parseSgrMouseInput(input: string): SgrMouseInput | undefined {
  const match = SGR_MOUSE_PATTERN.exec(input);
  if (!match) {
    return undefined;
  }

  const buttonCode = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  if (!Number.isFinite(buttonCode) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }

  return {
    button: mouseButton(buttonCode),
    action: match[4] === "M" ? "press" : "release",
    x,
    y,
  };
}

export function isSgrMouseInput(input: string): boolean {
  return SGR_MOUSE_PATTERN.test(input);
}

export function getTerminalRectangle(
  position: { left: number; top: number },
  size: { width: number; height: number },
): TerminalRectangle {
  const width = Math.max(1, Math.floor(size.width));
  const height = Math.max(1, Math.floor(size.height));
  const left = Math.floor(position.left) + 1;
  const top = Math.floor(position.top) + 1;

  return {
    left,
    top,
    right: left + width - 1,
    bottom: top + height - 1,
  };
}

export function findToolResultHitTarget(
  targets: readonly ToolResultHitTarget[],
  point: TerminalPoint,
): ToolResultHitTarget | undefined {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index];
    if (target && containsPoint(target.rectangle, point)) {
      return target;
    }
  }

  return undefined;
}

function containsPoint(rectangle: TerminalRectangle, point: TerminalPoint): boolean {
  return (
    point.x >= rectangle.left &&
    point.x <= rectangle.right &&
    point.y >= rectangle.top &&
    point.y <= rectangle.bottom
  );
}

function mouseButton(buttonCode: number): SgrMouseInput["button"] {
  if (buttonCode >= 64) {
    return "unknown";
  }

  switch (buttonCode & 3) {
    case 0:
      return "left";
    case 1:
      return "middle";
    case 2:
      return "right";
    default:
      return "unknown";
  }
}
