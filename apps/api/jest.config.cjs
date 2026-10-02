/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.test\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          types: ['jest', 'node'],
          noUncheckedIndexedAccess: true,
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  maxWorkers: 1,
};
