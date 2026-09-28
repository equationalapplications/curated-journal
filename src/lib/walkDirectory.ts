export type MarkdownFile = { path: string; content: string };

export type WalkDeps = {
  listEntries: (dir: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;
  readText: (path: string) => Promise<string>;
};

function joinPosix(base: string, name: string): string {
  return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}

/** Files read at once. Sequential reads cost ~6s for 1000 notes on a device. */
export const READ_CONCURRENCY = 16;

/**
 * Map with at most `limit` promises in flight; results keep input order.
 *
 * On the first rejection the remaining workers stop picking up new items.
 * Note that Promise.all still rejects immediately: the caller's cleanup can
 * run while in-flight reads settle (their results/rejections are handled by
 * Promise.all and never surface as unhandled rejections).
 *
 * Note: subdirectory *walks* still run sequentially (each level awaits before
 * recursing), so bundles made of many small folders see less benefit. Fine
 * for the OKF layout, where `facts/` is flat.
 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function walkMarkdownFiles(
  rootDir: string,
  deps: WalkDeps,
  relativePrefix = '',
): Promise<MarkdownFile[]> {
  const entries = await deps.listEntries(rootDir);
  // One slot per entry, filled in entry order: a subdirectory's files, or a
  // pending read. Reads run concurrently; output order matches the old walk.
  const slots: (MarkdownFile[] | { abs: string; rel: string })[] = [];

  for (const entry of entries) {
    const abs = joinPosix(rootDir, entry.name);
    const rel = relativePrefix ? joinPosix(relativePrefix, entry.name) : entry.name;
    if (entry.isDirectory) {
      slots.push(await walkMarkdownFiles(abs, deps, rel));
      continue;
    }
    if (!entry.name.endsWith('.md')) continue;
    if (rel === 'index.md') continue;
    slots.push({ abs, rel });
  }

  const pending = slots.filter((s): s is { abs: string; rel: string } => !Array.isArray(s));
  const read = await mapLimit(pending, READ_CONCURRENCY, async ({ abs, rel }) => ({
    path: rel,
    content: await deps.readText(abs),
  }));
  let r = 0;
  return slots.flatMap((s) => (Array.isArray(s) ? s : [read[r++]]));
}
