import { useEffect } from 'react';
import { useConfirmSheet } from '@/components/ui/confirm-sheet';
import { useModelHub } from '@/hooks/useModelHub';

/**
 * The one owner of the cellular prompt. Rendered once by the hub layout, so it
 * appears exactly once whichever hub screen is on top (a restore lands on the
 * download screen with the list unmounted; the foreground path has both).
 */
export function CellularConfirm() {
  const { send, stateValue } = useModelHub();
  const { confirm, confirmElement } = useConfirmSheet();

  useEffect(() => {
    if (stateValue === 'cellularConfirm') {
      confirm({
        title: 'Download over cellular',
        message: 'This model is a large file and may use a significant amount of cellular data.',
        buttons: [
          { text: 'Cancel', style: 'cancel', onPress: () => send({ type: 'CELLULAR_CANCEL' }) },
          { text: 'Download over cellular', onPress: () => send({ type: 'CELLULAR_CONFIRM' }) },
        ],
      });
    }
  }, [stateValue, send, confirm]);

  return confirmElement;
}
