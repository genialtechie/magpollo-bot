import WebSocket from 'ws';
import { elizaLogger, LoggingLevel } from '@elizaos/core';
import express from 'express';
import path from 'path';

export class LogWebSocketServer {
  private wss: WebSocket.Server;
  private app: express.Application;

  constructor(port: number = 3001) {
    // Create Express app for static files
    this.app = express();

    // Serve static files from public directory
    this.app.use(express.static('public'));

    // Create HTTP server
    const server = this.app.listen(port, () => {
      elizaLogger.info(`Log viewer available at http://localhost:${port}`);
    });

    // Attach WebSocket server to HTTP server
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      elizaLogger.info('New client connected to logger');
    });

    // Override logger methods to capture logs
    const originalMethods = {
      log: elizaLogger.log,
      warn: elizaLogger.warn,
      error: elizaLogger.error,
      info: elizaLogger.info,
      debug: elizaLogger.debug,
      success: elizaLogger.success,
    };

    // Intercept each log method
    Object.entries(originalMethods).forEach(([level, originalFn]) => {
      elizaLogger[level] = (...args: any[]) => {
        // Call original logging function
        originalFn.apply(elizaLogger, args);

        // Broadcast to WebSocket clients
        const logData = {
          timestamp: new Date().toISOString(),
          level: level.toUpperCase(),
          message: args.join(' '),
        };

        this.wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(logData));
          }
        });
      };
    });
  }
}
