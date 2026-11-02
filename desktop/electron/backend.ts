import type { FileHandle } from 'node:fs/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Agent, get, request as httpRequest } from 'node:http';
import { dirname, join } from 'node:path';
import type { AppStatus } from '../shared/contracts';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class Backend {
  // Queue thumbnail bursts below Uvicorn's connection cap; keep control requests responsive.
  private readonly httpAgent = new Agent({ keepAlive: false, maxSockets: 6, maxTotalSockets: 6 });
  private child: ChildProcessWithoutNullStreams | null = null;
  private token = '';
  private port: number | null = null;
  private stopping = false;
  private startup: Promise<void> | null = null;
  private state: AppStatus = {
    phase: 'starting',
    appVersion: '0.10.0',
    backendVersion: null,
    diagnosticCode: null,
  };

  constructor(
    private readonly projectRoot: string,
    private readonly dataRoot = join(projectRoot, 'storage'),
    private readonly packagedExecutable?: string,
  ) {}

  status(): AppStatus {
    return { ...this.state };
  }

  private fail(code: string): void {
    this.port = null;
    this.state = { ...this.state, phase: 'failed', backendVersion: null, diagnosticCode: code };
  }

  start(): Promise<void> {
    if (this.startup) return this.startup;
    this.startup = this.launch().finally(() => {
      this.startup = null;
    });
    return this.startup;
  }

  private async launch(): Promise<void> {
    await this.stop();
    this.stopping = false;
    this.state = { ...this.state, phase: 'starting', diagnosticCode: null, backendVersion: null };
    this.token = randomBytes(32).toString('hex');
    const executable =
      this.packagedExecutable ??
      join(this.projectRoot, 'backend', '.venv', 'Scripts', 'python.exe');
    const child = spawn(
      executable,
      this.packagedExecutable
        ? []
        : [
            '-I',
            '-c',
            "import sys; sys.path.insert(0, '.'); from app.runner import main; raise SystemExit(main())",
          ],
      {
        cwd: this.packagedExecutable
          ? dirname(this.packagedExecutable)
          : join(this.projectRoot, 'backend'),
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      },
    );
    this.child = child;
    child.stderr.resume(); // Never put Python errors containing private paths into app diagnostics.
    child.on('error', () => this.fail('BACKEND_LAUNCH_FAILED'));
    child.stdin.on('error', () => {
      if (!this.stopping) this.fail('BACKEND_PIPE_CLOSED');
    });
    child.on('exit', () => {
      if (this.child === child && !this.stopping) this.fail('BACKEND_EXITED');
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (this.port !== null || this.stopping) return;
      output += chunk;
      if (output.length > 4096) {
        this.fail('BACKEND_HANDSHAKE_INVALID');
        return;
      }
      const lineEnd = output.indexOf('\n');
      if (lineEnd < 0) return;
      try {
        const message: unknown = JSON.parse(output.slice(0, lineEnd));
        if (
          typeof message !== 'object' ||
          message === null ||
          !('port' in message) ||
          typeof message.port !== 'number' ||
          !Number.isInteger(message.port) ||
          message.port < 1 ||
          message.port > 65535
        )
          throw new Error('Invalid handshake');
        this.port = message.port;
      } catch {
        this.fail('BACKEND_HANDSHAKE_INVALID');
      }
    });
    child.stdin.write(`${JSON.stringify({ token: this.token, data_root: this.dataRoot })}\n`);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && this.state.phase === 'starting' && !this.stopping) {
      if (this.port !== null) {
        try {
          const health = await this.health();
          if (!this.stopping) {
            this.state = {
              ...this.state,
              phase: 'ready',
              backendVersion: health,
              diagnosticCode: null,
            };
          }
          return;
        } catch {
          /* The child announced its bound port before the event loop was ready. */
        }
      }
      await delay(100);
    }
    if (!this.stopping) {
      if (this.state.phase === 'starting') this.fail('BACKEND_START_TIMEOUT');
      await this.stop();
    }
  }

  private health(): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = get(
        {
          hostname: '127.0.0.1',
          agent: this.httpAgent,
          port: this.port!,
          path: '/health',
          timeout: 1500,
          headers: { Origin: 'thing://app', 'X-Thing-Token': this.token },
        },
        (response) => {
          if (response.statusCode !== 200) {
            response.resume();
            reject(new Error('Health request refused'));
            return;
          }
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => {
            body += chunk;
            if (body.length > 2048) request.destroy(new Error('Response too large'));
          });
          response.on('error', reject);
          response.on('end', () => {
            try {
              const value: unknown = JSON.parse(body);
              if (
                typeof value !== 'object' ||
                value === null ||
                !('status' in value) ||
                value.status !== 'ok' ||
                !('version' in value) ||
                value.version !== '0.10.0'
              ) {
                throw new Error('Invalid health response');
              }
              resolve(value.version);
            } catch {
              reject(new Error('Invalid health response'));
            }
          });
        },
      );
      request.on('timeout', () => request.destroy(new Error('Health timeout')));
      request.on('error', reject);
    });
  }

  async call<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const result = await this.bytes(path, method, body);
    return JSON.parse(result.toString('utf8')) as T;
  }

  bytes(path: string, method = 'GET', body?: unknown): Promise<Buffer> {
    if (!this.port) return Promise.reject(new Error('The local connection is unavailable.'));
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: '127.0.0.1',
          agent: this.httpAgent,
          port: this.port!,
          path,
          method,
          timeout: 15000,
          headers: {
            Origin: 'thing://app',
            'X-Thing-Token': this.token,
            ...(payload
              ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
              : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 8 * 1024 * 1024)
              request.destroy(new Error('Response exceeds the allowed size.'));
            else chunks.push(chunk);
          });
          response.on('error', () => reject(new Error('The local response was interrupted.')));
          response.on('end', () => {
            const result = Buffer.concat(chunks);
            if (response.statusCode !== 200) {
              let message = 'This action could not be completed. Please try again.';
              try {
                const value: unknown = JSON.parse(result.toString());
                if (
                  typeof value === 'object' &&
                  value &&
                  'detail' in value &&
                  typeof value.detail === 'string'
                )
                  message = value.detail;
              } catch {
                /* Use the fixed safe message if a response was not valid JSON. */
              }
              reject(new Error(message));
            } else resolve(result);
          });
        },
      );
      request.on('timeout', () => request.destroy(new Error('The local request timed out.')));
      request.on('error', () => reject(new Error('The local connection was interrupted.')));
      request.end(payload);
    });
  }

  upload(id: string, file: FileHandle, size: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = file.createReadStream({ autoClose: false, highWaterMark: 1024 * 1024 });
      const request = httpRequest(
        {
          hostname: '127.0.0.1',
          agent: this.httpAgent,
          port: this.port!,
          path: `/uploads/${id}`,
          method: 'PUT',
          signal,
          timeout: 30000,
          headers: {
            Origin: 'thing://app',
            'X-Thing-Token': this.token,
            'Content-Type': 'application/octet-stream',
            'Content-Length': size,
          },
        },
        (response) => {
          response.resume();
          response.on('end', () => {
            stream.destroy();
            if (response.statusCode === 200) resolve();
            else reject(new Error('This photo could not be copied.'));
          });
          response.on('error', reject);
        },
      );
      stream.on('error', (error) => request.destroy(error));
      request.on('error', (error) => {
        stream.destroy();
        reject(error);
      });
      request.on('timeout', () => request.destroy(new Error('Copy timed out.')));
      stream.pipe(request);
    });
  }

  async probe(): Promise<AppStatus> {
    if (this.state.phase === 'ready') {
      try {
        await this.health();
      } catch {
        this.fail('BACKEND_UNAVAILABLE');
      }
    }
    return this.status();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (child && child.exitCode === null && child.signalCode === null && child.pid) {
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      if (!child.stdin.destroyed) child.stdin.end('shutdown\n');
      await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await Promise.race([exited, delay(1500)]);
      }
    }
    this.child = null;
    this.port = null;
    this.token = '';
  }
}
