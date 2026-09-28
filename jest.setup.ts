jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Native module — jest has no native build, so mock globally (any suite that
// renders the app tree pulls in KeyboardProvider from _layout.tsx).
// Props are forwarded so prop-related assertions stay honest; the real
// keyboard behavior is device-verified (native module, untestable in jest).
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: (props: { children: React.ReactNode }) => props.children,
  KeyboardAwareScrollView: require('react-native').ScrollView,
}));

// Native module too — screens and sheets call useSafeAreaInsets/View, which
// throws without a provider. Zero insets, pass-through components.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children, ...rest }: { children: React.ReactNode }) =>
      React.createElement('View', rest, children),
    SafeAreaInsetsContext: React.createContext(inset),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 320, height: 640 }),
    initialWindowMetrics: { insets: inset, frame: { x: 0, y: 0, width: 320, height: 640 } },
  };
});

// Pay the one-time React Native module-init cost here, in setup, instead of
// inside a test. RNTL v14's render() is async, so the first render in a file
// loads and transforms RN's renderer plus the Modal dependency graph before
// the tree settles. Measured cold that is ~3s; warm it is ~1ms. Jest's default
// per-test timeout is 5s, so on a cold cache (first run after an install, or a
// clean CI worker) with parallel workers competing for CPU, the first render
// test in a file blows the budget and fails — reproducibly, not flakily.
// Rendering a throwaway Modal once per file here absorbs the cost outside any
// test's timeout window. This is what made graphLabels.test.tsx's
// "GraphNodeSheet > shows the full title, chips and body" fail; it drops from
// ~3.1s to ~25ms. Delete the warmup below and that test goes back to failing.
//
// It has to be an awaited beforeAll, not a bare call: render() and unmount()
// both return promises, so a fire-and-forget render lets the first test start
// while the warmup tree is still settling, and leaves a mounted Modal in the
// tree that test can see. Unmounting here keeps it out of every test.
//
// The hook needs its own timeout for the same reason a test did. Moving the
// cold cost out of a test only relocated the 5s budget: hooks get jest's 5s
// default too, and this hook legitimately spends it. Measured cold on a cleared
// cache, modelHubMachine.test.ts — a plain machine test that never renders the
// app — takes 6.2s of that budget here, and on a CI worker with other workers
// competing for CPU it crosses 5s, taking the whole file's tests with it (both
// suites that failed on CI were machine tests, not render tests). 30s leaves
// room for a contended worker without masking a genuinely hung render, which
// would have to wait on a promise that never settles.
//
// The require stays at module scope on purpose: RNTL registers its own
// beforeAll/afterEach/afterAll when it loads, and jest-circus rejects hooks
// added after the run has started. Only the render moves into the hook.
//
// A file that replaces react-native with a stub (llamaProvider.test.ts does,
// down to AppState and Platform) has no Modal to warm. Rendering one there
// fails on the undefined component type, and awaiting is what makes that
// failure visible — an unawaited render just swallowed it. Skip instead: the
// module-scope requires above still paid whatever that file can pay.
const { render: renderForTest } = require('@testing-library/react-native');
beforeAll(async () => {
  const React = require('react');
  const { Modal, Text } = require('react-native');
  if (!Modal || !Text) return;
  const warmup = await renderForTest(
    React.createElement(
      Modal,
      { visible: true, transparent: true, animationType: 'slide' },
      React.createElement(Text, null, 'warmup'),
    ),
  );
  await warmup.unmount();
}, 30_000);
