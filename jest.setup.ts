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
