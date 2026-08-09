const path = require('path');

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/youtube-captions/**/*.spec.ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        diagnostics: false,
        tsconfig: {
          target: 'ES2020',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          isolatedModules: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@gitroom/backend/(.*)$': path.join(__dirname, 'apps/backend/src/$1'),
    '^@gitroom/frontend/(.*)$': path.join(__dirname, 'apps/frontend/src/$1'),
    '^@gitroom/helpers/(.*)$': path.join(
      __dirname,
      'libraries/helpers/src/$1'
    ),
    '^@gitroom/nestjs-libraries/(.*)$': path.join(
      __dirname,
      'libraries/nestjs-libraries/src/$1'
    ),
    '^@gitroom/react/(.*)$': path.join(
      __dirname,
      'libraries/react-shared-libraries/src/$1'
    ),
    '^@gitroom/plugins/(.*)$': path.join(
      __dirname,
      'libraries/plugins/src/$1'
    ),
    '^@gitroom/orchestrator/(.*)$': path.join(
      __dirname,
      'apps/orchestrator/src/$1'
    ),
    '^@gitroom/extension/(.*)$': path.join(
      __dirname,
      'apps/extension/src/$1'
    ),
  },
  clearMocks: true,
};
