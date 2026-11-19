# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

- Email gelsteintzivisantiago@gmail.com with "Security" in the subject.
- Or, if the repository has GitHub's private vulnerability reporting turned
  on, use **Report a vulnerability** in the Security tab.

Include what you found, the steps or a file to reproduce it, the browser and
operating system, and what someone could do with it. Don't include real
personal documents: make up a test file instead.

You'll get an answer once the report has been read. Please give the maintainer
reasonable time to fix the problem before you talk about it in public.

## Supported versions

Only the current code on `main`, which is what the public site runs, gets
security fixes.

## Scope

Scooch is a client-only web app. There is no server-side code, no accounts and
no database on our side. The files people add are processed in their own
browser, and projects are saved only in that browser's storage (IndexedDB and
localStorage). The hosting provider only serves the app's static files.

Reports are most useful when they are about the app's own code or the
libraries it ships, for example:

- a crafted image or PDF that runs code in the app's page or reads data it
  shouldn't;
- anything that makes a person's files or projects leave their browser;
- another website being able to read or change the projects Scooch saved.

Out of scope: problems in the browsers themselves (report them to the browser's
maker), in the hosting provider's infrastructure (report them to the provider)
and attacks that need full control of the person's device or browser.
