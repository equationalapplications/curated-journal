import { fireEvent, render } from '@testing-library/react-native';
import { buildGraphFromDump, GRAPH_LABEL_MAX, shortLabel } from '@/lib/graphData';
import { fitToCanvas, GRAPH_EDGE_PAD, runGraphSimulation } from '@/lib/graphSimulation';
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

describe('graph layout', () => {
  it('fits every node inside the padded canvas', () => {
    const size = 360;
    const nodes = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}` }));
    const links = nodes.slice(1).map((n, i) => ({ source: `n${i}`, target: n.id }));
    for (const n of runGraphSimulation(nodes, links, size)) {
      expect(n.x).toBeGreaterThanOrEqual(GRAPH_EDGE_PAD.x - 0.001);
      expect(n.x).toBeLessThanOrEqual(size - GRAPH_EDGE_PAD.x + 0.001);
      expect(n.y).toBeGreaterThanOrEqual(GRAPH_EDGE_PAD.top - 0.001);
      expect(n.y).toBeLessThanOrEqual(size - GRAPH_EDGE_PAD.bottom + 0.001);
    }
  });

  it('never enlarges a small graph', () => {
    const nodes = [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 140, y: 100 },
    ];
    fitToCanvas(nodes, 360);
    expect(nodes[1].x - nodes[0].x).toBeCloseTo(40);
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
