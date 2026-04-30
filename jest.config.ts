import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Override bundler-specific settings that ts-jest doesn't support
        tsconfig: {
          moduleResolution: 'node',
          module: 'CommonJS',
        },
      },
    ],
  },
}

export default config
