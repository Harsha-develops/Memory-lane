const { spawn } = require('node:child_process');
const path = require('node:path');

// Coding tools may set this for their own processes. The desktop app needs GUI mode.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.resolve(__dirname, '..')], {
  env,
  stdio: 'inherit',
  shell: false,
});
child.on('error', () => {
  console.error('Could not launch thing sorted. Run npm.cmd ci in the desktop folder.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
