export interface LayoutPosition {
  left: number;
  top: number;
}

export function getAbsoluteLayoutPosition(node: unknown): LayoutPosition {
  let left = 0;
  let top = 0;
  let current = node;

  while (isLayoutNode(current)) {
    const layout = current.yogaNode?.getComputedLayout?.();
    left += numberValue(layout?.left);
    top += numberValue(layout?.top);
    current = current.parentNode;
  }

  return { left, top };
}

function isLayoutNode(value: unknown): value is {
  parentNode?: unknown;
  yogaNode?: { getComputedLayout?: () => { left?: unknown; top?: unknown } };
} {
  return Boolean(value && typeof value === "object");
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
