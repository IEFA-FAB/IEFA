import type { Config } from 'jest';

const config: Config = {
    verbose: true,
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    modulePaths: ['<rootDir>/app/'],
};

export default config;