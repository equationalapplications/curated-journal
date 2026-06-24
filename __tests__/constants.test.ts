import {
  CHAT_TRAVERSAL_NODE_CAP,
  GRAPH_NODE_CAP,
  SPLIT_PANE_MIN_WIDTH,
  WIKI_CONFIG,
} from '@/lib/constants';

describe('constants', () => {
  it('disables auto maintenance', () => {
    expect(WIKI_CONFIG.autoLibrarianThreshold).toBe(Infinity);
    expect(WIKI_CONFIG.autoHealThreshold).toBe(Infinity);
  });

  it('enforces chat traversal cap per spec', () => {
    expect(CHAT_TRAVERSAL_NODE_CAP).toBe(12);
  });

  it('enforces graph node cap', () => {
    expect(GRAPH_NODE_CAP).toBe(200);
  });

  it('split pane breakpoint', () => {
    expect(SPLIT_PANE_MIN_WIDTH).toBe(768);
  });
});
