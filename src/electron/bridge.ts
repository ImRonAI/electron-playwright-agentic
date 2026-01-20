import http from 'node:http';
import { getElectronModule, isElectronMainProcess } from './runtime.js';
import { getCdpUrlFromApp, getFocusedTargetInfo, getTargetInfoForWebContents } from './targets.js';
import { ensureHeadlessWebContents } from './headless.js';
import type { EmbedType } from './config.js';

export interface ElectronBridgeOptions {
  port?: number;
  cdpPort?: number;
  iframeSelector?: string;
  iframeType?: EmbedType;
  headless?: boolean;
}

export interface ElectronBridgeStatus {
  cdpUrl?: string;
  targetId?: string;
  webContentsId?: number;
  windowId?: number;
  iframeSelector?: string;
  iframeType?: EmbedType;
}

export function startElectronBridge(options: ElectronBridgeOptions = {}): http.Server {
  if (!isElectronMainProcess()) {
    throw new Error('Electron bridge can only be started from the Electron main process.');
  }

  const electron = getElectronModule();
  if (!electron) {
    throw new Error('Electron module is not available in this runtime.');
  }

  if (options.cdpPort && !electron.app.isReady()) {
    electron.app.commandLine.appendSwitch('remote-debugging-port', String(options.cdpPort));
  }

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing request URL.' }));
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/status')) {
      const focused = options.headless
        ? await getTargetInfoForWebContents(await ensureHeadlessWebContents())
        : await getFocusedTargetInfo();
      const status: ElectronBridgeStatus = {
        cdpUrl: getCdpUrlFromApp(),
        targetId: focused?.targetId,
        webContentsId: focused?.webContentsId,
        windowId: focused?.windowId,
        iframeSelector: options.iframeSelector,
        iframeType: options.iframeType
      };

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found.' }));
  });

  const port = options.port ?? 9231;
  server.listen(port, '127.0.0.1');
  return server;
}
