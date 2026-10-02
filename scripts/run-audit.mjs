import { spawn } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';

const reportPath = process.env.REPORT_PATH || 'report.md';
const resultPath = 'lighthouse-report';
const jsonPath = `${resultPath}.report.json`;
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
const allowedHosts = new Set(['developer.mozilla.org', 'developer.allizom.org']);

function validatedUrl(input) {
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !allowedHosts.has(url.hostname.toLowerCase())
  ) {
    throw new Error('URL must use HTTPS on developer.mozilla.org or developer.allizom.org, without credentials, a custom port, or a fragment');
  }
  return url.href;
}

async function validateRedirects(startUrl) {
  let url = startUrl;
  for (let hop = 0; hop < 10; hop += 1) {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    await response.body?.cancel();
    if (response.status < 300 || response.status >= 400) return;
    const location = response.headers.get('location');
    if (!location) throw new Error(`Redirect from ${url} has no Location header`);
    url = validatedUrl(new URL(location, url).href);
  }
  throw new Error('URL redirected more than ten times');
}

function runLighthouse(url) {
  return new Promise((resolve, reject) => {
    const child = spawn('node_modules/.bin/lighthouse', [
      url,
      '--output=json',
      '--output=html',
      `--output-path=${resultPath}`,
      '--only-categories=performance,accessibility,best-practices,seo',
      '--chrome-flags=--headless',
      '--quiet',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Lighthouse exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

function auditReport(url, lhr) {
  if (!lhr || typeof lhr !== 'object' || !lhr.categories || !lhr.audits) {
    throw new Error('Lighthouse did not produce a valid report');
  }
  const problems = [];
  try {
    validatedUrl(lhr.finalUrl);
  } catch {
    problems.push(`The final URL after redirects is outside the allowed MDN hosts: ${lhr.finalUrl || '(missing)'}`);
  }
  const scores = categories.map((id) => {
    const category = lhr.categories[id];
    if (typeof category?.score !== 'number') {
      problems.push(`Lighthouse did not report a ${id} score`);
      return `| ${category?.title || id} | n/a |`;
    }
    return `| ${category.title} | ${Math.round(category.score * 100)} |`;
  });
  const failed = Object.entries(lhr.audits)
    .filter(([, audit]) => typeof audit.score === 'number' && audit.score < 1)
    .map(([id, audit]) => `- ${audit.title} (\`${id}\`, ${Math.round(audit.score * 100)}/100)`);
  if (lhr.runtimeError) problems.push(`Lighthouse runtime error: ${lhr.runtimeError.message || lhr.runtimeError.code}`);
  if (lhr.audits['http-status-code']?.score === 0) problems.push('The audited page returned an unsuccessful HTTP status');
  const lines = [
    '# MDN Lighthouse smoke test',
    '',
    `URL: ${url}`,
    `Run: ${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY || 'local'}/actions/runs/${process.env.GITHUB_RUN_ID || 'local'}`,
    `Lighthouse: ${lhr.lighthouseVersion || 'unknown'}`,
    '',
    '| Category | Score / 100 |',
    '| --- | ---: |',
    ...scores,
    '',
    `## Audits below full score (${failed.length})`,
    '',
    ...(failed.length ? failed : ['None.']),
  ];
  if (problems.length) lines.push('', '## Run failure', '', ...problems.map((problem) => `- ${problem}`));
  return { report: `${lines.join('\n')}\n`, failed: problems.length > 0 };
}

async function main() {
  let report;
  let failed = false;
  try {
    const url = validatedUrl(process.env.AUDIT_URL || '');
    await validateRedirects(url);
    await runLighthouse(url);
    const lhr = JSON.parse(await readFile(jsonPath, 'utf8'));
    ({ report, failed } = auditReport(url, lhr));
  } catch (error) {
    failed = true;
    report = `# MDN Lighthouse smoke test\n\nURL: ${process.env.AUDIT_URL || '(missing)'}\n\n## Run failure\n\n${error.message}\n`;
  }
  await writeFile(reportPath, report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
  if (failed) process.exitCode = 1;
}

await main();
