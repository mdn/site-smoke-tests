import { readFile } from 'node:fs/promises';

const marker = '<!-- mdn-site-smoke-report -->';
const title = 'Daily MDN production Lighthouse audit';
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!repository || !/^[^/]+\/[^/]+$/.test(repository) || !token) {
  throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
}

async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}: ${await response.text()}`);
  return response.json();
}

const report = await readFile(process.env.REPORT_PATH || 'report.md', 'utf8');
const body = `${marker}\n\n${report}`;
const matches = [];
for (let page = 1; ; page += 1) {
  const issues = await api(`/issues?state=all&per_page=100&page=${page}`);
  matches.push(...issues.filter((issue) => !issue.pull_request && issue.body?.includes(marker)));
  if (issues.length < 100) break;
}
if (matches.length > 1) throw new Error(`Found ${matches.length} issues with the report marker; resolve duplicates before updating`);
if (matches.length === 1) {
  const issue = matches[0];
  const updated = await api(`/issues/${issue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ title, body, state: 'open' }),
  });
  console.log(`Updated ${updated.html_url}`);
} else {
  const created = await api('/issues', {
    method: 'POST',
    body: JSON.stringify({ title, body }),
  });
  console.log(`Created ${created.html_url}`);
}
