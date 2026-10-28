import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'engine-and-scripts',
          include: ['packages/*/test/**/*.test.ts', 'scripts/**/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.tsx'],
          setupFiles: ['apps/web/src/test-setup.ts'],
        },
      },
    ],
  },
});
