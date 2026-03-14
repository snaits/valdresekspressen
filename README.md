# Grocery Bot

AI-powered warehouse delivery bot that plays a grid-based grocery collection game via WebSocket.

## Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)

## Setup

1. **Clone or navigate to the repository:**
   ```bash
   cd Nmai-grocerybot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure the WebSocket URL:**
   - Create or update `.env` file in the project root
   - Add your game server WebSocket URL:
     ```
     WS_URL=wss://game.ainm.no/ws?token=<your_jwt_token>
     ```

## Running the Bot

**Development (with TypeScript compilation on-the-fly):**
```bash
npm run dev
```

**Production (compile first, then run):**
```bash
npm run build
npm start
```

## Running Tests

**Run all tests:**
```bash
npm test
```

**Watch mode (re-run tests on file changes):**
```bash
npm run test:watch
```

Currently 56 tests covering:
- Strategy decision logic (24 tests)
- Pathfinding algorithm (32 tests)

## Project Structure

```
src/
├── index.ts           # Main entry point - WebSocket client and game loop
├── strategy.ts        # Bot decision logic and order management
├── pathfinding.ts     # BFS pathfinding algorithm for obstacle navigation
├── gameState.ts       # Game state tracking and updates
├── websocket.ts       # WebSocket client implementation
├── types.ts           # Shared TypeScript type definitions
├── strategy.test.ts   # Strategy tests
└── pathfinding.test.ts # Pathfinding tests
```

## Key Features

- **Smart Pathfinding**: BFS algorithm navigates around obstacles and other bots
- **Junk Detection**: Removes unneeded items to make room for order requirements
- **Stuck Recovery**: Detects failed movements and learns blocked cells
- **Order Management**: Tracks active orders and item delivery requirements

## Debug Logging

The bot logs game state and decisions to console. Logging is non-blocking and won't affect the 2-second WebSocket response deadline.

Early rounds (0-15) show detailed logs including:
- Bot position and inventory
- Item locations and requirements
- Movement decisions and paths

Later rounds show consolidated output to reduce noise.
