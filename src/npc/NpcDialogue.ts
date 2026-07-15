import type { NpcDefinition, NpcDialogueContext, ResolvedDialogueNode } from './NpcTypes';

/** Resolves dynamic copy and conditional actions without exposing callbacks to the UI layer. */
export function resolveNpcDialogue(
  npc: NpcDefinition,
  nodeId: string,
  context: NpcDialogueContext,
): ResolvedDialogueNode | undefined {
  const node = npc.dialogue.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return undefined;
  return {
    id: node.id,
    message: typeof node.message === 'function' ? node.message(context) : node.message,
    actions: node.actions
      .filter((action) => action.visible?.(context) ?? true)
      .map(({ id, label, next, effect }) => ({
        id,
        label,
        ...(next !== undefined ? { next } : {}),
        ...(effect !== undefined ? { effect } : {}),
      })),
  };
}
