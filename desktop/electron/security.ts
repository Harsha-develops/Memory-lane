import { realpath, readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import type { IpcMainInvokeEvent, Session, WebContents } from 'electron';

export const APP_URL = 'thing://app/index.html';
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export function assertSender(
  event: IpcMainInvokeEvent,
  contents: WebContents,
  args: unknown[],
): void {
  if (
    event.sender !== contents ||
    event.senderFrame !== contents.mainFrame ||
    event.senderFrame.url !== APP_URL ||
    args.length !== 0
  ) {
    throw new Error('This request is not allowed.');
  }
}

export function secureSession(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.on('will-download', (event) => event.preventDefault());
  session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith('thing://app/') });
  });
}

export async function serveAsset(request: Request, root: string): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.host !== 'app' || url.protocol !== 'thing:' || request.method !== 'GET' || url.search) {
      return new Response('Not allowed', { status: 403 });
    }
    const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    if (name.includes('\\') || name.includes(':') || name.includes('\0')) {
      return new Response('Not allowed', { status: 403 });
    }
    const rootPath = await realpath(root);
    const filePath = await realpath(resolve(rootPath, name));
    const inside = relative(rootPath, filePath);
    if (inside.startsWith('..') || isAbsolute(inside)) {
      return new Response('Not allowed', { status: 403 });
    }
    const mime = mimeTypes[extname(filePath)];
    if (!mime) return new Response('Not allowed', { status: 403 });
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': mime,
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('This app resource could not be loaded.', { status: 404 });
  }
}
