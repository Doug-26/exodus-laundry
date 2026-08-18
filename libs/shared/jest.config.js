/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        // Restrict to jest types only; @types/jasmine is hoisted from the mobile
        // app and would otherwise shadow jest's .resolves/.rejects/.toHaveLength.
        types: ['jest', 'node'],
      },
    }],
  },
  moduleNameMapper: {
    '^firebase/firestore$': '<rootDir>/__mocks__/firebase-firestore.ts',
    '^firebase/database$': '<rootDir>/__mocks__/firebase-database.ts',
    '^firebase/(.*)$': '<rootDir>/__mocks__/firebase.ts',
  },
};
