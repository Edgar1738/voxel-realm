/// <reference types="vite/client" />

declare module 'https://esm.sh/html2canvas@1.4.1' {
  const html2canvas: (
    el: HTMLElement,
    opts?: { backgroundColor?: string | null; scale?: number; logging?: boolean },
  ) => Promise<HTMLCanvasElement>;
  export default html2canvas;
}
