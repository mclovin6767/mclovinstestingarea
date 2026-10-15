import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import reactHooks from 'eslint-plugin-react-hooks';

// ESLint 9 flat config. Next 16 removed `next lint`, so linting now runs through the
// ESLint CLI directly (`eslint .`). eslint-config-next@16 ships native flat-config arrays,
// so we spread them rather than going through FlatCompat.
const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-plugin-react-hooks enables the React Compiler static-analysis rules as errors. This
    // project doesn't use the React Compiler, and these flag idiomatic patterns (data-fetch effects,
    // manual memoization) rather than bugs. Keep them as advisory warnings so they stay visible
    // without blocking CI — the classic correctness rules (rules-of-hooks, exhaustive-deps) stay at
    // their default error. Register the plugin explicitly so linting doesn't depend on
    // eslint-config-next's internal registration, which shifted across plugin versions (v6 -> v7).
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/incompatible-library': 'warn'
    }
  }
];

export default eslintConfig;
