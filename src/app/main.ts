import { Game } from './Game';

const canvas = document.getElementById('app');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #app canvas element');
}
Game.boot(canvas);
