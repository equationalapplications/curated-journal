import type * as SQLite from 'expo-sqlite';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  citations: string[];
  createdAt: number;
};

export type InsertChatMessage = Pick<ChatMessage, 'role' | 'content' | 'citations'>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

function newId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createChatStore(db: SQLite.SQLiteDatabase) {
  let ready: Promise<void> | null = null;

  function ensureSchema(): Promise<void> {
    if (!ready) ready = db.execAsync(SCHEMA).then(() => undefined);
    return ready;
  }

  return {
    async insert(input: InsertChatMessage): Promise<ChatMessage> {
      await ensureSchema();
      const message: ChatMessage = {
        id: newId(),
        role: input.role,
        content: input.content,
        citations: input.citations,
        createdAt: Date.now(),
      };
      await db.runAsync(
        `INSERT INTO chat_messages (id, role, content, citations_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        message.id,
        message.role,
        message.content,
        JSON.stringify(message.citations),
        message.createdAt,
      );
      return message;
    },

    async list(): Promise<ChatMessage[]> {
      await ensureSchema();
      const rows = await db.getAllAsync<{
        id: string;
        role: ChatRole;
        content: string;
        citations_json: string;
        created_at: number;
      }>(
        `SELECT id, role, content, citations_json, created_at
         FROM chat_messages ORDER BY created_at ASC`,
      );
      return rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        citations: JSON.parse(row.citations_json) as string[],
        createdAt: row.created_at,
      }));
    },
  };
}
