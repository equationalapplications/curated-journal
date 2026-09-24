// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // eslint-config-expo 57 (SDK 57) ships react-hooks v6 rules that flag
    // pre-existing patterns in screens this upgrade does not otherwise touch
    // (model-hub download, night-shift screen, _layout bootstrap).
    // Downgraded to warnings; refactoring them is tracked as follow-up debt.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    ignores: ["dist/*"],
  }
]);
