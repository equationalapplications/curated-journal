import {
  createChatStore,
  type ChatMessage,
} from '@/services/chatMessages';

function makeDb() {
  const rows: ChatMessage[] = [];
  return {
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async (_sql: string, ...params: unknown[]) => {
      const [id, role, content, citationsJson, createdAt] = params as [
        string,
        string,
        string,
        string,
        number,
      ];
      rows.push({
        id,
        role: role as ChatMessage['role'],
        content,
        citations: JSON.parse(citationsJson),
        createdAt,
      });
      return { changes: 1 };
    }),
    getAllAsync: jest.fn(async () =>
      [...rows]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((row) => ({
          id: row.id,
          role: row.role,
          content: row.content,
          citations_json: JSON.stringify(row.citations),
          created_at: row.createdAt,
        })),
    ),
  };
}

describe('chatMessages', () => {
  it('inserts and lists messages in order', async () => {
    const store = createChatStore(makeDb() as never);
    await store.insert({
      role: 'user',
      content: 'Hello',
      citations: [],
    });
    await store.insert({
      role: 'assistant',
      content: 'Hi [cite:f1]',
      citations: ['f1'],
    });
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[1].citations).toEqual(['f1']);
  });
});
