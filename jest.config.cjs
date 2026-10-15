/**
 * Unit + component render tests — run with `npm run test:unit`.
 *   - *.unit.test.ts    pure (non-React) logic
 *   - *.render.test.tsx React component render tests (Testing Library, jsdom)
 * Browser/UI behaviour is covered separately by Playwright in ./e2e (*.spec.ts), so this runner
 * only matches the two suffixes above to keep the suites from overlapping.
 */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.unit.test.ts', '**/*.render.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          module: 'commonjs',
          esModuleInterop: true,
          isolatedModules: true,
          skipLibCheck: true
        }
      }
    ]
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' }
};
