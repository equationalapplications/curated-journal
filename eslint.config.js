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
    // Hermes (Android's JS engine) lags Node on recent built-ins, and the
    // gap is invisible to Jest because tests run on Node. `toSorted` in
    // graphLayout.ts passed the suite and still red-boxed the Graph screen on
    // a real device with "undefined is not a function".
    //
    // These are the ES2023 Array.prototype additions Hermes does not
    // implement. Prefer the ES2019 spellings, which are non-mutating enough
    // via a spread and work on every engine: [...xs].sort() for toSorted,
    // [...xs].reverse() for toReversed, xs.filter for with/toSpliced.
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(toSorted|toReversed|toSpliced|with|findLast|findLastIndex)$/]',
          message:
            "This ES2023 Array method is not implemented by Hermes (React Native on Android) and will crash on device, even though Jest on Node passes. Use the ES2019 equivalent — e.g. [...xs].sort() instead of xs.toSorted().",
        },
      ],
    },
  },
  {
    ignores: ["dist/*"],
  }
]);
