import { BotAction, Coordinate } from './types';
import { GameStateManager } from './gameState';
import { Pathfinder } from './pathfinding';

export class BotStrategy {
  private gameState: GameStateManager;
  private pathfinder: Pathfinder;
  private lastBotStates: Map<number, { pos: [number, number], action: string, stuckCount: number }> = new Map();
  private lastOrderId: string | undefined;

  constructor(gameState: GameStateManager) {
    this.gameState = gameState;
    this.pathfinder = new Pathfinder();
  }

  decideBotActions(): BotAction[] {
    const actions: BotAction[] = [];
    const bots = this.gameState.getBots();
    const state = this.gameState.getState();
    const dropOff = this.gameState.getDropOff();

    for (const bot of bots) {
      const action = this.decideAction(bot, state, dropOff);
      actions.push(action);

      // Save bot state for next round (to detect stuck moves)
      this.lastBotStates.set(bot.id, {
        pos: [bot.position.x, bot.position.y],
        action: action.action,
        stuckCount: this.lastBotStates.get(bot.id)?.stuckCount || 0,
      });
    }

    return actions;
  }

  private decideAction(bot: any, state: any, dropOff: Coordinate): BotAction {
    const [x, y] = [bot.position.x, bot.position.y];

    // Find active order first
    const activeOrder = state.orders.find((o: any) => o.status === 'active');

    // Clear blocked cells when order changes (new items on map)
    const currentOrderId = activeOrder?.id;
    if (!this.lastOrderId || this.lastOrderId !== currentOrderId) {
      this.pathfinder.clearBlockedCells();
      this.lastOrderId = currentOrderId;
      if (state.round >= 10) {
        console.log(`  [DEBUG] Order changed to ${currentOrderId} - cleared blocked cells`);
      }
    }

    // Detect stuck moves and learn obstacles
    let obstacleDiscovered = false;
    const lastState = this.lastBotStates.get(bot.id);
    if (lastState) {
      const isSamePos = lastState.pos[0] === x && lastState.pos[1] === y;

      if (isSamePos && lastState.action.startsWith('move_')) {
        // We made a move but didn't change position - obstacle discovered!
        lastState.stuckCount++;

        // Determine what cell we tried to move to
        let blockedX = x;
        let blockedY = y;

        if (lastState.action === 'move_up') blockedY = y - 1;
        else if (lastState.action === 'move_down') blockedY = y + 1;
        else if (lastState.action === 'move_left') blockedX = x - 1;
        else if (lastState.action === 'move_right') blockedX = x + 1;

        if (lastState.stuckCount >= 3) {
          // Failed 3+ times, definitely blocked
          this.pathfinder.blockCell(blockedX, blockedY);
          if (state.round >= 290) {
            console.log(`  [DEBUG Bot ${bot.id}] OBSTACLE LEARNED at (${blockedX},${blockedY}) after ${lastState.stuckCount} attempts`);
          }
          lastState.stuckCount = 0; // Reset for next obstacle
          obstacleDiscovered = true;
        }
      } else if (!isSamePos) {
        // Movement succeeded, reset stuck counter
        lastState.stuckCount = 0;
      }
    }

    // If at drop-off with items, check if they match the active order before dropping
    if (bot.inventory.length > 0 && x === dropOff.x && y === dropOff.y) {
      if (activeOrder) {
        // Only drop if we have items that match the active order requirements
        const itemsNeeded = [...activeOrder.items_required];
        const hasMatchingItem = bot.inventory.some((item: string) => itemsNeeded.includes(item));
        if (hasMatchingItem) {
          return { bot: bot.id, action: 'drop_off' };
        }
        // If we're holding items that don't match, no point dropping them here
        // Fall through to other logic to use/move
      } else {
        // No active order, just drop everything
        return { bot: bot.id, action: 'drop_off' };
      }
    }

    // If inventory full (3 items), go to drop-off
    if (bot.inventory.length >= 3) {
      return this.pathfinder.moveTowardWithPath(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots);
    }

    // Active order was already found above, check if it exists
    if (!activeOrder) {
      // No orders, wait or go drop off if holding anything
      if (bot.inventory.length > 0) {
        return this.pathfinder.moveTowardWithPath(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots);
      }
      return { bot: bot.id, action: 'wait' };
    }

    // Figure out what items are still needed
    const needed: string[] = [...activeOrder.items_required];
    for (const delivered of activeOrder.items_delivered) {
      const idx = needed.indexOf(delivered);
      if (idx > -1) {
        needed.splice(idx, 1);
      }
    }

    // Remove items we're already carrying from the needed list
    for (const carrying of bot.inventory) {
      const idx = needed.indexOf(carrying);
      if (idx > -1) {
        needed.splice(idx, 1);
      }
    }

    // Log what we're looking for on first round
    if (state.round === 0) {
      console.log(`  Still needed (${needed.length}): [${needed.map(n => `"${n}"`).join(', ')}]`);
      console.log(`  Available items:`);
      for (const item of state.items.values()) {
        const matches = needed.includes(item.type);
        console.log(`    "${item.type}" at (${item.position[0]}, ${item.position[1]}) - matches: ${matches}`);
      }
    }

    // Try to pick up adjacent items first (even if carrying junk)
    for (const item of state.items.values()) {
      if (needed.includes(item.type)) {
        const [ix, iy] = item.position;
        const dist = Math.abs(ix - x) + Math.abs(iy - y);

        // If adjacent or at location, pick up
        if (dist <= 1) {
          if (state.round <= 2) {
            console.log(`  [Bot ${bot.id}] Picking up "${item.type}" at (${ix}, ${iy}) - dist: ${dist}`);
          }
          return { bot: bot.id, action: 'pick_up', item_id: item.id };
        }
      }
    }

    // Check if carrying junk items (items NOT in the active order at all)
    const junkItems = bot.inventory.filter((item: string) => !activeOrder.items_required.includes(item));

    // If carrying junk and there are still items to pick AND not at drop-off, go drop junk first
    if (junkItems.length > 0 && !(x === dropOff.x && y === dropOff.y) && needed.length > 0) {
      if (state.round >= 10) {
        console.log(`  [DEBUG Bot ${bot.id}] JUNK DETECTED! Inventory: [${bot.inventory.join(', ')}] | Order items_required: [${activeOrder.items_required.join(', ')}] | Junk: [${junkItems.join(', ')}]`);
      }
      return this.pathfinder.moveTowardWithPath(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots);
    }

    // Debug: if at (9,7) and not moving to drop-off, show why
    if (x === 9 && y === 7 && state.round >= 290) {
      console.log(`  [DEBUG Bot ${bot.id}] AT (9,7): inventory=[${bot.inventory}] | items_required=[${activeOrder.items_required}] | junkItems=[${junkItems}] | needed=[${needed}]`);
    }

    // Move toward nearest needed item
    let nearestItem = null;
    let nearestDist = Infinity;

    for (const item of state.items.values()) {
      if (needed.includes(item.type)) {
        const [ix, iy] = item.position;
        const dist = Math.abs(ix - x) + Math.abs(iy - y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestItem = item;
        }
      }
    }

    if (nearestItem) {
      const target: [number, number] = [nearestItem.position[0], nearestItem.position[1]];

      if (state.round <= 5 || state.round >= 20) {
        console.log(`  [DEBUG Bot ${bot.id}] Needed [${needed.join(', ')}] | Moving toward "${nearestItem.type}" at (${target[0]}, ${target[1]}) (dist: ${nearestDist})`);
      }

      // Use pathfinding to navigate around obstacles
      return this.pathfinder.moveTowardWithPath(bot.id, [x, y], target, state.gridWidth, state.gridHeight, state.bots);
    }

    // If holding items but no more needed, go deliver
    if (bot.inventory.length > 0) {
      if (state.round <= 5 || state.round >= 20) {
        console.log(`  [DEBUG Bot ${bot.id}] Has [${bot.inventory.join(', ')}] but needed empty - GOING TO DROPOFF (${dropOff.x}, ${dropOff.y})`);
      }
      return this.pathfinder.moveTowardWithPath(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots);
    }

    // No items found
    if ((state.round <= 5 || state.round >= 20) && needed.length > 0) {
      console.log(`  [DEBUG Bot ${bot.id}] WARNING: Needed [${needed.join(', ')}] but no items available!`);
    }

    // Nothing to do
    return { bot: bot.id, action: 'wait' };
  }

  private moveToward(botId: number, x: number, y: number, target: Coordinate): BotAction {
    const tx = target.x;
    const ty = target.y;

    // Prioritize X movement (move_left/move_right), then Y movement (move_up/move_down)
    if (tx !== x) {
      return { bot: botId, action: tx > x ? 'move_right' : 'move_left' };
    } else if (ty !== y) {
      return { bot: botId, action: ty > y ? 'move_down' : 'move_up' };
    }
    return { bot: botId, action: 'wait' };
  }
}
