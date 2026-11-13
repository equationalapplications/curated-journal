const mockDeleted: string[] = [];
let mockThrow = false;
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    exists = true;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
    }
    delete() {
      if (mockThrow) throw new Error('boom');
      mockDeleted.push(this.uri);
    }
  }
  return { File, Paths: { document: { uri: 'file:///documents' } } };
});

import { MODEL_CATALOG } from '@/catalog/modelManifest';
import { deleteOrphanedCuratedModelFiles } from '@/services/modelFiles';

const uriOf = (id: string) => `file:///documents/${MODEL_CATALOG.find((m) => m.id === id)!.filename}`;

describe('deleteOrphanedCuratedModelFiles', () => {
  beforeEach(() => {
    mockDeleted.length = 0;
    mockThrow = false;
  });

  it('deletes only the catalog files that are not the kept model', () => {
    deleteOrphanedCuratedModelFiles({ keepModelId: 'fast-light', currentModelPath: null });
    expect(mockDeleted).toEqual([uriOf('smarter-slower')]);
  });

  it('keeps a file whose uri is the current model path', () => {
    deleteOrphanedCuratedModelFiles({ keepModelId: 'fast-light', currentModelPath: uriOf('smarter-slower') });
    expect(mockDeleted).toEqual([]);
  });

  it('never propagates a delete failure', () => {
    mockThrow = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      deleteOrphanedCuratedModelFiles({ keepModelId: null, currentModelPath: null }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
