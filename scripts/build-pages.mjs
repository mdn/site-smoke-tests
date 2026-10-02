import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('pages', { recursive: true });

try {
  await copyFile('lighthouse-report.report.html', 'pages/index.html');
} catch {
  const report = await readFile('report.md', 'utf8');
  const escapedReport = report.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
  const page = `<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MDN Lighthouse smoke test</title>
  <main><h1>MDN Lighthouse smoke test</h1><pre>${escapedReport}</pre></main>
</html>
`;
  await writeFile('pages/index.html', page);
}
