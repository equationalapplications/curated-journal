import { useEffect } from 'react';
import { useMachine } from '@xstate/react';

import { createKvLayoutCache } from '@/lib/graphLayoutCache';
import { graphLayoutMachine } from '@/machines/graphLayoutMachine';

// One cache for the app: its in-memory front survives the screen remounting.
const cache = createKvLayoutCache();

/**
 * Positions for the graph a structure key describes, laid out without
 * blocking the JS thread (see graphLayoutMachine). An unchanged graph reopens
 * from the saved layout instantly; a changed one warm-starts from it.
 *
 * Pass `cacheScope: null` for throwaway views (a neighbourhood).
 */
export function useGraphLayout(structureKey: string | null, cacheScope: string | null) {
  const [snapshot, send] = useMachine(graphLayoutMachine, { input: { cache } });

  useEffect(() => {
    if (structureKey) send({ type: 'STRUCTURE', key: structureKey, scope: cacheScope });
  }, [structureKey, cacheScope, send]);

  return {
    // Positions from a previous structure stay valid for the nodes they share
    // and are shown while the new layout starts.
    positions: snapshot.context.positions,
    settling: !snapshot.matches('settled') || snapshot.context.key !== structureKey,
  };
}
