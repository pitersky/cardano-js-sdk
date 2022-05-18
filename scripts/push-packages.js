#!/usr/bin/env node

const cp = require('child_process');

const [packageName] = process.argv.slice(2);

const push = (name) => cp.spawnSync('yarn', ['workspace', name, 'run', 'yalc', 'push'], { stdio: 'inherit' });

if (packageName) {
  push(packageName);
  process.exit();
}

const workspacesInfo = JSON.parse(cp.execSync('yarn workspaces info').toString());
const workspaceNames = Object.keys(workspacesInfo);
workspaceNames.forEach(push);
