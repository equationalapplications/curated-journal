import type { initLlama as InitLlama } from 'llama.rn';

// llama.rn is native-only: importing it on web crashes at load time because
// react-native-web has no TurboModuleRegistry. On-device inference is out of
// scope for web (spec NG4), so fail at call time instead.
export const initLlama: typeof InitLlama = async () => {
  throw new Error('On-device models are not available on web.');
};
