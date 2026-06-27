import { CREATIVE_BLOCKS, type CreativeInventory } from './CreativeInventory';
import type { BlockRegistry } from '../blocks/BlockRegistry';

/** DOM handles for the creative HUD; pure construction, no game logic. */
export interface CreativeUi {
  hotbar: HTMLDivElement;
  picker: HTMLDivElement;
  toolSelect: HTMLSelectElement;
  reset: HTMLButtonElement;
  status: HTMLDivElement;
  renderHotbar(): void;
}

function button(text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  return b;
}

/**
 * Builds the creative hotbar, block picker, tool selector, and status line, appending them to
 * the document body. Stops UI pointer events from reaching the document so clicking the HUD
 * never triggers pointer-lock or an edit.
 */
export function createCreativeUi(
  registry: BlockRegistry,
  inventory: CreativeInventory,
  tools: readonly string[],
  toolLabel: (tool: string) => string,
): CreativeUi {
  const root = document.createElement('div');
  root.id = 'creative-ui';
  root.addEventListener('mousedown', (e) => e.stopPropagation());
  root.addEventListener('click', (e) => e.stopPropagation());

  const top = document.createElement('div');
  top.className = 'creative-top';
  const toolSelect = document.createElement('select');
  for (const t of tools) {
    const option = document.createElement('option');
    option.value = t;
    option.textContent = toolLabel(t);
    toolSelect.append(option);
  }
  const reset = button('Reset world');
  top.append(toolSelect, reset);

  const picker = document.createElement('div');
  picker.className = 'creative-picker';
  picker.hidden = true;
  for (const id of CREATIVE_BLOCKS) {
    const item = button(registry.get(id).name);
    item.dataset.block = String(id);
    picker.append(item);
  }

  const hotbar = document.createElement('div');
  hotbar.className = 'creative-hotbar';

  const status = document.createElement('div');
  status.className = 'creative-status';

  root.append(top, picker, status, hotbar);
  document.body.append(root);

  const renderHotbar = (): void => {
    hotbar.replaceChildren();
    inventory.hotbar.forEach((id, index) => {
      const slot = button(`${index + 1}: ${registry.get(id).name}`);
      slot.className = index === inventory.selectedSlot ? 'selected' : '';
      slot.dataset.slot = String(index);
      hotbar.append(slot);
    });
  };
  renderHotbar();

  return { hotbar, picker, toolSelect, reset, status, renderHotbar };
}
