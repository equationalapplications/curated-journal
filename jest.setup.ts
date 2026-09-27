jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Native module — jest has no native build, so mock globally (any suite that
// renders the app tree pulls in KeyboardProvider from _layout.tsx).
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: ({ children }: { children: React.ReactNode }) => children,
  KeyboardAwareScrollView: require('react-native').ScrollView,
}));
