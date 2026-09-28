import { useEffect } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { useConfirmSheet, type ConfirmButton } from '@/components/ui/confirm-sheet';

function Harness({ buttons }: { buttons?: ConfirmButton[] }) {
  const { confirm, confirmElement } = useConfirmSheet();
  useEffect(() => {
    confirm({ title: 'Save failed', message: 'boom', buttons });
  }, [confirm, buttons]);
  return confirmElement;
}

describe('useConfirmSheet', () => {
  it('runs the cancel button when dismissed via the scrim', async () => {
    const onCancel = jest.fn();
    const onRetry = jest.fn();
    const screen = await render(
      <Harness
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: onCancel },
          { text: 'Try again', onPress: onRetry },
        ]}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Close', { includeHiddenElements: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.queryByText('Save failed')).toBeNull();
  });

  it('is not dismissable without a cancel button', async () => {
    const onGo = jest.fn();
    const screen = await render(<Harness buttons={[{ text: 'Go', onPress: onGo }]} />);
    // The scrim is never advertised as a Close control when dismissal is
    // impossible — screen readers must not find a button that does nothing.
    expect(screen.queryByLabelText('Close', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('Save failed')).toBeTruthy();
    expect(onGo).not.toHaveBeenCalled();
  });

  it('a default OK-only sheet can be dismissed', async () => {
    const screen = await render(<Harness />);
    await fireEvent.press(screen.getByLabelText('Close', { includeHiddenElements: true }));
    expect(screen.queryByText('Save failed')).toBeNull();
  });
});
