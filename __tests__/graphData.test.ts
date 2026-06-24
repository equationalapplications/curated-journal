import { capGraphNodes } from '@/lib/graphData';

describe('capGraphNodes', () => {
  it('keeps top 200 by confidence then updated_at', () => {
    const nodes = Array.from({ length: 250 }, (_, i) => ({
      id: `n${i}`,
      confidence: i % 3 === 0 ? 'certain' : 'tentative',
      updatedAt: i,
    }));
    const capped = capGraphNodes(nodes, 200);
    expect(capped.nodes).toHaveLength(200);
    expect(capped.truncated).toBe(true);
    expect(capped.nodes[0].confidence).toBe('certain');
  });
});
