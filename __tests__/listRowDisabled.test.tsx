import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ListRow } from '@/components/ui/card';

// ListRow calls useTheme.
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'light',
}));

describe('ListRow disabled', () => {
  it('ignores taps when disabled, not merely announces itself as disabled', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ListRow disabled onPress={onPress} accessibilityLabel="row">
        <Text>row</Text>
      </ListRow>,
    );
    const row = screen.getByLabelText('row');
    expect(row.props.accessibilityState?.disabled).toBe(true);
    // accessibilityState is announced to screen readers and nothing more. The
    // touch system only honors the `disabled` prop, so a row that sets the
    // state alone stays tappable.
    fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('fires onPress when enabled', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ListRow onPress={onPress} accessibilityLabel="row">
        <Text>row</Text>
      </ListRow>,
    );
    fireEvent.press(screen.getByLabelText('row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
