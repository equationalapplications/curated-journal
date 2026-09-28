import { fireEvent, render } from '@testing-library/react-native';
import { buildGraphFromDump, GRAPH_LABEL_MAX, shortLabel } from '@/lib/graphData';
import { GraphNodeSheet } from '@/components/graph/GraphNodeSheet';

jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native');
  return ({ children }: { children: string }) => <Text>{children}</Text>;
});

describe('shortLabel', () => {
  it('keeps short titles whole', () => {
    expect(shortLabel('Morning pages')).toBe('Morning pages');
  });

  it('cuts long titles at a word boundary and ellipsizes', () => {
    const label = shortLabel('Reading on design systems and quiet software');
    expect(label).toBe('Reading on design…');
    expect(label.length).toBeLessThanOrEqual(GRAPH_LABEL_MAX);
  });

  it('hard-cuts a single long word', () => {
    const label = shortLabel('Supercalifragilisticexpialidocious');
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBe(GRAPH_LABEL_MAX);
  });

  it('collapses whitespace and falls back for blank titles', () => {
    expect(shortLabel('  Gym\n routine  ')).toBe('Gym routine');
    expect(shortLabel('   ')).toBe('Untitled');
  });
});

describe('buildGraphFromDump', () => {
  it('carries the note body for the expanded view', () => {
    const dump = {
      entities: {
        e1: {
          facts: [{ id: 'f1', title: 'Morning pages', body: '# Morning pages\n\nThree pages.' }],
          edges: [],
        },
      },
    } as unknown as Parameters<typeof buildGraphFromDump>[0];
    const graph = buildGraphFromDump(dump, 'e1');
    expect(graph.nodes[0]).toMatchObject({ id: 'f1', title: 'Morning pages', body: '# Morning pages\n\nThree pages.' });
  });
});

describe('GraphNodeSheet', () => {
  const node = {
    id: 'f1',
    title: 'Reading on design systems and quiet software',
    body: 'Chrome recedes so the notes read first.',
    okfType: 'concept',
    confidence: 'inferred',
  };

  it('shows the full title, chips and body', async () => {
    const screen = await render(
      <GraphNodeSheet node={node} onClose={jest.fn()} onOpenNote={jest.fn()} />,
    );
    expect(screen.getByText(node.title)).toBeTruthy();
    expect(screen.getByText('concept')).toBeTruthy();
    expect(screen.getByText('inferred')).toBeTruthy();
    expect(screen.getByText(node.body)).toBeTruthy();
  });

  it('opens the note', async () => {
    const onOpenNote = jest.fn();
    const screen = await render(
      <GraphNodeSheet node={node} onClose={jest.fn()} onOpenNote={onOpenNote} />,
    );
    await fireEvent.press(screen.getByText('Open note'));
    expect(onOpenNote).toHaveBeenCalledWith('f1');
  });

  it('says so when a note has no text', async () => {
    const screen = await render(
      <GraphNodeSheet node={{ ...node, body: '  ' }} onClose={jest.fn()} onOpenNote={jest.fn()} />,
    );
    expect(screen.getByText('This note has no text yet.')).toBeTruthy();
  });
});

describe('structure-keyed layout', () => {
  // Deferred import keeps this block independent of the mocks above.
  const { graphStructureKey } = require('@/lib/graphLayout');
  const nodes = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const edges = [{ sourceId: 'a', targetId: 'b' }];

  it('ignores titles and bodies, so a reload with the same structure keeps the key', () => {
    const renamed = nodes.map((n) => ({ ...n, title: `${n.title} (edited)`, body: 'new' }));
    expect(graphStructureKey(renamed, edges)).toBe(graphStructureKey(nodes, edges));
  });

  it('changes when a node or edge is added', () => {
    const base = graphStructureKey(nodes, edges);
    expect(graphStructureKey([...nodes, { id: 'c' }], edges)).not.toBe(base);
    expect(graphStructureKey(nodes, [...edges, { sourceId: 'b', targetId: 'a' }])).not.toBe(base);
  });

  it('round-trips ids with separator-like characters', () => {
    const odd = [{ id: 'a|b' }, { id: 'c>"d' }];
    expect(JSON.parse(graphStructureKey(odd, [])).ids).toEqual(['a|b', 'c>"d']);
  });
});
