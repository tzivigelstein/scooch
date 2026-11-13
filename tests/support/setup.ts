// Runs before every test file of the state and ui projects (vite.config.ts).
import { afterEach } from 'vitest';
import { clearAnnouncements } from '../../src/components/feedback/announcer.ts';

// An announcement waits on a timer: dropped after each test, it can't go out
// in the next test, or after the file's DOM is torn down.
afterEach(() => clearAnnouncements());
