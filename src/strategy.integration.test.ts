import { BotStrategy } from './strategy';
import { GameStateManager } from './gameState';
import { ServerGameState } from './types';

/**
 * Integration test: Simulate multi-round game scenarios with server data
 * This lets us verify the strategy works correctly over time without needing full game runs
 */

describe('BotStrategy - Multi-Round Integration Tests', () => {
  it('should clear depot when stuck with non-matching items and bot blocking escape', () => {
    // Scenario: Bot 0 gets stuck at depot with eggs+milk while bot 2 blocks the escape path
    // Bot 2 should pathfind to DROPOFF to clear junk, freeing the path

    const gameState = new GameStateManager();
    const strategy = new BotStrategy(gameState);

    // Round 105: Bot 0 successfully drops first batch and starts collecting wrong items for new order
    const round105: ServerGameState = {
      round: 105,
      max_round: 300,
      grid: { width: 13, height: 11 },
      drop_off: [1, 10],
      bots: [
        { id: 0, position: [1, 10], inventory: ['eggs', 'milk', 'cheese'] }, // At dropoff, needs to escape
        { id: 1, position: [12, 4], inventory: ['cheese'] },
        { id: 2, position: [2, 10], inventory: ['eggs', 'eggs', 'milk'] }, // Blocking path, has junk
      ],
      items: [
        { id: 'pasta_1', type: 'pasta', position: [5, 5] },
        { id: 'pasta_2', type: 'pasta', position: [7, 3] },
        { id: 'yogurt_1', type: 'yogurt', position: [10, 8] },
      ],
      orders: [
        {
          id: 'order_0',
          items_required: ['pasta', 'pasta', 'yogurt'],
          items_delivered: ['eggs', 'milk', 'cheese'],
          status: 'active',
        },
      ],
      score: 10,
    };

    gameState.updateFromServer(round105);
    let actions = strategy.decideBotActions();

    // Bot 0 at dropoff with non-matching items should MOVE AWAY to escape
    expect(actions[0].action).not.toBe('drop_off'); // Can't drop useless items
    expect(['move_up', 'move_down', 'move_left', 'move_right']).toContain(actions[0].action);
    console.log(`Round 105 - Bot 0 at dropoff moves: ${actions[0].action}`);

    // Bot 2 with FULL junk inventory should PATHFIND TO DROPOFF to clear junk
    // (If it does this, it frees path for Bot 0)
    expect(actions[2].action).not.toBe('wait'); // Should NOT wait
    console.log(`Round 105 - Bot 2 with junk should move: ${actions[2].action}`);
  });

  it('should allow empty bot to pick up assigned items without being blocked', () => {
    const gameState = new GameStateManager();
    const strategy = new BotStrategy(gameState);

    const state: ServerGameState = {
      round: 50,
      max_round: 300,
      grid: { width: 13, height: 11 },
      drop_off: [1, 10],
      bots: [
        { id: 0, position: [5, 5], inventory: [] }, // Empty, can collect
        { id: 1, position: [8, 8], inventory: ['eggs'] },
        { id: 2, position: [3, 3], inventory: [] },
      ],
      items: [
        { id: 'eggs_1', type: 'eggs', position: [6, 5] },
        { id: 'eggs_2', type: 'eggs', position: [4, 5] },
        { id: 'milk_1', type: 'milk', position: [5, 6] },
      ],
      orders: [
        {
          id: 'order_0',
          items_required: ['eggs', 'eggs', 'milk'],
          items_delivered: [],
          status: 'active',
        },
      ],
      score: 0,
    };

    gameState.updateFromServer(state);
    const actions = strategy.decideBotActions();

    // Bot 0 empty - should pick up or move toward eggs
    expect(actions[0].action).not.toBe('wait');
    console.log(`Bot 0 empty action: ${actions[0].action}`);
  });

  it('should prioritize clearing junk before collecting new items', () => {
    const gameState = new GameStateManager();
    const strategy = new BotStrategy(gameState);

    // Bot with 2 items from old order + 1 junk = full inventory of wrong types
    const state: ServerGameState = {
      round: 20,
      max_round: 300,
      grid: { width: 13, height: 11 },
      drop_off: [1, 10],
      bots: [
        { id: 0, position: [5, 5], inventory: ['eggs', 'eggs', 'milk'] }, // Full, non-matching
        { id: 1, position: [8, 8], inventory: [] },
        { id: 2, position: [3, 3], inventory: [] },
      ],
      items: [
        { id: 'pasta_1', type: 'pasta', position: [6, 5] },
        { id: 'pasta_2', type: 'pasta', position: [4, 5] },
        { id: 'yogurt_1', type: 'yogurt', position: [5, 6] },
      ],
      orders: [
        {
          id: 'order_0',
          items_required: ['pasta', 'pasta', 'yogurt'],
          items_delivered: [],
          status: 'active',
        },
      ],
      score: 0,
    };

    gameState.updateFromServer(state);
    const actions = strategy.decideBotActions();

    // Bot 0 should pathfind to DROPOFF, not try to pick up more items
    expect(actions[0].action).not.toBe('pick_up');
    console.log(`Bot 0 with full junk inventory action: ${actions[0].action}`);
    // Should be moving toward dropoff
    expect(['move_up', 'move_down', 'move_left', 'move_right']).toContain(actions[0].action);
  });
});
