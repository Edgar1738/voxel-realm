import { Game } from './Game';
import { shouldShowMenu } from './menu';
import { renderMenu, attachWorldsLink } from './menuScreen';
import { SHIPPED_MANIFEST } from './shippedManifest';
import { shouldShowDesktopShell, readShellSignals, renderDesktopShell } from './desktopShell';

// Touch-only devices get an honest full-screen "desktop required" shell instead of an
// unplayable boot (pointer lock + WASD need a mouse and keyboard). "Try anyway" opts through.
if (shouldShowDesktopShell(readShellSignals())) {
  document.getElementById('overlay')?.remove();
  document.getElementById('crosshair')?.remove();
  renderDesktopShell();
} else if (shouldShowMenu(window.location.search)) {
  // The bare URL is the front door (world-select menu); any explicit `?save=`/`?world=`
  // selection boots straight into the game, so every pre-menu URL keeps working.
  document.getElementById('overlay')?.remove();
  document.getElementById('crosshair')?.remove();
  const menu = document.getElementById('menu');
  if (!menu) throw new Error('Missing #menu element');
  renderMenu(menu, SHIPPED_MANIFEST);
} else {
  const canvas = document.getElementById('app');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #app canvas element');
  }
  attachWorldsLink();
  void Game.boot(canvas);
}
