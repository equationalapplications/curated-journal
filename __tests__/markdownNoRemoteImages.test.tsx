import { Image, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { markdownStyles } from '@/components/ui/markdown-styles';
import { render } from '@testing-library/react-native';
import { NoteMarkdown } from '@/components/NoteMarkdown';
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
  expect(screen.queryByText('https://example.com/b.png', { exact: false })).not.toBeNull();
  expect(screen.queryByText('https://example.com/a.png', { exact: false })).toBeNull();
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

describe('image placeholder details', () => {
  const longUrl = `https://example.com/${'a'.repeat(120)}.png`;
  const md = [
    '![d](data:image/png;base64,QUJDREVGRw==)',
    `![long](${longUrl})`,
    '[![linked](https://example.com/linked-src.png)](https://example.com/target)',
    '![](https://example.com/noalt.png)',
  ].join('\n\n');

  it('shows only the media type for data: sources', async () => {
    const s = await render(<NoteMarkdown>{md}</NoteMarkdown>);
    expect(s.queryByText('(embedded image/png)', { exact: false })).not.toBeNull();
    expect(s.queryByText('QUJDREVGRw', { exact: false })).toBeNull();
    expect(s.queryByText('base64', { exact: false })).toBeNull();
  });
  it('truncates long sources to 80 chars with an ellipsis', async () => {
    const s = await render(<NoteMarkdown>{md}</NoteMarkdown>);
    expect(s.queryByText(`${longUrl.slice(0, 80)}…`, { exact: false })).not.toBeNull();
    expect(s.queryByText(longUrl, { exact: false })).toBeNull();
  });
  it('omits the src when the image is inside a link', async () => {
    const s = await render(<NoteMarkdown>{md}</NoteMarkdown>);
    expect(s.queryByText('linked-src.png', { exact: false })).toBeNull();
    expect(s.queryByText('[image not loaded: linked]', { exact: false })).not.toBeNull();
  });
  it('labels the placeholder for accessibility', async () => {
    const s = await render(<NoteMarkdown>{md}</NoteMarkdown>);
    expect(s.queryByLabelText('Image not loaded: d')).not.toBeNull();
    expect(s.queryByLabelText('Image not loaded')).not.toBeNull();
  });
  it('styles the placeholder muted and italic', async () => {
    const theme = Colors.light;
    const s = await render(
      <NoteMarkdown style={markdownStyles(theme)}>{'![alt](https://example.com/a.png)'}</NoteMarkdown>,
    );
    const flat = StyleSheet.flatten(s.getByTestId('markdown-image-placeholder').props.style);
    expect(flat.fontStyle).toBe('italic');
    expect(flat.color).toBe(theme.onSurfaceVar);
  });
});
