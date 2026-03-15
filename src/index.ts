import * as dotenv from 'dotenv';
import { WebSocketClient } from './websocket';
import { GameStateManager } from './gameState';
import { BotStrategy } from './strategy';
import { ServerGameState, ClientActionMessage, GameOverMessage } from './types';

dotenv.config();

const WS_URL = process.env.WS_URL;

if (!WS_URL) {
  console.error('❌ Error: WS_URL not found in .env file');
  process.exit(1);
}

// Type narrowing after check
const wsUrl: string = WS_URL;

let wsClient: WebSocketClient;
let gameState: GameStateManager;
let strategy: BotStrategy;

async function initialize(): Promise<void> {
  console.log('🤖 Initializing Grocery Bot...\n');

  wsClient = new WebSocketClient(wsUrl);
  gameState = new GameStateManager();

  try {
    await wsClient.connect();
  } catch (error) {
    console.error('✗ Failed to connect:', error);
    process.exit(1);
  }

  strategy = new BotStrategy(gameState);

  // Set up handlers
  wsClient.onGameState(handleGameState);
  wsClient.onGameOver(handleGameOver);

  console.log('Waiting for game state...\n');
}

let lastBotPosition: { x: number; y: number } | null = null;

async function handleGameState(serverState: ServerGameState): Promise<ClientActionMessage> {
  gameState.updateFromServer(serverState);

  const state = gameState.getState();
  const botPos = state.bots[0]?.position;

  // Track position changes
  if (state.round < 15) {
    if (lastBotPosition && (lastBotPosition.x !== botPos?.x || lastBotPosition.y !== botPos?.y)) {
      console.log(`    [POSITION CHANGED] (${lastBotPosition.x},${lastBotPosition.y}) → (${botPos?.x},${botPos?.y})`);
    } else if (lastBotPosition && lastBotPosition.x === botPos?.x && lastBotPosition.y === botPos?.y && state.round > 2) {
      console.log(`    [POSITION SAME] Still at (${botPos?.x},${botPos?.y})`);
    }
  }
  lastBotPosition = botPos ? { x: botPos.x, y: botPos.y } : null;

  // Debug: Log first 15 rounds with full position info
  if (state.round < 15) {
    console.log(
      `Round ${state.round}/${state.maxRound} | Score: ${state.score} | Bot 0 pos: (${state.bots[0]?.position.x}, ${state.bots[0]?.position.y}) | inv: [${state.bots[0]?.inventory.join(', ') || ''}]`
    );
  } else {
    console.log(
      `Round ${state.round}/${state.maxRound} | Score: ${state.score} | Bot 0 pos: (${state.bots[0]?.position.x}, ${state.bots[0]?.position.y})`
    );
  }

  // Debug: Show state details on first round
  if (state.round === 0) {
    console.log('\n📊 Round 0 State:');
    console.log(`  Grid: ${state.gridWidth}x${state.gridHeight}`);
    console.log(`  Total bots: ${state.bots.length}`);
    for (const bot of state.bots) {
      console.log(`    Bot ${bot.id} at (${bot.position.x}, ${bot.position.y}), inventory: [${bot.inventory.join(', ') || '(empty)'}]`);
    }
    console.log(`  Drop-off at: (${state.dropOff.x}, ${state.dropOff.y})`);
    const activeOrders = gameState.getActiveOrders();
    if (activeOrders.length > 0) {
      console.log(`  Active order needs: [${activeOrders[0].items_required.join(', ')}]`);
    }
  }

  // Decide actions for all bots
  const actions = strategy.decideBotActions();

  // CRITICAL: Return response immediately (2-second deadline!)
  // Do logging AFTER return to avoid timeout
  const response = { actions };

  // Schedule logging for later (don't block response)
  setImmediate(() => {
    // Debug: Show all bot actions each round (not just Bot 0)
    console.log(`  [Actions Round ${state.round}] ${actions.length} bots:`);
    for (const action of actions) {
      const bot = state.bots.find(b => b.id === action.bot);
      const invStr = bot?.inventory.length ? `inv: [${bot.inventory.join(', ')}]` : 'inv: []';
      console.log(`    Bot ${action.bot}: ${action.action} | ${invStr}`);
    }

    // Debug: Show all orders each round between round 10-20
    if (state.round > 10 && state.round < 20) {
      console.log(`  Orders: ${JSON.stringify(state.orders.map(o => ({ id: o.id, status: o.status, needed: o.items_required.length - o.items_delivered.length })), null, 0)}`);
    }
  });

  return response;
}

function handleGameOver(data: GameOverMessage): void {
  console.log(`\n✓ Game Over! Final Score: ${data.score} (Round ${data.round})`);
  process.exit(0);
}

function shutdown(): void {
  console.log('\nShutting down...');
  if (wsClient) {
    wsClient.disconnect();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

initialize().catch((error) => {
  console.error('✗ Fatal error:', error);
  process.exit(1);
});
