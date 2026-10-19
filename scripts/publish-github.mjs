// Uses Git Credential Manager. Never prints or writes access tokens.
import { spawnSync } from 'node:child_process';
const account = process.argv[2];
const name = process.argv[3] || 'team-task-manager-assessment';
if (!/^[a-zA-Z0-9-]+$/.test(account || '') || !/^[a-zA-Z0-9._-]+$/.test(name))
  throw new Error('Usage: node scripts/publish-github.mjs ACCOUNT REPOSITORY');
const git = (args) => {
  const result = spawnSync('git', args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) throw new Error('Git command failed.');
};
const credentials = spawnSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\nusername=' + account + '\n\n',
  encoding: 'utf8',
  shell: false,
});
if (credentials.status !== 0) throw new Error('Sign in with Git Credential Manager first.');
const values = Object.fromEntries(
  credentials.stdout
    .trim()
    .split('\n')
    .map((line) => {
      const position = line.indexOf('=');
      return [line.slice(0, position), line.slice(position + 1)];
    }),
);
if (!values.password) throw new Error('GitHub credentials were not returned.');
async function api(path, options = {}) {
  const response = await fetch('https://api.github.com' + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + values.password,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      'GitHub API request failed (HTTP ' +
        response.status +
        '): ' +
        (data.message || 'unknown error'),
    );
  return data;
}
try {
  const profile = await api('/user');
  if (profile.login.toLowerCase() !== account.toLowerCase())
    throw new Error('Authenticated account does not match the requested owner.');
  // Creation is intentional. Existing repositories are never reused or overwritten.
  const repo = await api('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name,
      private: true,
      description:
        'Full stack Team Task Manager assessment: React, Express, Passport sessions, and Cloud Firestore.',
      auto_init: false,
    }),
  });
  git(['remote', 'add', 'origin', repo.clone_url]);
  git(['push', '--set-upstream', 'origin', 'main']);
  git(['push', 'origin', 'feature/secure-api', 'feature/dashboard']);
  console.log('Created private repository: ' + repo.html_url);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
