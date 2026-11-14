// The site in the build: the content pages are rendered to static HTML next
// to the app (which stays rendered in the browser), with their own small
// script where they need one, built apart so it never pulls in the editor.
// The editor's index.html gets its canonical URL, share tags and structured
// data. `vite` (dev) serves the same pages, rendered on each request.
// docs/site.md explains the pages, the environment variables and the checks.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, loadEnv, type Plugin, type ResolvedConfig } from 'vite';
import { ENV_PREFIXES, publishVerdict, siteFromEnv, type Site } from './config.ts';
import { editorHead, publishProblems, readLegal, siteFiles } from './site.ts';

const CALCULATOR = 'src/site/calculator.ts';
const SHARE_IMAGE = 'src/site/share.png';

interface Chunk {
  type: 'chunk' | 'asset';
  fileName: string;
  code?: string;
}

/** The calculator's script on its own: its code and where it goes (assets/calculator-[hash].js). */
async function buildCalculator(config: ResolvedConfig) {
  const result = await build({
    configFile: false,
    root: config.root,
    mode: config.mode,
    logLevel: 'warn',
    publicDir: false,
    build: {
      write: false,
      minify: true,
      sourcemap: false,
      modulePreload: false,
      copyPublicDir: false,
      reportCompressedSize: false,
      rolldownOptions: {
        input: { calculator: resolve(config.root, CALCULATOR) },
        output: { format: 'es', entryFileNames: 'assets/[name]-[hash].js' },
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as unknown as { output: Chunk[] }[];
  const chunks = outputs.flatMap((o) => o.output).filter((o) => o.type === 'chunk');
  if (chunks.length !== 1 || !chunks[0].code) throw new Error(`The calculator's script should build to one file, not ${chunks.length}`);
  return { fileName: chunks[0].fileName, code: chunks[0].code };
}

const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8', png: 'image/png' };

export function sitePages(): Plugin {
  let config: ResolvedConfig;
  let site: Site;
  return {
    name: 'site-pages',
    configResolved(resolved) {
      config = resolved;
      site = siteFromEnv(loadEnv(resolved.mode, typeof resolved.envDir === 'string' ? resolved.envDir : resolved.root, ENV_PREFIXES));
    },
    buildStart() {
      if (config.command !== 'build') return;
      const verdict = publishVerdict(site, publishProblems(site, readLegal(config.root)));
      if (verdict?.stop) this.error(verdict.message);
      else if (verdict) this.warn(verdict.message);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.path !== '/index.html') return html;
        return html.replace('</head>', `  ${editorHead(site).join('\n    ')}\n  </head>`);
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split(/[?#]/)[0];
        if (path === '/share.png') {
          res.setHeader('Content-Type', TYPES.png);
          return res.end(readFileSync(resolve(config.root, SHARE_IMAGE)));
        }
        const name = path.slice(1).replace(/\.html$/, '');
        if (!/^(es\/[\w-]+|sitemap\.xml|robots\.txt|llms\.txt)$/.test(name)) return next();
        const files = siteFiles(site, readLegal(config.root), { calculator: `/${CALCULATOR}` });
        const file = name.includes('.') ? name : `${name}.html`;
        const body = files.get(file);
        if (body === undefined) return next();
        res.setHeader('Content-Type', TYPES[file.split('.').pop()!]);
        res.end(body);
      });
    },
    async generateBundle() {
      const calculator = await buildCalculator(config);
      this.emitFile({ type: 'asset', fileName: calculator.fileName, source: calculator.code });
      for (const [fileName, source] of siteFiles(site, readLegal(config.root), { calculator: `/${calculator.fileName}` })) this.emitFile({ type: 'asset', fileName, source });
      this.emitFile({ type: 'asset', fileName: 'share.png', source: readFileSync(resolve(config.root, SHARE_IMAGE)) });
    },
  };
}
