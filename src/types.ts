// Server game state message
export interface ServerGameState {
  round: number;
  max_round: number;
  grid: { width: number; height: number; walls?: [number, number][] };
  bots: ServerBot[];
  items: ServerItem[];
  orders: ServerOrder[];
  drop_off: [number, number];
  score: number;
  type?: string;
}


export interface ServerBot {
  id: number;
  position: [number, number];
  inventory: string[];
}

export interface ServerItem {
  id: string;
  type: string;
  position: [number, number];
}

export interface ServerOrder {
  id: string;
  status: 'active' | 'preview';
  items_required: string[];
  items_delivered: string[];
}

// Client action message
export interface BotAction {
  bot: number;
  action: 'move_up' | 'move_down' | 'move_left' | 'move_right' | 'pick_up' | 'drop_off' | 'wait';
  item_id?: string;
}

export interface ClientActionMessage {
  actions: BotAction[];
}

// Game over message
export interface GameOverMessage {
  type: 'game_over';
  final_score?: number;
  score: number;
  round: number;
}

// Internal types
export interface Coordinate {
  x: number;
  y: number;
}

export interface BotState {
  id: number;
  position: Coordinate;
  inventory: string[];
}

export interface BotTask {
  bot: number;
  action: string;
  item_id?: string;
}

export interface GameState {
  round: number;
  maxRound: number;
  gridWidth: number;
  gridHeight: number;
  walls: [number, number][];  // Wall positions from server
  bots: BotState[];
  items: Map<string, ServerItem>;
  orders: ServerOrder[];
  dropOff: Coordinate;
  score: number;
}

