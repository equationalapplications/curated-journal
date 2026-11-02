import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

// React 19 requires this flag for act() to be honored (see updateCheckRow.test).
(global as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  STRICT_PRIVACY_TIP_TITLE,
  TipJarSection,
} from '@/components/settings/TipJarSection';
import { canOpenSupportLink, canUseStorePurchases } from '@/lib/privacyMode';
import { getSupportLinkUrl } from '@/lib/supportLink';
import { isTipJarSupported, openTipJar, type TipEvent } from '@/lib/tipJarStore';

jest.mock('expo-iap', () => ({}));

jest.mock('@/lib/privacyMode', () => ({
  canUseStorePurchases: jest.fn(),
  canOpenSupportLink: jest.fn(),
  getPrivacyMode: jest.fn(),
}));

jest.mock('@/lib/supportLink', () => ({ getSupportLinkUrl: jest.fn() }));

jest.mock('@/lib/tipJarStore', () => {
  const actual = jest.requireActual('@/lib/tipJarTypes');
  return { ...actual, isTipJarSupported: jest.fn(), openTipJar: jest.fn() };
});

const mockCanBuy = canUseStorePurchases as jest.Mock;
const mockCanLink = canOpenSupportLink as jest.Mock;
const mockLink = getSupportLinkUrl as jest.Mock;
const mockSupported = isTipJarSupported as jest.Mock;
const mockOpen = openTipJar as jest.Mock;

const offers = [
  { id: 'tip_coffee_299', name: 'Coffee', displayPrice: '$2.99' },
  { id: 'tip_coffee_499', name: 'Big coffee', displayPrice: '$4.99' },
  { id: 'tip_coffee_999', name: 'Coffee for the team', displayPrice: '$9.99' },
];

let emit: (e: TipEvent) => void = () => {};
let requestTip: jest.Mock;
let close: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCanBuy.mockReturnValue(true);
  mockCanLink.mockReturnValue(true);
  mockSupported.mockReturnValue(true);
  mockLink.mockReturnValue(null);
  requestTip = jest.fn().mockResolvedValue(undefined);
  close = jest.fn().mockResolvedValue(undefined);
  mockOpen.mockImplementation(async (onEvent: (e: TipEvent) => void) => {
    emit = onEvent;
    return { offers, requestTip, close };
  });
});

async function openJar() {
  await render(<TipJarSection />);
  await fireEvent.press(screen.getByTestId('tip-jar-open'));
  await waitFor(() => expect(screen.getByTestId('tip-tip_coffee_299')).toBeTruthy());
}

describe('TipJarSection (native)', () => {
  it('does not contact the store until the user opens the tip jar', async () => {
    await render(<TipJarSection />);
    expect(screen.getByText('Support Curated Journal')).toBeTruthy();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockCanBuy).not.toHaveBeenCalled();
  });

  it('shows the strict-privacy alert and sends nothing when purchases are off', async () => {
    mockCanBuy.mockReturnValue(false);
    await render(<TipJarSection />);
    await fireEvent.press(screen.getByTestId('tip-jar-open'));
    await waitFor(() => expect(screen.getByText(STRICT_PRIVACY_TIP_TITLE)).toBeTruthy());
    expect(screen.getByText(/step out of strict privacy/)).toBeTruthy();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('opens the jar with the store’s prices when purchases are allowed', async () => {
    await openJar();
    expect(mockCanBuy).toHaveBeenCalled();
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByText('Big coffee')).toBeTruthy();
    expect(screen.getByText('Coffee for the team')).toBeTruthy();
    expect(screen.getByText('$4.99')).toBeTruthy();
  });

  it('re-checks the mode on each tip tap', async () => {
    await openJar();
    mockCanBuy.mockReturnValue(false);
    await fireEvent.press(screen.getByTestId('tip-tip_coffee_499'));
    await waitFor(() => expect(screen.getByText(STRICT_PRIVACY_TIP_TITLE)).toBeTruthy());
    expect(requestTip).not.toHaveBeenCalled();
  });

  it('buys a tip and thanks the user', async () => {
    await openJar();
    await fireEvent.press(screen.getByTestId('tip-tip_coffee_499'));
    await waitFor(() => expect(requestTip).toHaveBeenCalledWith('tip_coffee_499'));
    await act(async () => emit({ kind: 'thanks', productId: 'tip_coffee_499' }));
    await waitFor(() => expect(screen.getByText('Thank you!')).toBeTruthy());
  });

  it('stays silent when the user cancels', async () => {
    await openJar();
    await fireEvent.press(screen.getByTestId('tip-tip_coffee_299'));
    await act(async () => emit({ kind: 'cancelled' }));
    expect(screen.queryByTestId('tip-jar-status')).toBeNull();
    expect(screen.queryByText('Thank you!')).toBeNull();
    expect(screen.getByTestId('tip-tip_coffee_299')).toBeEnabled();
  });

  it('explains a pending tip', async () => {
    await openJar();
    await fireEvent.press(screen.getByTestId('tip-tip_coffee_299'));
    await act(async () => emit({ kind: 'pending', productId: 'tip_coffee_299' }));
    expect(screen.getByTestId('tip-jar-status')).toHaveTextContent(/pending/);
  });

  it('shows fixed copy for store errors', async () => {
    await openJar();
    await fireEvent.press(screen.getByTestId('tip-tip_coffee_299'));
    await act(async () => emit({ kind: 'error', reason: 'network' }));
    expect(screen.getByTestId('tip-jar-status')).toHaveTextContent(/Couldn’t reach the store/);
  });

  it('reports the store unavailable when it cannot connect', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockOpen.mockRejectedValue(new Error('billing unavailable'));
    await render(<TipJarSection />);
    await fireEvent.press(screen.getByTestId('tip-jar-open'));
    await waitFor(() =>
      expect(screen.getByTestId('tip-jar-status')).toHaveTextContent(/aren’t available/),
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    warn.mockRestore();
  });

  it('reports the store unavailable when it has no tips', async () => {
    mockOpen.mockResolvedValue({ offers: [], requestTip, close });
    await render(<TipJarSection />);
    await fireEvent.press(screen.getByTestId('tip-jar-open'));
    await waitFor(() =>
      expect(screen.getByTestId('tip-jar-status')).toHaveTextContent(/aren’t available/),
    );
  });

  it('closes the store connection on unmount', async () => {
    await openJar();
    await screen.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('TipJarSection (no in-app purchases: web, or a binary without the module)', () => {
  beforeEach(() => mockSupported.mockReturnValue(false));

  it('renders nothing while no support link is configured', async () => {
    await render(<TipJarSection />);
    expect(screen.queryByText('Support Curated Journal')).toBeNull();
    expect(screen.queryByTestId('tip-jar-open')).toBeNull();
  });

  it('opens the support link when allowed', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockLink.mockReturnValue('https://www.paypal.com/example');
    await render(<TipJarSection />);
    expect(screen.queryByTestId('tip-jar-open')).toBeNull();
    await fireEvent.press(screen.getByTestId('support-link-button'));
    expect(openURL).toHaveBeenCalledWith('https://www.paypal.com/example');
    openURL.mockRestore();
  });

  it('shows the strict-privacy alert instead of opening the link', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockLink.mockReturnValue('https://www.paypal.com/example');
    mockCanLink.mockReturnValue(false);
    await render(<TipJarSection />);
    await fireEvent.press(screen.getByTestId('support-link-button'));
    await waitFor(() => expect(screen.getByText(STRICT_PRIVACY_TIP_TITLE)).toBeTruthy());
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });
});
