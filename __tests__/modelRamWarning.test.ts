import { getCuratedModel } from '@/catalog/modelManifest';
import { GIB } from '@/lib/modelLoadParams';
import { modelRamWarning } from '@/lib/modelRamWarning';

jest.mock('expo-device', () => ({ totalMemory: null }));

const fast = getCuratedModel('fast-light');
const smarter = getCuratedModel('smarter-slower');
const low = (m: { displayName: string }) =>
  `${m.displayName} is larger than this device comfortably runs. It may be slow, and it may fail to load.`;

describe('modelRamWarning', () => {
  it.each([null, 0, NaN])('falls back to the catalog deviceWarning when RAM is %p', (ram) => {
    expect(modelRamWarning(fast, ram)).toBeNull();
    expect(modelRamWarning(smarter, ram)).toBe(smarter.deviceWarning);
  });

  it('warns when RAM is known and below the threshold', () => {
    expect(modelRamWarning(fast, 3 * GIB)).toBe(low(fast));
    expect(modelRamWarning(smarter, 6 * GIB)).toBe(low(smarter));
  });

  it('returns null when RAM is sufficient, including for Smarter & Slower', () => {
    expect(modelRamWarning(fast, 5 * GIB)).toBeNull();
    expect(modelRamWarning(smarter, 8 * GIB)).toBeNull();
  });
});
