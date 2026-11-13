// Other tabs, for the tests of the projects service: a BroadcastChannel that
// delivers between instances of this process (another «tab» is another
// instance) and Web Locks shared the same way. Install them with
// vi.stubGlobal before the service starts.

type Listener = (event: MessageEvent) => void;

const channels = new Map<string, Set<FakeBroadcastChannel>>();

/** BroadcastChannel between the instances of this process (like tabs of one origin). */
export class FakeBroadcastChannel {
  private listeners = new Set<Listener>();
  onmessage: Listener | null = null;
  constructor(readonly name: string) {
    if (!channels.has(name)) channels.set(name, new Set());
    channels.get(name)!.add(this);
  }
  postMessage(data: unknown) {
    for (const other of channels.get(this.name) ?? []) {
      if (other === this) continue;
      // Delivered later, like a real channel (never inside postMessage).
      void Promise.resolve().then(() => other.dispatch(structuredClone(data)));
    }
  }
  addEventListener(type: string, listener: Listener) {
    if (type === 'message') this.listeners.add(listener);
  }
  removeEventListener(type: string, listener: Listener) {
    if (type === 'message') this.listeners.delete(listener);
  }
  close() {
    channels.get(this.name)?.delete(this);
  }
  private dispatch(data: unknown) {
    const event = { data } as MessageEvent;
    this.onmessage?.(event);
    for (const listener of [...this.listeners]) listener(event);
  }
  /** Forgets every channel (between tests). */
  static reset() {
    channels.clear();
  }
}

interface Held {
  name: string;
  release: () => void;
  abort: (reason: unknown) => void;
}

/**
 * A Web Locks manager whose exclusive locks are shared by everything that
 * uses this instance (stub navigator.locks with it in every «tab»). Supports
 * what the app uses: ifAvailable, steal and an abort signal.
 */
export class FakeLockManager {
  private held = new Map<string, Held>();
  private waiting = new Map<string, (() => void)[]>();

  async request(name: string, optionsOrCallback: unknown, maybeCallback?: (lock: { name: string } | null) => unknown) {
    const options = (typeof optionsOrCallback === 'function' ? {} : optionsOrCallback) as { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal };
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as (lock: { name: string } | null) => unknown;
    if (this.held.has(name)) {
      if (options.ifAvailable) return callback(null);
      if (options.steal) this.held.get(name)!.abort(new DOMException('The lock was stolen', 'AbortError'));
      else
        await new Promise<void>((resolve, reject) => {
          const queue = this.waiting.get(name) ?? [];
          queue.push(resolve);
          this.waiting.set(name, queue);
          options.signal?.addEventListener('abort', () => {
            queue.splice(queue.indexOf(resolve), 1);
            reject(options.signal!.reason ?? new DOMException('Aborted', 'AbortError'));
          });
        });
    }
    let release!: () => void;
    let abort!: (reason: unknown) => void;
    const ended = new Promise<void>((resolve, reject) => {
      release = resolve;
      abort = reject;
    });
    const held: Held = { name, release, abort };
    this.held.set(name, held);
    const settle = () => {
      if (this.held.get(name) !== held) return;
      this.held.delete(name);
      this.waiting.get(name)?.shift()?.();
    };
    // The lock is held until the callback's promise settles (or it is stolen).
    const result = Promise.race([Promise.resolve(callback({ name })), ended]);
    result.then(settle, settle);
    return result;
  }

  /** Who holds what (for assertions). */
  heldNames() {
    return [...this.held.keys()];
  }
}
