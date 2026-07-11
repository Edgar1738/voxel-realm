// src/app/desktopShell.ts
//
// Touch/desktop honesty: the game needs pointer lock + a keyboard, so a touch-only device
// gets a full-screen "desktop required" shell instead of an unplayable boot (the menu hint
// alone let phones fall straight into a black-box game). Detection gates on `any-pointer:
// fine` — an iPad with a trackpad or mouse passes — and a "Try anyway" escape hatch covers
// devices that mis-report, persisted per tab so the choice survives world navigation.

/** sessionStorage key for the per-tab "Try anyway" override. */
export const DESKTOP_OVERRIDE_KEY = 'vr.desktopOverride';

interface ShellSignals {
  /** Whether ANY attached pointer is fine (mouse/trackpad/stylus) — `(any-pointer: fine)`. */
  anyPointerFine: boolean;
  /** Whether the user already chose "Try anyway" this tab. */
  override: boolean;
}

/** Pure gate: show the shell only for touch-only devices that haven't opted through. */
export function shouldShowDesktopShell(signals: ShellSignals): boolean {
  return !signals.anyPointerFine && !signals.override;
}

/** Reads the live signals (fails open — ancient browsers without matchMedia just play). */
export function readShellSignals(): ShellSignals {
  let anyPointerFine = true;
  try {
    if (typeof matchMedia === 'function') {
      anyPointerFine = matchMedia('(any-pointer: fine)').matches;
    }
  } catch {
    /* matchMedia unavailable — assume desktop */
  }
  let override = false;
  try {
    override = sessionStorage.getItem(DESKTOP_OVERRIDE_KEY) === '1';
  } catch {
    /* sessionStorage unavailable — no override */
  }
  return { anyPointerFine, override };
}

/**
 * Renders the full-screen shell into `document.body`. "Try anyway" persists the override
 * for this tab and reloads, which re-enters the normal boot path.
 */
export function renderDesktopShell(): void {
  const shell = document.createElement('div');
  shell.id = 'desktop-shell';

  const panel = document.createElement('div');
  panel.className = 'desktop-shell-panel';

  const title = document.createElement('h1');
  title.textContent = 'Voxel Realm needs a desktop';
  const body = document.createElement('p');
  body.textContent =
    'This is a mouse-and-keyboard game: it captures the pointer to look around and uses ' +
    'WASD to move, which touch screens can’t drive. Open it on a computer — or a tablet ' +
    'with a trackpad or mouse — to explore the worlds.';
  const url = document.createElement('p');
  url.className = 'desktop-shell-url';
  url.textContent = window.location.host + window.location.pathname;

  const tryAnyway = document.createElement('button');
  tryAnyway.type = 'button';
  tryAnyway.className = 'desktop-shell-try';
  tryAnyway.textContent = 'Try anyway';
  tryAnyway.addEventListener('click', () => {
    try {
      sessionStorage.setItem(DESKTOP_OVERRIDE_KEY, '1');
    } catch {
      /* no sessionStorage — the reload will just show the shell again */
    }
    window.location.reload();
  });

  panel.append(title, body, url, tryAnyway);
  shell.append(panel);
  document.body.append(shell);
}
