const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Wraps keyboard focus forward or backward within an overlay. */
export function wrapFocusIndex(index: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (index < 0 || index >= count) return direction === 1 ? 0 : count - 1;
  return (index + direction + count) % count;
}

export function focusableElementsWithin(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((node) => {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false;
    const closedDetails = node.closest('details:not([open])');
    if (!closedDetails) return true;
    return node.tagName === 'SUMMARY' && node.parentElement === closedDetails;
  });
}

export function setElementInert(element: HTMLElement, inert: boolean): void {
  (element as HTMLElement & { inert?: boolean }).inert = inert;
}
