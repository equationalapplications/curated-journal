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

const HERMES_SYNTAX = {
  selector:
    'CallExpression[callee.property.name=/^(toSorted|toReversed|toSpliced|with|findLast|findLastIndex)$/]',
  message:
    "This ES2023 Array method is not implemented by Hermes (React Native on Android) and will crash on device, even though Jest on Node passes. Use the ES2019 equivalent — e.g. [...xs].sort() instead of xs.toSorted().",
};
const EVENT_LOG_MSG =
  "INTENT: the event log is never pruned — the engine's prune hard-deletes forgotten events; the app must never forget/erase (rename non-engine members named forget/erase).";
const RUN_PRUNE_MSG =
  "INTENT: call the engine's runPrune only with { retainEventsFor: null } literally in the call (the engine default deletes events older than 30 days); use the app's pruneKeepingEvents wrapper elsewhere. Aliased destructuring of runPrune is banned.";
// A runPrune call is allowed only as a direct call whose second argument is an
// object literal with a top-level retainEventsFor: null not followed by a spread.
// (esquery 1.7: only one-level :has(> ...) works.)
const PRUNE_CALL = ":matches(CallExpression[callee.property.name='runPrune'], CallExpression[callee.name='runPrune'], CallExpression[callee.property.value='runPrune'])";
// `m.runPrune!(...)` and `retainEventsFor: null as null` are deliberately flagged
// (fail closed) -- don't loosen the rule to allow them.
const RUN_PRUNE_SYNTAX = [
  { selector: PRUNE_CALL + ":not([arguments.1.type='ObjectExpression'])", message: RUN_PRUNE_MSG },
  { selector: PRUNE_CALL + " > ObjectExpression.arguments:not(:has(> Property[computed=false][key.name='retainEventsFor'][value.raw='null']))", message: RUN_PRUNE_MSG },
  { selector: PRUNE_CALL + " > ObjectExpression.arguments > Property[computed=false][key.name='retainEventsFor'] ~ SpreadElement", message: RUN_PRUNE_MSG },
  { selector: "ObjectPattern > Property[key.name='runPrune'][shorthand=false]", message: RUN_PRUNE_MSG },
  { selector: "MemberExpression[property.name='runPrune']:not(.callee)", message: RUN_PRUNE_MSG },
  { selector: "MemberExpression[property.value='runPrune']:not(.callee)", message: RUN_PRUNE_MSG },
  { selector: "ObjectPattern > Property[key.value='runPrune']", message: RUN_PRUNE_MSG },
  { selector: "Identifier[name='runPrune']:not(CallExpression > .callee, MemberExpression > .property, Property > .key, Property[shorthand=true] > .value, TSPropertySignature > .key, TSMethodSignature > .key, MethodDefinition > .key, PropertyDefinition > .key, TSQualifiedName > .right)", message: RUN_PRUNE_MSG },
];
const ENGINE_PKGS = [
  '@equationalapplications/expo-llm-wiki',
  '@equationalapplications/react-llm-wiki',
  '@equationalapplications/core-llm-wiki',
];
const ENGINE_PATHS = ENGINE_PKGS.map((name) => ({
  name,
  importNames: ['useWikiForget', 'EraseReport', 'EraseStepError', 'ForgetParams', 'ForgetResult'],
  message: EVENT_LOG_MSG,
}));
const MD_MSG = 'Use NoteMarkdown (src/components/NoteMarkdown.tsx) so markdownRules always applies.';
const MD_PATHS = [{ name: 'react-native-markdown-display', allowTypeImports: true, message: MD_MSG }];
const MD_PATTERNS = [{ group: ['react-native-markdown-display/*'], allowTypeImports: true, message: MD_MSG }];
// Dynamic import / require of the markdown library bypass no-restricted-imports;
// NoteMarkdown is the only sanctioned entry.
const MD_SYNTAX = [
  { selector: 'ImportExpression[source.value=/^react-native-markdown-display/]', message: MD_MSG },
  { selector: "CallExpression[callee.name='require'][arguments.0.value=/^react-native-markdown-display/]", message: MD_MSG },
];
const ENGINE_RE = '^@equationalapplications\\/(expo|react|core)-llm-wiki';
const SRC_SYNTAX = [
  HERMES_SYNTAX,
  { selector: 'ObjectPattern > Property[key.name=/^(forget|erase)$/]', message: EVENT_LOG_MSG },
  ...MD_SYNTAX,
  // Dynamic import()/require() of the engine bypasses the import ban on useWikiForget.
  { selector: `ImportExpression[source.value=/${ENGINE_RE}/]`, message: EVENT_LOG_MSG },
  { selector: `CallExpression[callee.name='require'][arguments.0.value=/${ENGINE_RE}/]`, message: EVENT_LOG_MSG },
  { selector: "Identifier[name='useWikiForget']", message: EVENT_LOG_MSG },
  { selector: "Identifier[name='forgotten_at']", message: EVENT_LOG_MSG },
  { selector: 'Literal[value=/forgotten_at/]', message: EVENT_LOG_MSG },
  { selector: 'TemplateElement[value.raw=/forgotten_at/]', message: EVENT_LOG_MSG },
];

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
      'no-restricted-syntax': ['error', HERMES_SYNTAX, ...MD_SYNTAX],
    },
  },
  {
    // Event-log rule (INTENT): the app never forgets/erases. Scoped to src/**;
    // no-restricted-syntax is restated with the Hermes entry because a later
    // flat-config entry for the same rule replaces the earlier one.
    files: ['src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [...MD_PATHS, ...ENGINE_PATHS], patterns: MD_PATTERNS },
      ],
      'no-restricted-properties': [
        'error',
        { property: 'forget', message: EVENT_LOG_MSG },
        { property: 'erase', message: EVENT_LOG_MSG },
      ],
      'no-restricted-syntax': ['error', ...SRC_SYNTAX, ...RUN_PRUNE_SYNTAX],
    },
  },
  {
    // Notes must render through NoteMarkdown, which forces markdownRules (no
    // remote image fetch, INTENT rule 9). Importing the library directly
    // would silently bring back the default image rule. The src/** block above
    // restates this option set (flat config replaces a rule's options) with
    // the engine bans added.
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    rules: {
      'no-restricted-imports': ['error', { paths: MD_PATHS, patterns: MD_PATTERNS }],
    },
  },
  {
    ignores: ["dist/*"],
  }
]);
