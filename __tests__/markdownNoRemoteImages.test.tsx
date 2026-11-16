import { Image } from 'react-native';
import { render } from '@testing-library/react-native';
import { JournalPane } from '@/components/journal/JournalPane';
import { GraphNodeSheet } from '@/components/graph/GraphNodeSheet';
import EntryScreen from '@/app/entry/[factId]';

const NOTE = 'Hello\n\n![alt text](https://example.com/x.png)\n\n![p](//example.com/y.png)\n\n[![x](https://example.com/a.png)](https://example.com)\n\n![y][r]\n\n[r]: https://example.com/b.png';

jest.mock('@/contexts/JournalContext', () => ({
  useJournal: () => ({ selectedFactId: 'f1', entityId: 'e1' }),
}));
jest.mock('@/contexts/CitationNavigationContext', () => ({
  useCitationNavigation: () => ({ target: null, clearTarget: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ factId: 'f1' }),
  useFocusEffect: jest.fn(),
}));
jest.mock('@/hooks/useJournalMemoryRead', () => ({
  useJournalMemoryRead: () => ({
    data: { facts: [{ id: 'f1', title: 'T', body: NOTE }] },
    refetch: jest.fn(),
  }),
}));

type Json = { type: string; props?: Record<string, unknown>; children?: unknown[] | null };

function collectImages(node: unknown, out: Json[] = []): Json[] {
  if (node && typeof node === 'object') {
    const n = node as Json;
    if (n.type === 'Image' || (n.props && 'source' in n.props)) out.push(n);
    (n.children ?? []).forEach((c) => collectImages(c, out));
  }
  return out;
}

function expectNoRemoteImage(screen: ReturnType<typeof render>, getSize: jest.SpyInstance, prefetch: jest.SpyInstance) {
  const tree = screen.toJSON();
  const imgs = ([] as Json[]).concat(...[tree].flat().map((t) => collectImages(t)));
  expect(imgs).toHaveLength(0);
  expect(screen.getAllByTestId('markdown-image-placeholder').length).toBeGreaterThanOrEqual(4);
  expect(screen.queryByText(/https:\/\/example\.com\/b\.png/)).not.toBeNull();
  expect(screen.queryByText(/https:\/\/example\.com\/a\.png/)).not.toBeNull();
  expect(getSize).not.toHaveBeenCalled();
  expect(prefetch).not.toHaveBeenCalled();
}

describe('notes never load remote images (#118)', () => {
  let getSize: jest.SpyInstance;
  let prefetch: jest.SpyInstance;
  beforeEach(() => {
    getSize = jest.spyOn(Image, 'getSize').mockImplementation(() => undefined as never);
    prefetch = jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('JournalPane', async () => {
    expectNoRemoteImage(await render(<JournalPane facts={[{ id: 'f1', title: 'T', body: NOTE } as never]} />), getSize, prefetch);
  });
  it('entry screen', async () => {
    expectNoRemoteImage(await render(<EntryScreen />), getSize, prefetch);
  });
  it('GraphNodeSheet', async () => {
    expectNoRemoteImage(
      await render(<GraphNodeSheet node={{ id: 'f1', title: 'T', body: NOTE }} onClose={jest.fn()} onOpenNote={jest.fn()} />),
      getSize,
      prefetch,
    );
  });
});
