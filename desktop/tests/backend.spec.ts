import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { Backend } from '../electron/backend';

test('a missing backend produces a safe failure', async () => {
  const backend = new Backend(resolve('test-results', 'nonexistent-project'));
  try {
    await backend.start();
    expect(backend.status().phase).toBe('failed');
    expect(backend.status().diagnosticCode).toBe('BACKEND_LAUNCH_FAILED');
    expect(JSON.stringify(backend.status())).not.toContain(resolve('.'));
  } finally {
    await backend.stop();
  }
});

test('supervisor detects a backend crash, restarts it, and closes its owned process', async () => {
  const backend = new Backend(resolve('..'), await mkdtemp(join(tmpdir(), 'thing-supervisor-')));
  try {
    await backend.start();
    expect((await backend.probe()).phase).toBe('ready');
    // Fault injection targets only the child created by this test's own supervisor.
    const child = (backend as unknown as { child: ChildProcessWithoutNullStreams }).child;
    expect(child.pid).toBeDefined();
    child.kill();
    await expect.poll(() => backend.status().phase).toBe('failed');
    expect(backend.status().diagnosticCode).toBe('BACKEND_EXITED');
    await backend.start();
    expect((await backend.probe()).phase).toBe('ready');
    const replacement = (backend as unknown as { child: ChildProcessWithoutNullStreams }).child;
    await backend.stop();
    expect(replacement.exitCode).toBe(0);
  } finally {
    await backend.stop();
  }
});
