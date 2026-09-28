import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Button } from '@/components/ui/button';

// On Android, dropping borderStyle from a view's style leaves it dashed, so
// the enabled style must set 'solid' explicitly rather than omit it.
describe('Button border style', () => {
  const borderStyleOf = (screen: Awaited<ReturnType<typeof render>>) =>
    StyleSheet.flatten(screen.getByRole('button').props.style).borderStyle;

  it('is dashed when disabled and explicitly solid once enabled', async () => {
    const screen = await render(<Button label="Run" variant="primary" disabled />);
    expect(borderStyleOf(screen)).toBe('dashed');
    await screen.rerender(<Button label="Run" variant="primary" />);
    expect(borderStyleOf(screen)).toBe('solid');
  });
});
