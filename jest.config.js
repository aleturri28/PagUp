module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.worktrees/'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|lucide-react-native|@react-native-ml-kit|@react-native-voice|react-native-reanimated|react-native-gesture-handler|react-native-qrcode-svg)/)'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx,js}'],
};
