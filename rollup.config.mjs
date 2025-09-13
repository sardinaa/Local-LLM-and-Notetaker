import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default [
  {
    input: 'static/js/tasks/index.js',
    output: {
      file: 'static/dist/tasks.js',
      format: 'iife',
      name: 'TasksBundle',
      sourcemap: true,
    },
    plugins: [resolve(), commonjs()],
  }
];

