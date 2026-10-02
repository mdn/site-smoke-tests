# MDN site smoke tests

This repository runs a Lighthouse smoke test against MDN. It records category scores and every audit below full score. There are no score thresholds. A run fails when Lighthouse cannot produce a valid report, reports a runtime error, or finds an unsuccessful HTTP status for the page.

| Trigger | URL | Result |
| --- | --- | --- |
| Daily schedule, 09:17 UTC | `https://developer.mozilla.org/en-US/` | Actions summary, one persistent issue, and the latest report on GitHub Pages |
| Pull request | `https://developer.allizom.org/en-US/` | Actions summary and job log |
| Manual dispatch | Supplied URL, defaulting to stage | Actions summary and job log |

The manual URL must use HTTPS on `developer.mozilla.org` or `developer.allizom.org`, on port 443. Credentials and fragments are rejected. The audit checks HTTP redirect targets before starting Chrome and verifies the final URL reported by Lighthouse. The URL is passed as an environment variable, never interpolated into a shell command.

The scheduled run creates or updates the issue containing `<!-- mdn-site-smoke-report -->`. It reopens a closed issue with that marker. If more than one issue has the marker, the run fails so the duplicates can be resolved manually. The issue links to the full production Lighthouse report published at [mdn.github.io/site-smoke-tests](https://mdn.github.io/site-smoke-tests/). Only the scheduled issue-update job has `issues: write`. A separate scheduled job deploys the Pages artifact; PR and manual reports do not update the published page.

Lighthouse is pinned through `package-lock.json`. The workflow pins `actions/checkout` to v7.0.1, `actions/setup-node` to v7.0.0, `actions/upload-artifact` to v7.0.1, `actions/configure-pages` to v6.0.0, `actions/upload-pages-artifact` to v5.0.0, `actions/deploy-pages` to v5.0.1, and `actions/download-artifact` to v8.0.1 by commit SHA. Markdown, JSON, and HTML reports are uploaded as a seven-day artifact, including the Markdown failure report when Lighthouse stops early. The report also appears in the Actions run summary and log. The scheduled issue contains the latest report and a link to its run.

To run an audit locally after `npm ci`:

```sh
AUDIT_URL=https://developer.allizom.org/en-US/ node scripts/run-audit.mjs
```

The workflow uses Chrome installed on the GitHub hosted Ubuntu runner. Local runs need Chrome available to Lighthouse.
