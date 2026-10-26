/**
 * Unit and component tests (Jest + React Native Testing Library). Native modules are
 * mocked once in test/setup.ts so tests never need a device.
 */
module.exports = {
  preset: "@react-native/jest-preset",
  setupFiles: ["<rootDir>/test/setup.ts"],
  setupFilesAfterEnv: ["<rootDir>/test/after-each.ts"],
  // lucide-react-native's "react-native" entry is untranspiled ESM; its CommonJS build is equivalent.
  moduleNameMapper: { "^lucide-react-native$": "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js" },
  testMatch: ["<rootDir>/src/**/*.test.ts?(x)", "<rootDir>/test/**/*.test.ts?(x)"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@react-native-documents|@react-native-firebase|lucide-react-native|react-native-.*)/)",
  ],
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/api/vendor/**"],
};
