import { collectDevState, type DevState, type DevStateContext } from './DevState';

const UPDATE_MS = 225;
const RAD_TO_DEG = 180 / Math.PI;
const STYLE_ID = 'dev-hud-style';
const STORAGE_KEY = 'vr.devHud';

export interface DevHudRow {
  label: string;
  value: string;
}

export function formatDevHudRows(state: DevState): DevHudRow[] {
  const rows: DevHudRow[] = [
    { label: 'Pos', value: `${fmt(state.pos.x)} ${fmt(state.pos.y)} ${fmt(state.pos.z)}` },
    { label: 'Chunk', value: `${state.chunk.cx} ${state.chunk.cz}` },
    { label: 'Look', value: `${fmt(state.yaw * RAD_TO_DEG)} ${fmt(state.pitch * RAD_TO_DEG)}` },
    { label: 'Block', value: state.selectedBlock },
    { label: 'World', value: state.worldName },
    { label: 'Preset', value: state.preset },
    { label: 'Chunks', value: String(state.loadedChunkCount) },
    { label: 'Mode', value: state.flyMode },
  ];
  if (state.perf) {
    rows.push(
      { label: 'FPS', value: String(Math.round(state.perf.fps)) },
      { label: 'Upd ms', value: `${fmt(state.perf.updMsP50)} / ${fmt(state.perf.updMsMax)}` },
      { label: 'Mesh/f', value: String(state.perf.meshPeak) },
      { label: 'Gen/f', value: String(state.perf.genPeak) },
    );
  }
  return rows;
}

/** Returns a teardown function that stops the HUD update loop and removes the element. */
export function installDevHud(ctx: DevStateContext): () => void {
  installDevHudStyle();

  const root = document.createElement('aside');
  root.id = 'dev-hud';
  root.setAttribute('aria-label', 'Dev HUD');

  const title = document.createElement('div');
  title.className = 'dev-hud-title';

  const titleText = document.createElement('span');
  titleText.textContent = 'Dev';

  const hint = document.createElement('span');
  hint.className = 'dev-hud-hint';
  hint.textContent = 'F3';

  title.append(titleText, hint);

  const rows = document.createElement('dl');
  rows.className = 'dev-hud-rows';

  root.append(title, rows);
  document.body.append(root);

  // Visibility preference persists across reloads (default visible; only 'off' hides it).
  let visible = readHudVisible();
  root.hidden = !visible;

  const render = (): void => {
    if (!visible) return;
    rows.replaceChildren(
      ...formatDevHudRows(collectDevState(ctx)).map(({ label, value }) => {
        const item = document.createElement('div');
        item.className = 'dev-hud-row';

        const term = document.createElement('dt');
        term.textContent = label;

        const detail = document.createElement('dd');
        detail.textContent = value;

        item.append(term, detail);
        return item;
      }),
    );
  };

  // F3 toggles the HUD (Minecraft debug-screen convention); the choice persists across reloads.
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'F3') return;
    e.preventDefault();
    visible = !visible;
    root.hidden = !visible;
    writeHudVisible(visible);
    if (visible) render();
  };
  window.addEventListener('keydown', onKeyDown);

  render();
  const intervalId = window.setInterval(render, UPDATE_MS);

  return (): void => {
    window.removeEventListener('keydown', onKeyDown);
    window.clearInterval(intervalId);
    root.remove();
  };
}

function fmt(value: number): string {
  return value.toFixed(1);
}

/** Reads the persisted HUD visibility; defaults to visible when unset or storage is unavailable. */
function readHudVisible(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeHudVisible(visible: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, visible ? 'on' : 'off');
  } catch {
    /* localStorage unavailable (e.g. private mode) — preference just won't persist */
  }
}

function installDevHudStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #dev-hud {
      position: fixed;
      top: 76px;
      right: 12px;
      z-index: 4;
      min-width: 188px;
      max-width: min(260px, calc(100vw - 24px));
      padding: 10px 12px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: rgba(12, 15, 20, 0.76);
      color: #eef2f6;
      font:
        12px ui-monospace,
        'Courier New',
        monospace;
      line-height: 1.35;
      pointer-events: none;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    }
    #dev-hud[hidden] {
      display: none;
    }
    .dev-hud-title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 6px;
      color: rgba(255, 211, 77, 0.95);
      font:
        11px system-ui,
        sans-serif;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .dev-hud-hint {
      color: rgba(238, 242, 246, 0.4);
      font-size: 10px;
    }
    .dev-hud-rows {
      display: grid;
      gap: 3px;
      margin: 0;
    }
    .dev-hud-row {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      gap: 10px;
      align-items: baseline;
    }
    .dev-hud-row dt {
      margin: 0;
      color: rgba(238, 242, 246, 0.56);
    }
    .dev-hud-row dd {
      margin: 0;
      overflow: hidden;
      color: #fff;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
  document.head.append(style);
}
