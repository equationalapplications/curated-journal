import * as Iap from 'expo-iap';

import {
  normalizeTipErrorCode,
  openTipJar,
  resetTipJarModuleForTests,
  TipJarUnavailableError,
  toOffers,
  type TipEvent,
} from '@/lib/tipJarStore';

type Listener<T> = (payload: T) => void;
let onPurchase: Listener<unknown> | null = null;
let onError: Listener<unknown> | null = null;

jest.mock('expo-iap', () => ({
  initConnection: jest.fn(),
  endConnection: jest.fn(),
  fetchProducts: jest.fn(),
  getAvailablePurchases: jest.fn(),
  requestPurchase: jest.fn(),
  finishTransaction: jest.fn(),
  purchaseUpdatedListener: jest.fn((l: Listener<unknown>) => {
    onPurchase = l;
    return { remove: jest.fn() };
  }),
  purchaseErrorListener: jest.fn((l: Listener<unknown>) => {
    onError = l;
    return { remove: jest.fn() };
  }),
}));

const iap = Iap as unknown as Record<string, jest.Mock>;

const products = [
  // Deliberately out of order and with an unrelated SKU: the jar keeps our
  // order and only our products.
  { id: 'tip_coffee_999', displayPrice: '9,99 €' },
  { id: 'unrelated', displayPrice: '$1.00' },
  { id: 'tip_coffee_299', displayPrice: '2,99 €' },
  { id: 'tip_coffee_499', displayPrice: '4,99 €' },
];

const purchase = (over: Record<string, unknown> = {}) => ({
  id: 'txn-1',
  productId: 'tip_coffee_299',
  purchaseState: 'purchased',
  ...over,
});

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  resetTipJarModuleForTests();
  onPurchase = null;
  onError = null;
  iap.initConnection.mockResolvedValue(true);
  iap.endConnection.mockResolvedValue(true);
  iap.fetchProducts.mockResolvedValue(products);
  iap.getAvailablePurchases.mockResolvedValue([]);
  iap.requestPurchase.mockResolvedValue(null);
  iap.finishTransaction.mockResolvedValue(undefined);
});

describe('tip jar store bridge', () => {
  it('does not touch the store at import', () => {
    expect(iap.initConnection).not.toHaveBeenCalled();
    expect(iap.fetchProducts).not.toHaveBeenCalled();
    expect(iap.purchaseUpdatedListener).not.toHaveBeenCalled();
  });

  it('connects, then fetches only the three tips, with store prices in our order', async () => {
    const session = await openTipJar(jest.fn());
    expect(iap.initConnection).toHaveBeenCalledTimes(1);
    expect(iap.fetchProducts).toHaveBeenCalledWith({
      skus: ['tip_coffee_299', 'tip_coffee_499', 'tip_coffee_999'],
      type: 'in-app',
    });
    expect(iap.initConnection.mock.invocationCallOrder[0]).toBeLessThan(
      iap.fetchProducts.mock.invocationCallOrder[0],
    );
    expect(session.offers).toEqual([
      { id: 'tip_coffee_299', name: 'Coffee', displayPrice: '2,99 €' },
      { id: 'tip_coffee_499', name: 'Big coffee', displayPrice: '4,99 €' },
      { id: 'tip_coffee_999', name: 'Coffee for the team', displayPrice: '9,99 €' },
    ]);
  });

  it('requests the purchase for both stores', async () => {
    const session = await openTipJar(jest.fn());
    await session.requestTip('tip_coffee_499');
    expect(iap.requestPurchase).toHaveBeenCalledWith({
      request: { apple: { sku: 'tip_coffee_499' }, google: { skus: ['tip_coffee_499'] } },
      type: 'in-app',
    });
  });

  it('finishes a completed tip as a consumable, then thanks the user', async () => {
    const events: TipEvent[] = [];
    await openTipJar((e) => events.push(e));
    onPurchase?.(purchase());
    await flush();
    expect(iap.finishTransaction).toHaveBeenCalledWith({
      purchase: expect.objectContaining({ id: 'txn-1' }),
      isConsumable: true,
    });
    expect(events).toEqual([{ kind: 'thanks', productId: 'tip_coffee_299' }]);
  });

  it('finishes the same transaction only once', async () => {
    const events: TipEvent[] = [];
    await openTipJar((e) => events.push(e));
    onPurchase?.(purchase());
    onPurchase?.(purchase());
    await flush();
    expect(iap.finishTransaction).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });

  it('reports a pending tip without finishing it', async () => {
    const events: TipEvent[] = [];
    await openTipJar((e) => events.push(e));
    onPurchase?.(purchase({ purchaseState: 'pending' }));
    await flush();
    expect(iap.finishTransaction).not.toHaveBeenCalled();
    expect(events).toEqual([{ kind: 'pending', productId: 'tip_coffee_299' }]);
  });

  it('ignores purchases that are not tips', async () => {
    const events: TipEvent[] = [];
    await openTipJar((e) => events.push(e));
    onPurchase?.(purchase({ productId: 'something_else' }));
    await flush();
    expect(iap.finishTransaction).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('finishes a leftover completed tip when the jar opens', async () => {
    iap.getAvailablePurchases.mockResolvedValue([purchase({ id: 'old' })]);
    const events: TipEvent[] = [];
    await openTipJar((e) => events.push(e));
    expect(iap.finishTransaction).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ kind: 'thanks', productId: 'tip_coffee_299' }]);
  });

  it('reports a failed finish so the store can replay it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    iap.finishTransaction.mockRejectedValue(new Error('boom'));
    const events: TipEvent[] = [];
    await openTipJar((e) => events.push(e));
    onPurchase?.(purchase());
    await flush();
    expect(events).toEqual([{ kind: 'error', reason: 'not-finished' }]);
    warn.mockRestore();
  });

  it.each([
    ['user-cancelled', { kind: 'cancelled' }],
    ['E_USER_CANCELLED', { kind: 'cancelled' }],
    ['deferred-payment', { kind: 'pending' }],
    ['billing-unavailable', { kind: 'error', reason: 'unavailable' }],
    ['network-error', { kind: 'error', reason: 'network' }],
    ['unknown', { kind: 'error', reason: 'failed' }],
  ])('maps store error %s', async (code, expected) => {
    const events: TipEvent[] = [];
    await openTipJar((e) => events.push(e));
    onError?.({ code });
    expect(events).toEqual([expected]);
  });

  it('routes a thrown requestPurchase error the same way', async () => {
    iap.requestPurchase.mockRejectedValue({ code: 'user-cancelled' });
    const events: TipEvent[] = [];
    const session = await openTipJar((e) => events.push(e));
    await session.requestTip('tip_coffee_299');
    expect(events).toEqual([{ kind: 'cancelled' }]);
  });

  it('turns a failed connection into TipJarUnavailableError and cleans up', async () => {
    iap.initConnection.mockRejectedValue(new Error('no billing'));
    await expect(openTipJar(jest.fn())).rejects.toBeInstanceOf(TipJarUnavailableError);
    expect(iap.fetchProducts).not.toHaveBeenCalled();
    expect(iap.endConnection).not.toHaveBeenCalled();
  });

  it('ends the connection on close', async () => {
    const session = await openTipJar(jest.fn());
    await session.close();
    expect(iap.endConnection).toHaveBeenCalledTimes(1);
  });
});

describe('missing native module', () => {
  it('reports the tip jar unavailable instead of crashing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.resetModules();
    jest.doMock('expo-iap', () => {
      throw new Error("Cannot find native module 'ExpoIap'");
    });
    const store = require('@/lib/tipJarStore') as typeof import('@/lib/tipJarStore');
    await expect(store.openTipJar(jest.fn())).rejects.toBeInstanceOf(store.TipJarUnavailableError);
    jest.dontMock('expo-iap');
    warn.mockRestore();
  });
});

describe('helpers', () => {
  it('drops tips the store did not return', () => {
    expect(toOffers([{ id: 'tip_coffee_499', displayPrice: '$4.99' }])).toEqual([
      { id: 'tip_coffee_499', name: 'Big coffee', displayPrice: '$4.99' },
    ]);
  });

  it('normalizes native error spellings', () => {
    expect(normalizeTipErrorCode({ code: 'E_USER_CANCELED' })).toBe('user-cancelled');
    expect(normalizeTipErrorCode({ code: 'UserCancelled' })).toBe('user-cancelled');
    expect(normalizeTipErrorCode({ code: 'network-error' })).toBe('network-error');
    expect(normalizeTipErrorCode(null)).toBe('');
  });
});
