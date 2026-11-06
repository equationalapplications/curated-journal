// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// ESLint 10 shim (PR #82, 2026-11-06): plugins pinned transitively by
// eslint-config-expo 58.0.4 (its newest release) crash under ESLint 10 —
// eslint-plugin-react@7.37.5 ("contextOrFilename.getFilename is not a
// function"; context.getFilename was removed in ESLint 10) and
// eslint-plugin-import@2.32.0 (resolver interface breaks). Neither has an
// upstream release supporting ESLint 10 (peer ranges cap at ^9). Until
// eslint-config-expo ships ESLint 10-compatible plugin deps, drop those
// two plugins and their rules; eslint-plugin-react-hooks (v7) and
// typescript-eslint keep enforcing their rules.
// Remove this shim when eslint-config-expo gains ESLint 10 support.
const STRIP_PLUGINS = ['react', 'import', 'import-x'];
function stripEslint10IncompatiblePlugins(configs) {
  return configs.map((cfg) => {
    if (typeof cfg !== 'object' || cfg === null) return cfg;
    let next = cfg;
    if (next.plugins && STRIP_PLUGINS.some((p) => next.plugins[p])) {
      const keptPlugins = Object.fromEntries(
        Object.entries(next.plugins).filter(([name]) => !STRIP_PLUGINS.includes(name))
      );
      next = { ...next };
      delete next.plugins;
      if (Object.keys(keptPlugins).length) next.plugins = keptPlugins;
    }
    if (next.rules) {
      const keptRules = Object.fromEntries(
        Object.entries(next.rules).filter(
          ([rule]) => !STRIP_PLUGINS.some((p) => rule === p || rule.startsWith(`${p}/`))
        )
      );
      if (keptRules.length !== Object.keys(next.rules).length) {
        next = { ...next };
        delete next.rules;
        if (Object.keys(keptRules).length) next.rules = keptRules;
      }
    }
    return next;
  });
}

module.exports = defineConfig([
  ...stripEslint10IncompatiblePlugins(Array.isArray(expoConfig) ? expoConfig : [expoConfig]),
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
