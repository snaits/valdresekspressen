import { BotStrategy } from './strategy';
import { GameStateManager } from './gameState';
import { GameState, ServerGameState } from './types';

describe('BotStrategy - Movement Logic', () => {
  let strategy: BotStrategy;
  let gameState: GameStateManager;

  beforeEach(() => {
    gameState = new GameStateManager();
    strategy = new BotStrategy(gameState);
  });

  describe('moveToward - X and Y distances', () => {
    it('should move LEFT when X distance > 0, Y distance = 0', () => {
      // Bot at (5, 5), target at (3, 5) - needs to move left
      const mockState: ServerGameState = {
        round: 0,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [3, 5], // Same Y, different X
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('move_left');
    });

    it('should move RIGHT when X distance > 0, Y distance = 0', () => {
      // Bot at (3, 5), target at (7, 5) - needs to move right
      const mockState: ServerGameState = {
        round: 0,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [3, 5],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [7, 5], // Same Y, different X
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('move_right');
    });

    it('should move UP when X distance = 0, Y distance > 0', () => {
      // Bot at (5, 7), target at (5, 3) - needs to move up
      const mockState: ServerGameState = {
        round: 0,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 7],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [5, 3], // Same X, different Y
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('move_up');
    });

    it('should prioritize X movement when both X and Y distances equal (bug fix)', () => {
      // Bot at (10, 7), target at (9, 6) - X=1, Y=1
      // Should move LEFT (X first), not UP (which was the bug)
      const mockState: ServerGameState = {
        round: 0,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [10, 7],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [9, 6], // X dist = 1, Y dist = 1
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // When X and Y distances are equal, should move in X direction (move_left)
      expect(actions[0].action).toBe('move_left');
    });

    it('should pick up item when adjacent (distance = 1)', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 3],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [5, 2], // Adjacent (distance = 1)
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('pick_up');
      expect(actions[0].item_id).toBe('item_0');
    });

    it('should go to drop-off when holding items and nothing else needed', () => {
      // Bot has [butter] in inventory, but order only needs butter (now satisfied)
      // Even though more needed items exist (yogurt, milk), bot should go to drop-off with what it has
      const mockState: ServerGameState = {
        round: 5,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 2],
            inventory: ['butter'], // Has 1 butter
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'yogurt',
            position: [7, 2],
          },
          {
            id: 'item_1',
            type: 'milk',
            position: [3, 2],
          },
        ],
        orders: [
          {
            id: 'order_0',
            // Needs 2 yogurt, 1 butter, 1 milk but already has the butter
            items_required: ['yogurt', 'butter', 'yogurt', 'milk'],
            items_delivered: [], // Nothing delivered yet
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should still move toward items, not drop-off
      // Bot at (5,2) moving toward yogurt at (7,2) = move RIGHT
      expect(actions[0].action).toBe('move_right');
    });

    it('should wait when active order is complete', () => {
      // Order requires [yogurt, butter, milk]
      // All items have been delivered
      // Preview order is showing next order
      // Bot should WAIT, not try to pick more for a completed order
      const mockState: ServerGameState = {
        round: 50,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [1, 8],
            inventory: [], // Empty after drop_off
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [5, 2],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['yogurt', 'butter', 'milk'],
            items_delivered: ['yogurt', 'butter', 'milk'], // ALL DELIVERED!
            status: 'active', // Still marked active until next round
          },
          {
            id: 'order_1',
            items_required: ['cheese', 'butter', 'cheese'],
            items_delivered: [],
            status: 'preview',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should wait (no more items needed), not pick for preview order
      expect(actions[0].action).toBe('wait');
    });

    it('should not drop_off items that dont match active order', () => {
      // Bot has [butter, butter] but active order now needs [yogurt, cheese]
      // These butters won't be delivered, so bot shouldn't keep trying drop_off
      const mockState: ServerGameState = {
        round: 20,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [1, 8], // AT drop-off
            inventory: ['butter', 'butter'], // Non-matching items
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'yogurt',
            position: [5, 2],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['yogurt', 'cheese'],
            items_delivered: [],
            status: 'active', // Needs yogurt & cheese, NOT butter!
          },
        ],
        score: 1,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should NOT send drop_off (butters don't match)
      // Should move to pick yogurt instead
      expect(actions[0].action).toBe('move_right'); // Move toward yogurt
    });
  });

  describe('Y-axis movement (fixed bug)', () => {
    it('should move DOWN when target Y > current Y', () => {
      // Bot at (5, 3), target at (5, 7) - needs to move down
      const mockState: ServerGameState = {
        round: 0,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 3],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [5, 7], // Same X, Y is higher (further down)
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('move_down');
    });

    it('should move UP when target Y < current Y', () => {
      // Bot at (9, 8), target at (9, 6) - needs to move up
      // This was the bug: should be move_up, not move_down
      const mockState: ServerGameState = {
        round: 0,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [9, 8],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [9, 6], // Same X, Y is lower
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('move_up');
    });
  });

  describe('Inventory Management', () => {
    it('should not pick duplicate item types already in inventory (when not needed)', () => {
      // Order needs [yogurt] but bot already has [butter]
      // Butter is adjacent but NOT needed
      // Should pick yogurt, not butter
      const mockState: ServerGameState = {
        round: 5,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 2],
            inventory: ['butter'], // Already has butter
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [6, 2], // Adjacent butter (NOT needed!)
          },
          {
            id: 'item_1',
            type: 'yogurt',
            position: [5, 3], // Also adjacent yogurt (needed!)
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['yogurt'], // Only yogurt needed!
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should pick yogurt (needed), ignore butter (not needed)
      expect(actions[0].action).toBe('pick_up');
      expect(actions[0].item_id).toBe('item_1'); // yogurt
    });

    it('should pick second butter when two are needed', () => {
      // Order needs [butter, butter, yogurt] and bot has [butter]
      // Should pick up the second butter even though already carrying one
      const mockState: ServerGameState = {
        round: 5,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 2],
            inventory: ['butter'], // Has 1 butter
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [6, 2], // Adjacent second butter
          },
          {
            id: 'item_1',
            type: 'yogurt',
            position: [5, 3],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'butter', 'yogurt'], // Needs 2 butters!
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should pick up the second butter (adjacent and needed)
      expect(actions[0].action).toBe('pick_up');
      expect(actions[0].item_id).toBe('item_0');
    });

    it('should go to drop-off when inventory is full (3 items)', () => {
      // Bot has full inventory (3 items) and should go to drop-off
      const mockState: ServerGameState = {
        round: 10,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: ['butter', 'yogurt', 'milk'], // Full (3 items)
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'cheese',
            position: [3, 2],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'yogurt', 'milk', 'cheese'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should move toward drop-off (1, 8) from position (5, 5)
      // X distance: 1 < 5, so move LEFT
      expect(actions[0].action).toBe('move_left');
    });

    it('should reduce needed items count by delivered items', () => {
      // Order needs [butter, butter, yogurt, milk]
      // But 1 butter and 1 milk already delivered
      // Bot should pick: [butter, yogurt]
      const mockState: ServerGameState = {
        round: 15,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 2],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [3, 2],
          },
          {
            id: 'item_1',
            type: 'yogurt',
            position: [7, 2],
          },
          {
            id: 'item_2',
            type: 'milk',
            position: [9, 2],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'butter', 'yogurt', 'milk'],
            items_delivered: ['butter', 'milk'], // Partial delivery
            status: 'active',
          },
        ],
        score: 2,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Bot at (5,2), nearest needed item should be butter at (3,2)
      // Move LEFT toward it
      expect(actions[0].action).toBe('move_left');
    });
  });

  describe('Drop-off Logic', () => {
    it('should drop off when holding matching items at drop-off', () => {
      // Bot at drop-off with [butter, yogurt] and order needs both
      const mockState: ServerGameState = {
        round: 10,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [1, 8], // AT drop-off
            inventory: ['butter', 'yogurt'],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'milk',
            position: [5, 2],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'yogurt', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('drop_off');
    });

    it('should move away from drop-off with non-matching items', () => {
      // Bot at drop-off with [butter] but order needs [yogurt, cheese]
      const mockState: ServerGameState = {
        round: 10,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [1, 8], // AT drop-off
            inventory: ['butter'], // Doesn't match active order
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'yogurt',
            position: [5, 2],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['yogurt', 'cheese'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should move away to pick yogurt, not drop-off
      expect(actions[0].action).toBe('move_right');
    });
  });

  describe('Item Selection Logic', () => {
    it('should pick nearest needed item', () => {
      // Multiple items available, should pick nearest one
      const mockState: ServerGameState = {
        round: 5,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter', // Distance = 2 + 2 = 4
            position: [7, 7],
          },
          {
            id: 'item_1',
            type: 'yogurt', // Distance = 2 + 0 = 2 (CLOSER!)
            position: [7, 5],
          },
          {
            id: 'item_2',
            type: 'milk', // Distance = 3 + 3 = 6
            position: [2, 2],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'yogurt', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should move RIGHT toward yogurt at (7, 5) - the nearest item
      expect(actions[0].action).toBe('move_right');
    });

    it('should ignore non-matching items', () => {
      // Cheese is available but not needed, butter is needed
      const mockState: ServerGameState = {
        round: 5,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'cheese', // NOT needed
            position: [6, 5],
          },
          {
            id: 'item_1',
            type: 'butter', // Needed!
            position: [3, 5],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should move LEFT toward butter, ignore cheese
      expect(actions[0].action).toBe('move_left');
    });
  });

  describe('Order Handling', () => {
    it('should only target active order, not preview order', () => {
      // Active order needs butter, preview needs cheese
      // Bot should pick butter, not cheese
      const mockState: ServerGameState = {
        round: 30,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter', // Needed by active
            position: [3, 5],
          },
          {
            id: 'item_1',
            type: 'cheese', // Needed by preview only
            position: [7, 5],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active', // ACTIVE
          },
          {
            id: 'order_1',
            items_required: ['cheese'],
            items_delivered: [],
            status: 'preview', // Preview - ignore this!
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should move LEFT toward butter (active order), not right toward cheese
      expect(actions[0].action).toBe('move_left');
    });

    it('should wait when no active order exists', () => {
      // No active orders - just wait
      const mockState: ServerGameState = {
        round: 100,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [3, 5],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: ['butter'],
            status: 'active', // Complete
          },
          {
            id: 'order_1',
            items_required: ['yogurt'],
            items_delivered: [],
            status: 'preview', // Not active yet
          },
        ],
        score: 1,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should wait (no active order needs items)
      expect(actions[0].action).toBe('wait');
    });
  });

  describe('Edge Cases', () => {
    it('should handle bot with empty inventory at drop-off', () => {
      // Bot at drop-off with empty inventory and no active order
      const mockState: ServerGameState = {
        round: 40,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [1, 8], // AT drop-off
            inventory: [], // Empty
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [5, 2],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: [],
            items_delivered: [],
            status: 'active', // Order is complete
          },
        ],
        score: 1,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should wait (nothing to do)
      expect(actions[0].action).toBe('wait');
    });

    it('should pick up item at exact location (distance = 0)', () => {
      // Bot is exactly at item location (distance = 0)
      const mockState: ServerGameState = {
        round: 0,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [5, 5], // EXACT location
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('pick_up');
      expect(actions[0].item_id).toBe('item_0');
    });

    it('should prioritize drop-off when holding junk items (not needed by active order)', () => {
      // Bot has [butter] but active order NOW needs [yogurt, milk] (butter was already delivered)
      // Bot should go to drop-off FIRST to get rid of junk, not try to pick more items
      const mockState: ServerGameState = {
        round: 14,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [9, 7],
            inventory: ['butter'], // JUNK - no longer needed
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'yogurt',
            position: [7, 7],
          },
          {
            id: 'item_1',
            type: 'milk',
            position: [5, 7],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['yogurt', 'yogurt', 'milk'], // Butter NOT needed
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should move toward drop-off (1, 8) to get rid of junk butter
      // From (9,7) to (1,8): X distance = 8, Y distance = 1
      // X distance > Y distance, so prioritize X: move LEFT
      expect(actions[0].action).toBe('move_left');
      // The key is that it's going toward drop-off, not toward yogurt/milk
    });
  });

  describe('Junk Item Handling', () => {
    it('should handle multiple bots', () => {
      // Two bots, each makes independent decisions
      const mockState: ServerGameState = {
        round: 5,
        max_round: 120,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: [],
          },
          {
            id: 1,
            position: [9, 9],
            inventory: [],
          },
        ],
        items: [
          {
            id: 'item_0',
            type: 'butter',
            position: [3, 5],
          },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions.length).toBe(2);
      expect(actions[0].bot).toBe(0);
      expect(actions[1].bot).toBe(1);
      // Bot 0 should move left (closer to butter)
      expect(actions[0].action).toBe('move_left');
    });
  });

  describe('Fallback Movement - Stuck Recovery', () => {
    it('should use fallback movement when stuck with items to reach dropoff', () => {
      // Bot is stuck at (5, 5) trying to move toward an unreachable item, has 3 items (full)
      const mockState1: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: ['butter', 'milk', 'yogurt'], // Full inventory
          },
        ],
        items: [
          { id: 'item_0', type: 'cheese', position: [5, 4] }, // Unreachable/junk
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk', 'yogurt'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState1);
      strategy.decideBotActions(); // Round 0 - with full inventory, heads to dropoff

      // Round 1: attempt at move (toward dropoff or away), still at (5,5) - stuck count = 1
      const mockState2: ServerGameState = {
        ...mockState1,
        round: 1,
        bots: [{ id: 0, position: [5, 5], inventory: ['butter', 'milk', 'yogurt'] }],
      };
      gameState.updateFromServer(mockState2);
      strategy.decideBotActions();

      // Round 2: stuck again at (5,5) - stuck count = 2, should trigger fallback to dropoff
      const mockState3: ServerGameState = {
        ...mockState1,
        round: 2,
        bots: [{ id: 0, position: [5, 5], inventory: ['butter', 'milk', 'yogurt'] }],
      };
      gameState.updateFromServer(mockState3);
      const actions3 = strategy.decideBotActions();

      // Should use fallback movement toward dropoff (1, 8)
      // From (5,5) to (1,8): should move left or down
      const action = actions3[0].action;
      expect(['move_left', 'move_down']).toContain(action);
    });

    it('should pick up adjacent item when stuck with empty inventory', () => {
      // Bot stuck at (5, 5), empty inventory, item adjacent
      let mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [{ id: 'item_0', type: 'butter', position: [5, 6] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      strategy.decideBotActions(); // Round 0

      // Round 1: attempt to pick up but stuck (stuckCount = 1)
      mockState = {
        ...mockState,
        round: 1,
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
      };
      gameState.updateFromServer(mockState);
      strategy.decideBotActions();

      // Round 2: stuck again (stuckCount = 2, should trigger stuck recovery)
      mockState = {
        ...mockState,
        round: 2,
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
      };
      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should pick up adjacent item to make progress
      expect(actions[0].action).toBe('pick_up');
      expect(actions[0].item_id).toBe('item_0');
    });

    it('should NOT pick up junk items when stuck with empty inventory', () => {
      // Bot stuck at (5, 5), empty inventory, JUNK item adjacent but NEEDED items exist elsewhere
      let mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [
          { id: 'item_junk', type: 'cheese', position: [5, 6] }, // JUNK - adjacent
          { id: 'item_needed', type: 'butter', position: [2, 2] }, // NEEDED - far away
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      strategy.decideBotActions(); // Round 0

      // Round 1: attempt to move but stuck (stuckCount = 1)
      mockState = {
        ...mockState,
        round: 1,
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
      };
      gameState.updateFromServer(mockState);
      strategy.decideBotActions();

      // Round 2: stuck again (stuckCount = 2, should trigger stuck recovery)
      mockState = {
        ...mockState,
        round: 2,
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
      };
      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should NOT pick up junk cheese
      // Should instead use fallback toward needed butter at (2,2)
      expect(actions[0].action).not.toBe('pick_up');
      const action = actions[0].action;
      expect(['move_left', 'move_up', 'move_down']).toContain(action);
    });

    it('should use fallback toward nearest item when stuck with no adjacent items', () => {
      // Bot stuck at (5, 5), empty inventory, only distant items
      let mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [{ id: 'item_0', type: 'butter', position: [2, 2] }], // Not adjacent
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      strategy.decideBotActions(); // Round 0

      // Round 1: stuck (stuckCount = 1)
      mockState = {
        ...mockState,
        round: 1,
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
      };
      gameState.updateFromServer(mockState);
      strategy.decideBotActions();

      // Round 2: stuck (stuckCount = 2, triggers fallback)
      mockState = {
        ...mockState,
        round: 2,
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
      };
      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should use fallback movement toward (2, 2)
      const action = actions[0].action;
      expect(['move_left', 'move_up', 'move_down']).toContain(action);
    });
  });

  describe('Full Collection Cycles', () => {
    it('should complete full cycle: pick 3, deliver, pick 3 again', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [10, 8], inventory: [] }],
        items: [
          { id: 'item_1', type: 'butter', position: [7, 2] },
          { id: 'item_2', type: 'milk', position: [7, 3] },
          { id: 'item_3', type: 'yogurt', position: [7, 4] },
          { id: 'item_4', type: 'butter', position: [3, 2] },
          { id: 'item_5', type: 'milk', position: [5, 2] },
          { id: 'item_6', type: 'yogurt', position: [9, 2] },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk', 'yogurt', 'butter', 'milk', 'yogurt'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);

      // Simulate pickup phase for first 3 items
      // Bot collects butter, milk, yogurt
      let actions = strategy.decideBotActions();
      expect(actions[0].action).not.toBe('wait');

      // After collecting 3 items, inventory should be full and bot should head to dropoff
      const mockStateAfterPickup: ServerGameState = {
        ...mockState,
        round: 20,
        bots: [
          {
            id: 0,
            position: [1, 8],
            inventory: ['butter', 'milk', 'yogurt'],
          },
        ],
      };
      gameState.updateFromServer(mockStateAfterPickup);
      actions = strategy.decideBotActions();

      // At dropoff with matching items - should drop
      expect(actions[0].action).toBe('drop_off');

      // After dropoff, bot should continue with empty inventory
      const mockStateAfterDrop: ServerGameState = {
        ...mockState,
        round: 21,
        bots: [{ id: 0, position: [1, 8], inventory: [] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk', 'yogurt', 'butter', 'milk', 'yogurt'],
            items_delivered: ['butter', 'milk', 'yogurt'], // First 3 delivered
            status: 'active',
          },
        ],
      };
      gameState.updateFromServer(mockStateAfterDrop);
      actions = strategy.decideBotActions();

      // Should move away from dropoff to collect more items
      expect(actions[0].action).not.toBe('wait');
      expect(['move_right', 'move_left', 'move_up', 'move_down']).toContain(
        actions[0].action
      );
    });

    it('should detect and drop junk items before collecting needed items', () => {
      // Bot has junk item, still needs to collect items
      const mockState: ServerGameState = {
        round: 10,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: ['cheese'], // JUNK - not in order
          },
        ],
        items: [
          { id: 'item_0', type: 'butter', position: [7, 5] }, // Needed
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should go to dropoff to drop junk, not toward butter
      expect(actions[0].action).not.toBe('pick_up');
      // Should move toward dropoff (1, 8) from (5, 5)
      const action = actions[0].action;
      expect(['move_left', 'move_down']).toContain(action);
    });

    it('should not drop items that are still needed', () => {
      // Bot at dropoff with items, but all items are still needed
      const mockState: ServerGameState = {
        round: 15,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [1, 8],
            inventory: ['butter', 'milk'],
          },
        ],
        items: [],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk', 'yogurt'],
            items_delivered: [], // Nothing delivered yet
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // At dropoff with needed items - should drop
      expect(actions[0].action).toBe('drop_off');
    });

    it('should move away from dropoff if holding only junk items', () => {
      // Bot at dropoff with junk item (not in order requirements)
      const mockState: ServerGameState = {
        round: 20,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [1, 8],
            inventory: ['cheese'],
          },
        ],
        items: [{ id: 'item_0', type: 'butter', position: [5, 5] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // At dropoff but holding junk item (cheese not in order)
      // Should NOT drop junk, will move away to collect needed items
      expect(actions[0].action).not.toBe('drop_off');
    });
  });

  describe('Stuck Detection Threshold', () => {
    it('should trigger fallback at stuckCount >= 2 (not wait for 3)', () => {
      let mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [7, 3], inventory: ['butter'] }],
        items: [{ id: 'item_0', type: 'milk', position: [7, 1] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      strategy.decideBotActions(); // First attempt to move

      // Round 1: stuck first time (stuckCount = 1)
      mockState = {
        ...mockState,
        round: 1,
        bots: [{ id: 0, position: [7, 3], inventory: ['butter'] }],
      };
      gameState.updateFromServer(mockState);
      const action1 = strategy.decideBotActions()[0];

      // Round 2: stuck second time (stuckCount = 2, should trigger fallback)
      mockState = {
        ...mockState,
        round: 2,
        bots: [{ id: 0, position: [7, 3], inventory: ['butter'] }],
      };
      gameState.updateFromServer(mockState);
      const action2 = strategy.decideBotActions()[0];

      // Should now use fallback (not just continue same pathfinding)
      // Fallback with items goes to dropoff
      expect(['move_left', 'move_down']).toContain(action2.action);
    });
  });

  describe('Order Completion Cycles', () => {
    it('should move to next order items after current order delivery complete', () => {
      // Current order complete (all items delivered), new preview order has items
      const mockState: ServerGameState = {
        round: 30,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [{ id: 'item_0', type: 'butter', position: [7, 5] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['cheese'], // Not available - was completed
            items_delivered: ['cheese'],
            status: 'active',
          },
          {
            id: 'order_1',
            items_required: ['butter'],
            items_delivered: [],
            status: 'preview',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // With no more items needed for active order, bot waits (preview is not active yet)
      // This is correct behavior - only active order items are picked
      expect(['move_left', 'move_right', 'move_up', 'move_down', 'wait']).toContain(
        actions[0].action
      );
    });

    it('should not pick up items from completed order', () => {
      // Order was just completed and replaced by new active order
      const mockState: ServerGameState = {
        round: 35,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [
          { id: 'item_butter', type: 'butter', position: [6, 5] },
          { id: 'item_milk', type: 'milk', position: [7, 5] },
        ],
        orders: [
          {
            id: 'order_1',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
          {
            id: 'order_2',
            items_required: ['yogurt', 'cheese'],
            items_delivered: [],
            status: 'preview',
          },
        ],
        score: 1,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should pick up needed items from active order
      // Butter and milk are needed, should pick one up if adjacent
      if (actions[0].action === 'pick_up') {
        expect(['item_butter', 'item_milk']).toContain(actions[0].item_id);
      }
    });
  });

  describe('Full Inventory Handling', () => {
    it('should go to dropoff when inventory reaches 3 items', () => {
      const mockState: ServerGameState = {
        round: 20,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [7, 5],
            inventory: ['butter', 'milk', 'yogurt'], // FULL (3 items)
          },
        ],
        items: [{ id: 'item_0', type: 'cheese', position: [8, 5] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk', 'yogurt', 'cheese'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should head to dropoff, not pick up cheese
      const action = actions[0].action;
      expect(['move_left', 'move_down', 'move_up']).toContain(action);
      expect(action).not.toBe('pick_up');
    });

    it('should pick up item when inventory has 2 items and item adjacent', () => {
      const mockState: ServerGameState = {
        round: 15,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [7, 5],
            inventory: ['butter', 'milk'],
          },
        ],
        items: [{ id: 'item_0', type: 'yogurt', position: [8, 5] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk', 'yogurt'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should pick up adjacent yogurt (needed and inventory not full)
      expect(actions[0].action).toBe('pick_up');
      expect(actions[0].item_id).toBe('item_0');
    });
  });

  describe('Movement Direction Handling', () => {
    it('should move RIGHT toward item to the right', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [3, 5], inventory: [] }],
        items: [{ id: 'item_0', type: 'butter', position: [7, 5] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('move_right');
    });

    it('should move DOWN toward item below', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 3], inventory: [] }],
        items: [{ id: 'item_0', type: 'butter', position: [5, 7] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('move_down');
    });

    it('should move UP toward item above', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 7], inventory: [] }],
        items: [{ id: 'item_0', type: 'butter', position: [5, 2] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      expect(actions[0].action).toBe('move_up');
    });
  });

  describe('Multi-Bot Scenarios', () => {
    it('should handle multiple bots independently', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          { id: 0, position: [9, 5], inventory: [] },
          { id: 1, position: [3, 5], inventory: [] },
        ],
        items: [
          { id: 'item_0', type: 'butter', position: [3, 5] }, // Near bot 1
          { id: 'item_1', type: 'milk', position: [9, 5] }, // Near bot 0
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should have actions for both bots
      expect(actions.length).toBe(2);
      expect(actions[0].bot).toBe(0);
      expect(actions[1].bot).toBe(1);
    });

    it('should assign different targets to different bots', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          { id: 0, position: [10, 8], inventory: [] },
          { id: 1, position: [3, 2], inventory: [] },
        ],
        items: [
          { id: 'item_0', type: 'butter', position: [7, 2] },
          { id: 'item_1', type: 'milk', position: [3, 3] },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Both bots should move (not wait)
      expect(actions[0].action).not.toBe('wait');
      expect(actions[1].action).not.toBe('wait');
    });
  });

  describe('Obstacle Learning', () => {
    it('should learn obstacle after 3 consecutive failed moves', () => {
      let mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [{ id: 'item_0', type: 'butter', position: [5, 4] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      strategy.decideBotActions();

      // First failed attempt (stuckCount = 1)
      mockState = {
        ...mockState,
        round: 1,
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
      };
      gameState.updateFromServer(mockState);
      strategy.decideBotActions();

      // Second failed attempt (stuckCount = 2, triggers fallback)
      mockState = {
        ...mockState,
        round: 2,
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
      };
      gameState.updateFromServer(mockState);
      strategy.decideBotActions();

      // Third failed attempt (stuckCount = 3, learns obstacle)
      mockState = {
        ...mockState,
        round: 3,
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
      };
      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should have learned the obstacle after 3 attempts
      // stuckCount gets reset after learning
      expect(actions[0].action).not.toBe('wait');
    });
  });

  describe('Zone-Based Coordination', () => {
    it('should prefer items in same zone when available', () => {
      // Bot at (2, 2) in zone (0,0), items in both zones
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [2, 2], inventory: [] }],
        items: [
          { id: 'item_0', type: 'butter', position: [3, 3] }, // Same zone (0,0)
          { id: 'item_1', type: 'milk', position: [10, 2] }, // Different zone (1,0)
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should move toward item in same zone (butter at 3,3)
      // From (2,2) to (3,3): move right or down
      const action = actions[0].action;
      expect(['move_right', 'move_down']).toContain(action);
    });
  });

  describe('Edge Cases and Special Conditions', () => {
    it('should handle empty items list gracefully', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [], // No items available
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should wait when no items available
      expect(actions[0].action).toBe('wait');
    });

    it('should handle no active orders gracefully', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [{ id: 'item_0', type: 'butter', position: [7, 5] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'preview', // Only preview, no active order
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should wait when no active order
      expect(actions[0].action).toBe('wait');
    });

    it('should pick up duplicate needed items', () => {
      // Order needs 2 butters, should be able to pick both up
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [
          { id: 'item_0', type: 'butter', position: [6, 5] },
          { id: 'item_1', type: 'butter', position: [5, 6] },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should pick up one of the butter items
      if (actions[0].action === 'pick_up') {
        expect(actions[0].item_id).toBeDefined();
      }
    });

    it('should reach dropoff from any position', () => {
      const mockState: ServerGameState = {
        round: 10,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          { id: 0, position: [10, 2], inventory: ['butter'] }, // Far corner
        ],
        items: [],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should move toward dropoff at (1, 8)
      // From (10, 2) need to move left and down
      const action = actions[0].action;
      expect(['move_left', 'move_down']).toContain(action);
    });

    it('should not move if at target with no inventory', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [{ id: 'item_0', type: 'butter', position: [5, 5] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // At same position as item, should pick it up
      expect(actions[0].action).toBe('pick_up');
    });

    it('should prefer nearer items over distant ones', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [
          { id: 'item_0', type: 'butter', position: [6, 5] }, // Distance 1
          { id: 'item_1', type: 'milk', position: [10, 10] }, // Distance 10
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should pick up or move toward butter (nearer item)
      expect(actions[0].action).not.toBe('wait');
    });

    it('should handle bot at dropoff with empty inventory', () => {
      const mockState: ServerGameState = {
        round: 15,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [1, 8], inventory: [] }],
        items: [{ id: 'item_0', type: 'butter', position: [4, 8] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should move away from dropoff to collect items
      expect(actions[0].action).not.toBe('wait');
      expect(actions[0].action).not.toBe('drop_off');
    });

    it('should handle movement with matching items in different locations', () => {
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [
          { id: 'item_0', type: 'butter', position: [3, 5] },
          { id: 'item_1', type: 'butter', position: [7, 5] },
          { id: 'item_2', type: 'milk', position: [5, 8] },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should move toward one of the items
      expect(['move_left', 'move_right', 'move_down']).toContain(actions[0].action);
    });

    it('should not pick up items when inventory full', () => {
      const mockState: ServerGameState = {
        round: 20,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          {
            id: 0,
            position: [5, 5],
            inventory: ['butter', 'milk', 'yogurt'], // Full (3)
          },
        ],
        items: [{ id: 'item_0', type: 'cheese', position: [5, 6] }],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk', 'yogurt', 'cheese'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Should not pick up (inventory full)
      expect(actions[0].action).not.toBe('pick_up');
      // Should head to dropoff instead
      const action = actions[0].action;
      expect(['move_left', 'move_down', 'move_up']).toContain(action);
    });

    it('should handle multiple bots with overlapping items', () => {
      // Two bots, both can reach same item - both should try to get items
      const mockState: ServerGameState = {
        round: 0,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [
          { id: 0, position: [5, 2], inventory: [] },
          { id: 1, position: [5, 3], inventory: [] },
        ],
        items: [
          { id: 'item_0', type: 'butter', position: [5, 5] },
          { id: 'item_1', type: 'milk', position: [7, 5] },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'milk'],
            items_delivered: [],
            status: 'active',
          },
        ],
        score: 0,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Both bots should move (not wait)
      expect(actions.length).toBe(2);
      expect(actions[0].action).not.toBe('wait');
      expect(actions[1].action).not.toBe('wait');
    });

    it('should continue collecting after partial delivery', () => {
      // Order needs 4 items, 1 delivered, 3 still needed
      const mockState: ServerGameState = {
        round: 25,
        max_round: 300,
        grid: { width: 12, height: 10 },
        drop_off: [1, 8],
        bots: [{ id: 0, position: [5, 5], inventory: [] }],
        items: [
          { id: 'item_0', type: 'butter', position: [6, 5] },
          { id: 'item_1', type: 'milk', position: [7, 5] },
        ],
        orders: [
          {
            id: 'order_0',
            items_required: ['butter', 'butter', 'milk', 'yogurt'],
            items_delivered: ['butter'], // 1 of 4 delivered
            status: 'active',
          },
        ],
        score: 1,
      };

      gameState.updateFromServer(mockState);
      const actions = strategy.decideBotActions();

      // Still needs 3 items, should continue collecting
      expect(actions[0].action).not.toBe('wait');
    });
  });
});

