import { DirectClient } from '@elizaos/client-direct';
import {
  AgentRuntime,
  elizaLogger,
  settings,
  stringToUuid,
  type Character,
} from '@elizaos/core';
import { bootstrapPlugin } from '@elizaos/plugin-bootstrap';
import { createNodePlugin } from '@elizaos/plugin-node';
import { solanaPlugin } from '@elizaos/plugin-solana';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDbCache } from './cache/index.ts';
import { character } from './character.ts';
// import { startChat } from './chat/index.ts';
import { initializeClients } from './clients/index.ts';
import {
  getTokenForProvider,
  loadCharacters,
  parseArguments,
} from './config/index.ts';
import { initializeDatabase } from './database/index.ts';
import { LogWebSocketServer } from './logging/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
  const waitTime =
    Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};

let nodePlugin: any | undefined;

export function createAgent(
  character: Character,
  db: any,
  cache: any,
  token: string
) {
  elizaLogger.success(
    elizaLogger.successesTitle,
    'Creating runtime for character',
    character.name
  );

  nodePlugin ??= createNodePlugin();

  return new AgentRuntime({
    databaseAdapter: db,
    token,
    modelProvider: character.modelProvider,
    evaluators: [],
    character,
    plugins: [
      bootstrapPlugin,
      nodePlugin,
      character.settings?.secrets?.WALLET_PUBLIC_KEY ? solanaPlugin : null,
    ].filter(Boolean),
    providers: [],
    actions: [],
    services: [],
    managers: [],
    cacheManager: cache,
  });
}

async function startAgent(character: Character, directClient: DirectClient) {
  try {
    character.id ??= stringToUuid(character.name);
    character.username ??= character.name;

    const token = getTokenForProvider(character.modelProvider, character);
    const dataDir = path.join(__dirname, '../data');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = initializeDatabase(dataDir);

    try {
      await db.init();
    } catch (dbError) {
      elizaLogger.error(
        `Database initialization failed for ${character.name}:`,
        dbError
      );
      throw dbError; // Re-throw to handle in the outer catch
    }

    const cache = initializeDbCache(character, db);
    const runtime = createAgent(character, db, cache, token);

    try {
      await runtime.initialize();
    } catch (runtimeError) {
      elizaLogger.error(
        `Runtime initialization failed for ${character.name}:`,
        runtimeError
      );
      throw runtimeError; // Re-throw to handle in the outer catch
    }

    try {
      runtime.clients = await initializeClients(character, runtime);
    } catch (clientError) {
      elizaLogger.error(
        `Client initialization failed for ${character.name}:`,
        clientError
      );
      throw clientError; // Re-throw to handle in the outer catch
    }

    directClient.registerAgent(runtime);

    // Report to console
    elizaLogger.debug(`Started ${character.name} as ${runtime.agentId}`);

    return runtime;
  } catch (error) {
    elizaLogger.error(
      `Error starting agent for character ${character.name}:`,
      error
    );
    console.error(error);
    throw error; // Ensure the error is propagated to the caller
  }
}

const checkPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
};

const startAgents = async () => {
  let logServer;
  let directClient;

  try {
    // Initialize log server before starting agents
    logServer = new LogWebSocketServer(3001);

    directClient = new DirectClient();
    let serverPort = parseInt(settings.SERVER_PORT || '3000');
    const args = parseArguments();

    let charactersArg = args.characters || args.character;
    let characters = [character];

    if (charactersArg) {
      characters = await loadCharacters(charactersArg);
    }

    // Start each agent
    for (const character of characters) {
      try {
        await startAgent(character, directClient as DirectClient);
      } catch (error) {
        elizaLogger.error(
          `Failed to start agent for character ${character.name}:`,
          error
        );
        // Continue with other agents even if one fails
      }
    }

    // Find available port
    while (!(await checkPortAvailable(serverPort))) {
      elizaLogger.warn(
        `Port ${serverPort} is in use, trying ${serverPort + 1}`
      );
      serverPort++;
    }

    // Configure direct client
    directClient.startAgent = async (character: Character) => {
      return startAgent(character, directClient);
    };

    // Start direct client
    try {
      await directClient.start(serverPort);
      if (serverPort !== parseInt(settings.SERVER_PORT || '3000')) {
        elizaLogger.log(`Server started on alternate port ${serverPort}`);
      }
    } catch (error) {
      elizaLogger.error('Failed to start direct client:', error);
      throw error; // Critical error, should stop the process
    }

    // Start chat if not in daemon mode
    // const isDaemonProcess = process.env.DAEMON_PROCESS === 'true';
    // if (!isDaemonProcess) {
    //   elizaLogger.log("Chat started. Type 'exit' to quit.");
    //   const chat = startChat(characters);
    //   await chat(); // Assuming chat() returns a Promise
    // }
  } catch (error) {
    elizaLogger.error('Critical error in startAgents:', error);
    // Cleanup
    if (directClient) {
      try {
        directClient.stop();
      } catch (cleanupError) {
        elizaLogger.error('Error while stopping direct client:', cleanupError);
      }
    }
    if (logServer) {
      try {
        await logServer.stop();
      } catch (cleanupError) {
        elizaLogger.error('Error while stopping log server:', cleanupError);
      }
    }
    throw error; // Re-throw to trigger process exit
  }
};

// Main execution
process.on('unhandledRejection', (error) => {
  elizaLogger.error('Unhandled Promise Rejection:', error);
  process.exit(1);
});

startAgents().catch((error) => {
  elizaLogger.error('Fatal error in startAgents:', error);
  process.exit(1);
});
