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
  },
  {
    input: 'static/js/jobs/index.js',
    output: {
      file: 'static/dist/jobs.js',
      format: 'iife',
      name: 'JobsBundle',
      sourcemap: true,
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'static/js/notes/index.js',
    output: {
      file: 'static/dist/notes.js',
      format: 'iife',
      name: 'NotesBundle',
      sourcemap: true,
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'static/js/chat/index.js',
    output: {
      file: 'static/dist/chat.js',
      format: 'iife',
      name: 'ChatBundle',
      sourcemap: true,
    },
    plugins: [resolve(), commonjs()],
  },
  {
    input: 'static/js/chat/fileviewer/index.js',
    output: {
      file: 'static/dist/fileviewer.js',
      format: 'iife',
      name: 'ChatFileViewerBundle',
      sourcemap: true,
    },
    plugins: [resolve(), commonjs()],
  }
];
