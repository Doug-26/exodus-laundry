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
      },
    }],
  },
  moduleNameMapper: {
    '^firebase/(.*)$': '<rootDir>/__mocks__/firebase.ts',
  },
};
