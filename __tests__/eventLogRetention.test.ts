// INTENT: the event log is never pruned. See eslint.config.js (forget/erase
// bans) and src/hooks/useJournalWiki.tsx.
import { createElement } from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { formatOkfBundle, parseOkfBundle } from '@equationalapplications/core-llm-wiki';

const mockRunPrune = jest.fn();
const mockCapture: { input?: any } = {};
jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  useWikiMaintenance: () => ({ runLibrarian: jest.fn(), runHeal: jest.fn(), runPrune: mockRunPrune }),
}));
jest.mock('xstate', () => ({
  createActor: (_m: unknown, opts: { input: unknown }) => {
    mockCapture.input = opts.input;
    return { start: () => ({ stop: jest.fn(), send: jest.fn() }) };
  },
}));
jest.mock('@xstate/react', () => ({ useSelector: () => null }));
jest.mock('@/machines/journalWikiMachine', () => ({ journalWikiMachine: {} }));

import { JournalWikiProvider } from '@/hooks/useJournalWiki';

describe('event-log retention', () => {
  it('runPrune wrapper passes retainEventsFor: null', async () => {
    render(createElement(JournalWikiProvider, { wiki: {} as never, entityId: 'e', children: null }));
    await waitFor(() => expect(mockCapture.input).toBeDefined());
    await mockCapture.input.maintenance.runPrune('e');
    expect(mockRunPrune).toHaveBeenCalledWith('e', { retainEventsFor: null });
  });

  it('parseOkfBundle never yields forgotten_at on events (export round-trip)', () => {
    const dump = {
      generatedAt: 1,
      entities: {
        e: {
          facts: [],
          tasks: [],
          edges: [],
          events: [
            { id: 'a', entity_id: 'e', event_type: 'observation', summary: 'one', created_at: 1 },
            { id: 'b', entity_id: 'e', event_type: 'action', summary: 'two', created_at: 2, forgotten_at: 5 },
          ],
        },
      },
    };
    const { files } = formatOkfBundle(dump as never, { profile: 'llm-wiki/2' });
    expect(files.some((f) => f.path === 'entities/e/log.md')).toBe(true);
    const parsed = parseOkfBundle('seed', files, { defaultSchema: 'fact' });
    const events = Object.values(parsed.entities).flatMap((e: any) => e.events ?? []);
    expect(events.length).toBeGreaterThan(0);
    for (const ev of events) expect(ev).not.toHaveProperty('forgotten_at');
  });

  it('parseOkfBundle ignores hostile forgotten_at in log lines and fact frontmatter', () => {
    const files = [
      {
        path: 'entities/journal/log.md',
        content:
          '## 1970-01-01\n\n- (observation) hostile <!-- id: a; forgotten_at: 99 -->\n- (action) plain <!-- id: b -->\n',
      },
      {
        path: 'entities/journal/facts/note-001.md',
        content: '---\nid: note-001\nforgotten_at: 99\n---\n\nA fact body.\n',
      },
    ];
    const parsed = parseOkfBundle('seed', files, { defaultSchema: 'fact' });
    const events = Object.values(parsed.entities).flatMap((e: any) => e.events ?? []);
    expect(events.length).toBeGreaterThan(0);
    for (const ev of events) expect(ev).not.toHaveProperty('forgotten_at');
  });
});
