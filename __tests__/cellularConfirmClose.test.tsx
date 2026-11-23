import { act, render } from '@testing-library/react-native';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
const mockState = { value: 'cellularConfirm' as string };
jest.mock('@/hooks/useModelHub', () => ({
  useModelHub: () => ({ send: jest.fn(), stateValue: mockState.value }),
}));

import { CellularConfirm } from '@/components/model-hub/cellular-confirm';

describe('CellularConfirm', () => {
  it('closes the sheet when the machine leaves cellularConfirm', async () => {
    mockState.value = 'cellularConfirm';
    const screen = await render(<CellularConfirm />);
    expect(screen.getAllByText(/large file/)).toHaveLength(1);
    mockState.value = 'downloading';
    await act(async () => {
      screen.rerender(<CellularConfirm />);
    });
    expect(screen.queryByText(/large file/)).toBeNull();
  });
});
