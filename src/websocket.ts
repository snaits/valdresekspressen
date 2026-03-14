import WebSocket from 'ws';
import { ServerGameState, GameOverMessage, ClientActionMessage } from './types';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private gameStateHandler?: (state: ServerGameState) => Promise<ClientActionMessage>;
  private gameOverHandler?: (data: GameOverMessage) => void;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('✓ WebSocket connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          const data = typeof event.data === 'string' ? event.data : String(event.data);
          this.handleMessage(data);
        };

        this.ws.onerror = (event) => {
          console.error('✗ WebSocket error:', event);
          reject(new Error('WebSocket connection error'));
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private async handleMessage(data: string): Promise<void> {
    try {
      // Ensure data is a string
      const dataStr = typeof data === 'string' ? data : String(data);
      const message = JSON.parse(dataStr);

      if (message.grid) {
        // This is a game_state message from the server
        if (this.gameStateHandler) {
          const response = await this.gameStateHandler(message);
          // Log the action we're about to send
          if (response.actions && response.actions.length > 0) {
            const action = response.actions[0];
            if (action.action === 'pick_up' || action.action === 'drop_off') {
              console.log(`[SEND] Round ${message.round}: ${action.action} (bot ${action.bot}${action.item_id ? `, item: ${action.item_id}` : ''})`);
            }
          }
          this.send(response);
        }
      } else if (message.type === 'game_over') {
        // This is a game_over message
        if (this.gameOverHandler) {
          this.gameOverHandler(message);
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  onGameState(handler: (state: ServerGameState) => Promise<ClientActionMessage>): void {
    this.gameStateHandler = handler;
  }

  onGameOver(handler: (data: GameOverMessage) => void): void {
    this.gameOverHandler = handler;
  }

  send(message: ClientActionMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('✗ WebSocket not connected');
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
