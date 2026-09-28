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
