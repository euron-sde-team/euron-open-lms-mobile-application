module.exports = {
  root: true,
  extends: '@react-native',
  // Copied from euron-open-lms by scripts/sync-types.mjs; linted there.
  ignorePatterns: ['src/api/vendor/**', 'ios/**', 'android/**', 'coverage/**'],
};
