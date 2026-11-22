// Everything a browser context sends, seen from four places at once, for
// privacy.spec.ts. Each engine shows Playwright a different part of it, so
// no single listener is enough; together they leave a request to another
// origin nowhere to go unrecorded:
//
//   - The network (startRecorder): the context's proxy is a small server in
//     the test. The browser hands it every request of the context's pages,
//     frames and workers, in every engine, whatever Playwright reports. It
//     forwards body-less GET and HEAD requests for the page's own origin to
//     the app's server, and refuses (recording it) anything else: another
//     host, a CONNECT tunnel (https, wss), a WebSocket upgrade, another
//     method, a body. It can't see what never becomes an HTTP request: a DNS
//     lookup, WebRTC or WebTransport (the page and worker watches record the
//     calls that would make them), nor what the browser answers from its
//     cache (each test has a new context: nothing from elsewhere is cached).
//     Chromium and Firefox send it the page's own origin too (it is a
//     loopback address, which Playwright proxies there); WebKit may not.
//   - Playwright's routing (watchRoutes): every request it reports is
//     recorded, and aborted unless it is a body-less GET or HEAD to the page's
//     own origin, so nothing it sees ever leaves. Chromium and WebKit report
//     the requests of the page, its frames and its workers; Firefox reports a
//     worker's script but not what the worker requests itself (its imports,
//     its fetches): the network and the worker watch see those.
//   - Each page and frame (watchPage, an init script): its resource timing
//     (every resource it fetched, from any host), each call to an API that
//     sends or connects (fetch, XMLHttpRequest, sendBeacon, WebSocket,
//     EventSource, WebTransport, RTCPeerConnection, a worker, a service
//     worker, a form submission), each cookie written, and each element that
//     makes the browser fetch or connect to another origin (a stylesheet,
//     icon, preload, prefetch, preconnect or dns-prefetch link, an image,
//     frame or media source, a ping), as it appears.
//   - Each worker (WORKER_PRELUDE, put at the top of every worker script the
//     build serves): its resource timing and the same calls, posted to the
//     pages over a BroadcastChannel, with a hello, so the test knows every
//     worker the app started was watched.
import { createServer, request as forward, type Server } from 'node:http';
import type { BrowserContext, Route } from '@playwright/test';

/** One thing a page or a worker reported (see watchPage and watchWorker). */
export interface Report {
  kind: 'resource' | 'call' | 'cookie' | 'element' | 'hello' | 'blind';
  /** For calls: which API. For elements: the element and attribute. For blind spots: what couldn't be watched. */
  api?: string;
  url?: string;
  method?: string;
  body?: boolean;
  /** The worker's script, for what a worker reported. */
  worker?: string;
  /** The document that reported it (or relayed a worker's report). */
  where?: string;
}

/** A request as the network (the proxy) or Playwright's routing saw it. */
export interface Seen {
  method: string;
  url: string;
  body: boolean;
  /** Routing only: Playwright's resource type. */
  type?: string;
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** What the watches recorded in one test, and what in it breaks the rule. */
export class NetworkWatch {
  /** Every request the proxy received; `refused` are those it didn't forward. */
  readonly network: (Seen & { refused: boolean })[] = [];
  /** Every request Playwright's routing reported. */
  readonly routed: Seen[] = [];
  readonly reports: Report[] = [];
  /** Set-Cookie headers in any response. */
  readonly setCookies: string[] = [];

  constructor(readonly origin: string) {}

  /**
   * The page's own origin, or a URL that never leaves the browser: data:,
   * about:, or blob: (which carries the origin that made it).
   */
  isLocal(url: string) {
    if (/^(data|about|javascript):/i.test(url)) return true;
    try {
      return new URL(url).origin === this.origin;
    } catch {
      return false;
    }
  }

  /** Every URL any watch saw being requested. */
  requested() {
    return [...this.network.map((r) => r.url), ...this.routed.map((r) => r.url), ...this.reports.filter((r) => r.kind === 'resource').map((r) => r.url ?? '')];
  }

  /** The worker scripts the app started (the pages' Worker calls), and those whose watch said hello. */
  workers() {
    const started = this.reports.filter((r) => r.kind === 'call' && (r.api === 'Worker' || r.api === 'SharedWorker')).map((r) => r.url ?? '');
    const watched = this.reports.filter((r) => r.kind === 'hello').map((r) => r.worker ?? '');
    return { started: [...new Set(started)], watched: [...new Set(watched)] };
  }

  /** Everything that breaks the rule, one line each: empty when the editor kept to its own origin and sent nothing. */
  problems() {
    const out = new Set<string>();
    for (const r of this.network) if (r.refused) out.add(`network: ${r.method} ${r.url}${r.body ? ' with a body' : ''}`);
    for (const r of this.routed) if (!this.isLocal(r.url) || !SAFE_METHODS.has(r.method) || r.body) out.add(`request (${r.type}): ${r.method} ${r.url}${r.body ? ' with a body' : ''}`);
    for (const cookie of this.setCookies) out.add(`Set-Cookie: ${cookie}`);
    for (const r of this.reports) {
      const from = r.worker ? `worker ${r.worker}` : `page ${r.where}`;
      if (r.kind === 'resource' && !this.isLocal(r.url ?? '')) out.add(`${from} loaded ${r.url}`);
      if (r.kind === 'cookie') out.add(`${from} wrote a cookie: ${r.url}`);
      if (r.kind === 'element') out.add(`${from} has ${r.api} = ${r.url}`);
      if (r.kind === 'blind') out.add(`${from} couldn’t watch its ${r.api}`);
      if (r.kind !== 'call') continue;
      const local = this.isLocal(r.url ?? '');
      const harmless = (r.api === 'fetch' || r.api === 'XMLHttpRequest') && local && SAFE_METHODS.has(r.method ?? 'GET') && !r.body;
      const ownWorker = (r.api === 'Worker' || r.api === 'SharedWorker') && local;
      if (!harmless && !ownWorker) out.add(`${from} called ${r.api}${r.method ? ` (${r.method}${r.body ? ', with a body' : ''})` : ''}: ${r.url}`);
    }
    const { started, watched } = this.workers();
    for (const url of started) if (!watched.includes(url)) out.add(`a worker the test couldn’t watch: ${url}`);
    return [...out];
  }
}

// ---------- The network: a recording proxy ----------

export interface Recorder {
  /** The proxy's address, for the context's `proxy` option. */
  server: string;
  close(): Promise<void>;
}

/**
 * Starts the proxy on a free port of 127.0.0.1: it forwards body-less GET and
 * HEAD requests for the watch's origin and refuses the rest, recording each.
 */
export async function startRecorder(watch: NetworkWatch): Promise<Recorder> {
  const app = new URL(watch.origin);
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '';
    const body = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;
    const method = req.method ?? '';
    // A proxy gets absolute URLs; a path alone would be a client talking to it as if it were the server.
    const refused = !/^https?:\/\//.test(url) || !watch.isLocal(url) || !SAFE_METHODS.has(method) || body;
    watch.network.push({ method, url, body, refused });
    if (refused) {
      req.resume();
      res.writeHead(403, { 'content-type': 'text/plain' }).end('Refused by the test: not the page’s own origin, or not a body-less GET');
      return;
    }
    const { pathname, search } = new URL(url);
    const headers = { ...req.headers };
    delete headers['proxy-connection'];
    delete headers['proxy-authorization'];
    const upstream = forward({ host: app.hostname, port: app.port, method, path: pathname + search, headers }, (answer) => {
      const cookie = answer.headers['set-cookie'];
      if (cookie) watch.setCookies.push(...cookie);
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  server.on('connect', (req, socket) => {
    watch.network.push({ method: 'CONNECT', url: req.url ?? '', body: false, refused: true });
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  });
  server.on('upgrade', (req, socket) => {
    watch.network.push({ method: `${req.method} (upgrade to ${req.headers.upgrade})`, url: req.url ?? '', body: false, refused: true });
    socket.destroy();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The recording proxy has no port');
  return {
    server: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}

// ---------- Playwright's routing, the pages and the workers ----------

/** The worker scripts the build serves (export.worker-…, contour.worker-…, pdf.worker.min-…). */
const WORKER_SCRIPT = /\/assets\/[^/?#]*worker[^/?#]*\.m?js(\?[^#]*)?$/;

/** The channel the workers' watches post to; the pages relay it to the test. */
const CHANNEL = 'e2e:network';

/**
 * Runs in every page and frame before its scripts (an init script): reports
 * what it fetches and every call that could send something, through the
 * test's binding. Self-contained: it is serialized into the page.
 */
function watchPage({ origin, channel }: { origin: string; channel: string }) {
  type Entry = Record<string, unknown>;
  type Binding = (entries: Entry[]) => void;
  const w = window as unknown as Record<string, unknown>;
  if (w.__e2eWatched) return;
  w.__e2eWatched = true;
  const pending: Entry[] = [];
  const flush = () => {
    const binding = w.__e2eNetwork as Binding | undefined;
    if (typeof binding === 'function' && pending.length) binding(pending.splice(0));
  };
  const send = (entry: Entry) => {
    pending.push({ where: location.href, ...entry });
    flush();
  };
  document.addEventListener('DOMContentLoaded', flush);
  addEventListener('load', flush);
  const href = (value: unknown) => {
    const raw = value instanceof Request ? value.url : String(value ?? '');
    try {
      return new URL(raw, location.href).href;
    } catch {
      return raw;
    }
  };
  const local = (url: string) => /^(data|blob|about|javascript):/i.test(url) || url === '' || new URL(url, location.href).origin === origin;
  const owner = (o: unknown) => o as Record<string, unknown> | undefined;
  const wrapCall = (target: unknown, name: string, report: (args: unknown[], self: unknown) => void) => {
    const host = owner(target);
    const original = host?.[name];
    if (typeof original !== 'function') return;
    host![name] = new Proxy(original, {
      apply(fn, self, args) {
        report(args, self);
        return Reflect.apply(fn, self, args);
      },
    });
  };
  const wrapClass = (name: string, report: (args: unknown[]) => void) => {
    const original = w[name];
    if (typeof original !== 'function') return;
    w[name] = new Proxy(original, {
      construct(fn, args, target) {
        report(args);
        return Reflect.construct(fn, args, target);
      },
    });
  };

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) send({ kind: 'resource', url: e.name });
    }).observe({ type: 'resource', buffered: true });
  } catch {
    send({ kind: 'blind', api: 'resource timing' });
  }

  wrapCall(window, 'fetch', ([input, init]) => {
    const options = (init ?? {}) as RequestInit;
    const request = input instanceof Request ? input : null;
    send({ kind: 'call', api: 'fetch', url: href(input), method: (options.method ?? request?.method ?? 'GET').toUpperCase(), body: options.body != null || request?.body != null });
  });
  const opened = new WeakMap<object, { url: string; method: string }>();
  wrapCall(XMLHttpRequest.prototype, 'open', ([method, url], self) => opened.set(self as object, { url: href(url), method: String(method).toUpperCase() }));
  wrapCall(XMLHttpRequest.prototype, 'send', ([body], self) => send({ kind: 'call', api: 'XMLHttpRequest', ...opened.get(self as object), body: body != null }));
  wrapCall(Navigator.prototype, 'sendBeacon', ([url, data]) => send({ kind: 'call', api: 'sendBeacon', url: href(url), method: 'POST', body: data != null }));
  for (const name of ['WebSocket', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'Worker', 'SharedWorker']) wrapClass(name, ([url]) => send({ kind: 'call', api: name, url: name.endsWith('RTCPeerConnection') ? JSON.stringify(url ?? {}) : href(url) }));
  if (typeof ServiceWorkerContainer === 'function') wrapCall(ServiceWorkerContainer.prototype, 'register', ([url]) => send({ kind: 'call', api: 'serviceWorker.register', url: href(url) }));
  for (const name of ['submit', 'requestSubmit']) wrapCall(HTMLFormElement.prototype, name, (_, form) => send({ kind: 'call', api: `form.${name}`, url: (form as HTMLFormElement).action, method: (form as HTMLFormElement).method.toUpperCase() }));
  // A submission no handler stopped (the app's handlers run before the window's).
  addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    if (!e.defaultPrevented) send({ kind: 'call', api: 'form submission', url: form.action, method: form.method.toUpperCase() });
  });
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (cookie?.set) {
    Object.defineProperty(Document.prototype, 'cookie', {
      ...cookie,
      set(value: string) {
        send({ kind: 'cookie', url: String(value) });
        cookie.set!.call(this, value);
      },
    });
  }
  const store = owner(w.CookieStore)?.prototype;
  wrapCall(store, 'set', ([name]) => send({ kind: 'cookie', url: typeof name === 'string' ? name : JSON.stringify(name) }));

  // Elements that make the browser fetch from, or connect to, another origin.
  const FETCHING_RELS = /(^|\s)(stylesheet|icon|apple-touch-icon|mask-icon|preload|modulepreload|prefetch|prerender|preconnect|dns-prefetch|manifest|dictionary|compression-dictionary)(\s|$)/i;
  const URL_ATTRIBUTES = ['src', 'poster', 'data', 'action', 'formaction', 'background', 'href', 'xlink:href'];
  const inspect = (el: Element) => {
    const tag = el.localName;
    const found: [string, string][] = [];
    if (tag === 'script' && el.getAttribute('type') === 'speculationrules') found.push(['speculation rules', el.textContent ?? '']);
    if (tag === 'link') {
      if (FETCHING_RELS.test(el.getAttribute('rel') ?? '')) found.push(['href', el.getAttribute('href') ?? '']);
      for (const value of (el.getAttribute('imagesrcset') ?? '').split(',')) found.push(['imagesrcset', value.trim().split(/\s+/)[0]]);
    } else {
      for (const name of URL_ATTRIBUTES) {
        // An <a> or <area> only links (its ping is what fetches); an <svg> <image> or <use> fetches its href.
        if (name.endsWith('href') && !['image', 'use', 'feImage'].includes(tag)) continue;
        const value = el.getAttribute(name);
        if (value) found.push([name, value]);
      }
      for (const value of (el.getAttribute('ping') ?? '').split(/\s+/)) found.push(['ping', value]);
      for (const value of (el.getAttribute('srcset') ?? '').split(',')) found.push(['srcset', value.trim().split(/\s+/)[0]]);
    }
    for (const [attribute, value] of found) {
      if (attribute === 'speculation rules') send({ kind: 'element', api: '<script type="speculationrules">', url: value });
      else if (value && !local(href(value))) send({ kind: 'element', api: `<${tag} ${attribute}>`, url: href(value) });
    }
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') inspect(record.target as Element);
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        inspect(node);
        for (const inner of node.querySelectorAll('*')) inspect(inner);
      }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: [...URL_ATTRIBUTES, 'rel', 'ping', 'srcset', 'imagesrcset', 'type'] });

  // What the workers' watches post (see watchWorker).
  try {
    new BroadcastChannel(channel).onmessage = ({ data }) => send(data as Entry);
  } catch {
    send({ kind: 'blind', api: 'workers' });
  }
}

/**
 * Runs at the top of every worker script (WORKER_PRELUDE): says hello, then
 * reports what the worker fetches and every call that could send something,
 * over the channel the pages relay. Self-contained: it is serialized.
 * In a module worker it runs once the worker's imports have run, so a
 * module could keep the real fetch before it is wrapped: what that fetches
 * still shows in the resource timing, in Playwright's routing (Chromium,
 * WebKit) and at the proxy (every engine).
 */
function watchWorker(channel: string) {
  const scope = self as unknown as Record<string, unknown>;
  const post = new BroadcastChannel(channel);
  const worker = String((scope.location as Location | undefined)?.href ?? '');
  const send = (entry: Record<string, unknown>) => post.postMessage({ worker, ...entry });
  const href = (value: unknown) => {
    const raw = typeof Request === 'function' && value instanceof Request ? value.url : String(value ?? '');
    try {
      return new URL(raw, worker).href;
    } catch {
      return raw;
    }
  };
  const wrap = (host: Record<string, unknown> | undefined, name: string, report: (args: unknown[], self: unknown) => void, construct = false) => {
    const original = host?.[name];
    if (typeof original !== 'function') return;
    host![name] = new Proxy(original, {
      apply(fn, self, args) {
        report(args, self);
        return Reflect.apply(fn, self, args);
      },
      construct(fn, args, target) {
        if (construct) report(args, null);
        return Reflect.construct(fn, args, target);
      },
    });
  };
  send({ kind: 'hello' });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) send({ kind: 'resource', url: e.name });
    }).observe({ type: 'resource', buffered: true });
  } catch {
    send({ kind: 'blind', api: 'resource timing' });
  }
  wrap(scope, 'fetch', ([input, init]) => {
    const options = (init ?? {}) as RequestInit;
    const request = typeof Request === 'function' && input instanceof Request ? input : null;
    send({ kind: 'call', api: 'fetch', url: href(input), method: (options.method ?? request?.method ?? 'GET').toUpperCase(), body: options.body != null || request?.body != null });
  });
  const xhr = (scope.XMLHttpRequest as { prototype?: Record<string, unknown> } | undefined)?.prototype;
  const opened = new WeakMap<object, { url: string; method: string }>();
  wrap(xhr, 'open', ([method, url], self) => opened.set(self as object, { url: href(url), method: String(method).toUpperCase() }));
  wrap(xhr, 'send', ([body], self) => send({ kind: 'call', api: 'XMLHttpRequest', ...opened.get(self as object), body: body != null }));
  wrap(scope, 'importScripts', (urls) => urls.forEach((url) => send({ kind: 'call', api: 'importScripts', url: href(url) })));
  for (const name of ['WebSocket', 'EventSource', 'WebTransport', 'Worker', 'SharedWorker']) wrap(scope, name, ([url]) => send({ kind: 'call', api: name, url: href(url) }), true);
}

/** What goes at the top of every worker script the build serves. */
export const WORKER_PRELUDE = `;(${watchWorker.toString()})(${JSON.stringify(CHANNEL)});\n`;

/**
 * Starts every watch but the proxy (which the context was made with) on a
 * context, before its page opens the app.
 */
export async function watchNetwork(context: BrowserContext, watch: NetworkWatch) {
  await context.exposeBinding('__e2eNetwork', (_source, entries: Report[]) => {
    watch.reports.push(...entries);
  });
  await context.addInitScript(watchPage, { origin: watch.origin, channel: CHANNEL });
  // Registered first, so it runs after the route below has recorded the
  // request. The test fetches the script itself, straight from the app's
  // server: route.fetch() would go through the proxy in a CONNECT tunnel.
  await context.route(WORKER_SCRIPT, async (route) => {
    const response = await fetch(route.request().url());
    await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') ?? 'text/javascript', body: WORKER_PRELUDE + (await response.text()) });
  });
  context.on('response', (response) => {
    const cookie = response.headers()['set-cookie'];
    if (cookie) watch.setCookies.push(cookie);
  });
  // The last route registered runs first: it sees every request Playwright reports.
  await context.route('**/*', (route: Route) => {
    const request = route.request();
    const seen = { method: request.method(), url: request.url(), body: (request.postDataBuffer()?.length ?? 0) > 0, type: request.resourceType() };
    watch.routed.push(seen);
    if (!watch.isLocal(seen.url) || !SAFE_METHODS.has(seen.method) || seen.body) return route.abort('blockedbyclient');
    return route.fallback();
  });
}
