import { ServerGameState, BotState, GameState, Coordinate, ServerItem } from './types';

export class GameStateManager {
  private state: GameState = {
    round: 0,
    maxRound: 0,
    gridWidth: 0,
    gridHeight: 0,
    walls: [],  // Will be populated from server
    bots: [],
    items: new Map(),
    orders: [],
    dropOff: { x: 0, y: 0 },
    score: 0,
  };

  updateFromServer(serverState: ServerGameState): void {
    this.state.round = serverState.round;
    this.state.maxRound = serverState.max_round;
    this.state.gridWidth = serverState.grid.width;
    this.state.gridHeight = serverState.grid.height;
    this.state.walls = serverState.grid.walls || [];  // Extract walls from grid
    this.state.dropOff = { x: serverState.drop_off[0], y: serverState.drop_off[1] };
    this.state.score = serverState.score;

    // Update bots
    this.state.bots = serverState.bots.map((bot) => ({
      id: bot.id,
      position: { x: bot.position[0], y: bot.position[1] },
      inventory: bot.inventory,
    }));

    // Update items - store the full ServerItem
    this.state.items.clear();
    for (const item of serverState.items) {
      this.state.items.set(item.id, item);
    }

    // Update orders
    this.state.orders = serverState.orders;
  }

  getState(): GameState {
    return this.state;
  }

  getBots(): BotState[] {
    return this.state.bots;
  }

  getBot(botId: number): BotState | undefined {
    return this.state.bots.find((b) => b.id === botId);
  }

  getActiveOrders() {
    return this.state.orders.filter((o) => o.status === 'active');
  }

  getItemPosition(itemId: string): Coordinate | undefined {
    const item = this.state.items.get(itemId);
    return item ? { x: item.position[0], y: item.position[1] } : undefined;
  }

  getItemsByType(itemType: string): ServerItem[] {
    return Array.from(this.state.items.values()).filter((item) => item.type === itemType);
  }

  getDropOff(): Coordinate {
    return this.state.dropOff;
  }

  distance(pos1: Coordinate, pos2: Coordinate): number {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
  }

  getDirectPath(from: Coordinate, to: Coordinate): string[] {
    const actions: string[] = [];
    let x = from.x;
    let y = from.y;

    while (x !== to.x) {
      if (x < to.x) {
        actions.push('move_right');
        x++;
      } else {
        actions.push('move_left');
        x--;
      }
    }

    while (y !== to.y) {
      if (y < to.y) {
        actions.push('move_down');
        y++;
      } else {
        actions.push('move_up');
        y--;
      }
    }

    return actions;
  }
}
