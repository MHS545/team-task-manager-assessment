import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = directory + '/' + entry.name;
    if (entry.isDirectory()) result.push(...(await walk(name)));
    else if (/\.(js|mjs)$/.test(name)) result.push(name);
  }
  return result;
}
for (const file of [
  ...(await walk('server')),
  ...(await walk('scripts')),
  ...(await walk('api')),
  ...(await walk('test')),
]) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Server, API, scripts and test syntax checks passed.');
