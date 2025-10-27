import next from 'eslint-config-next/flat';

export default [
  {
    ignores: ['.next', 'node_modules', 'dist']
  },
  ...next,
];
