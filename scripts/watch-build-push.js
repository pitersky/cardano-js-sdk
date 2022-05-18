#!/usr/bin/env node

const cp = require('child_process');
const path = require('path');

const workspacesInfo = JSON.parse(cp.execSync('yarn -s workspaces info').toString());
const workspaceData = Object.entries(workspacesInfo).map(([name, { location }]) => [name, location]);

workspaceData.forEach(([name, location]) => {
  cp.spawn(
    'nodemon',
    [
      '-w',
      path.resolve(__dirname, '..', location, 'src'),
      '-e',
      'ts',
      '-x',
      `yarn workspace ${name} build && yarn push ${name}`
    ],
    { stdio: 'inherit' }
  );
});
