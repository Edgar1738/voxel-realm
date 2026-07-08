import { Game } from './Game';
import { shouldShowMenu } from './menu';
import { renderMenu, attachWorldsLink } from './menuScreen';
import { SHIPPED_MANIFEST } from './shippedManifest';

// The bare URL is the front door (world-select menu); any explicit `?save=`/`?world=`
// selection boots straight into the game, so every pre-menu URL keeps working.
if (shouldShowMenu(window.location.search)) {
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
