import '@testing-library/jest-dom';

// jsdom doesn't implement the browser APIs that the ordering components touch. Stub them so
// component renders don't throw; behaviour that actually depends on them (scroll-spy, sticky
// measuring) is covered by Playwright, not these render tests.
class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

if (!('IntersectionObserver' in globalThis)) {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = NoopObserver;
}
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopObserver;
}

const cssRef = (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS ?? {};
if (typeof cssRef.escape !== 'function') {
  cssRef.escape = (value: string) => value;
}
(globalThis as { CSS?: unknown }).CSS = cssRef;

// jsdom logs "Not implemented" for scrollIntoView; make it a silent no-op.
Element.prototype.scrollIntoView = function scrollIntoView(): void {};
