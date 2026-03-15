import { BotAction, Coordinate } from './types';
import { GameStateManager } from './gameState';
import { Pathfinder } from './pathfinding';
import { BotOrchestrator } from './orchestrator';

export class BotStrategy {
  private gameState: GameStateManager;
  private orchestrator: BotOrchestrator;
  private pathfinders: Map<number, Pathfinder> = new Map(); // One pathfinder per bot
  private lastBotStates: Map<number, { pos: [number, number], action: string, stuckCount: number }> = new Map();
  private lastOrderId: string | undefined;
  private assignedTargets: Map<number, string | null> = new Map(); // Current round's assigned targets

  constructor(gameState: GameStateManager) {
    this.gameState = gameState;
    this.orchestrator = new BotOrchestrator();
  }

  private getPathfinder(botId: number): Pathfinder {
    if (!this.pathfinders.has(botId)) {
      this.pathfinders.set(botId, new Pathfinder());
    }
    return this.pathfinders.get(botId)!;
  }

  /**
   * Fallback movement toward target when BFS pathfinding fails or when stuck.
   * Alternates between X and Y directions to navigate around obstacles.
   */
  private fallbackMovement(
    botId: number,
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    round: number
  ): BotAction {
    // Every 3 rounds, swap primary direction (X vs Y)
    const swapEvery = 3;
    const shouldPrioritizeY = Math.floor(round / swapEvery) % 2 === 1;

    if (shouldPrioritizeY) {
      // Try Y first, then X
      if (y < targetY) return { bot: botId, action: 'move_down' };
      if (y > targetY) return { bot: botId, action: 'move_up' };
      if (x < targetX) return { bot: botId, action: 'move_right' };
      if (x > targetX) return { bot: botId, action: 'move_left' };
    } else {
      // Try X first, then Y
      if (x < targetX) return { bot: botId, action: 'move_right' };
      if (x > targetX) return { bot: botId, action: 'move_left' };
      if (y < targetY) return { bot: botId, action: 'move_down' };
      if (y > targetY) return { bot: botId, action: 'move_up' };
    }

    return { bot: botId, action: 'wait' };
  }

  /**
   * Get zone for a position. Divides grid into 2x2 zones to reduce bot contention.
   * Works for grids 8x8 and up
   */
  private getZone(pos: [number, number], gridWidth: number, gridHeight: number): string {
    const zoneX = pos[0] < gridWidth / 2 ? 0 : 1;
    const zoneY = pos[1] < gridHeight / 2 ? 0 : 1;
    return `${zoneX},${zoneY}`;
  }

  decideBotActions(): BotAction[] {
    const actions: BotAction[] = [];
    const bots = this.gameState.getBots();
    const state = this.gameState.getState();
    const dropOff = this.gameState.getDropOff();

    // Find active order
    const activeOrder = state.orders.find((o: any) => o.status === 'active');

    // Calculate items still needed
    const neededItemsMap = new Map();
    if (activeOrder) {
      const needed = [...activeOrder.items_required];
      for (const delivered of activeOrder.items_delivered) {
        const idx = needed.indexOf(delivered);
        if (idx > -1) {
          needed.splice(idx, 1);
        }
      }

      // Build map of needed items
      for (const item of state.items.values()) {
        if (needed.includes(item.type)) {
          neededItemsMap.set(item.id, item);
        }
      }
    }

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

    // Calculate items still needed RIGHT HERE (before stuck detection)
    // This is used throughout the function for stuck recovery and item selection
    const itemsStillNeeded: string[] = [];
    if (activeOrder) {
      const itemsNeeded = [...activeOrder.items_required];
      for (const delivered of activeOrder.items_delivered) {
        const idx = itemsNeeded.indexOf(delivered);
        if (idx > -1) {
          itemsNeeded.splice(idx, 1);
        }
      }
      itemsStillNeeded.push(...itemsNeeded);
    }

    // Clear blocked cells when order changes (new items on map)
    const currentOrderId = activeOrder?.id;
    if (!this.lastOrderId || this.lastOrderId !== currentOrderId) {
      const pathfinder = this.getPathfinder(bot.id);
      pathfinder.clearBlockedCells();

      // Block all walls from the server
      for (const [wx, wy] of state.walls) {
        pathfinder.blockCell(wx, wy);
      }

      this.lastOrderId = currentOrderId;
      if (state.round >= 0) {  // Always log
        console.log(`  [WALLS] Order changed to ${currentOrderId} - cleared blocked cells and blocked ${state.walls.length} walls for Bot ${bot.id}`);
      }
    }

    // Detect stuck moves and learn obstacles
    let obstacleDiscovered = false;
    let isStuck = false;
    const lastState = this.lastBotStates.get(bot.id);
    if (lastState) {
      const isSamePos = lastState.pos[0] === x && lastState.pos[1] === y;

      if (isSamePos && lastState.action.startsWith('move_')) {
        // We made a move but didn't change position - obstacle discovered!
        lastState.stuckCount++;

        if (lastState.stuckCount === 1 || lastState.stuckCount === 2) {
          console.log(`    [STUCK-COUNT] stuckCount=${lastState.stuckCount}: at (${x},${y}) after failed ${lastState.action}, inv=[${bot.inventory.join(', ')}]`);
        }

        // Determine what cell we tried to move to
        let blockedX = x;
        let blockedY = y;

        if (lastState.action === 'move_up') blockedY = y - 1;
        else if (lastState.action === 'move_down') blockedY = y + 1;
        else if (lastState.action === 'move_left') blockedX = x - 1;
        else if (lastState.action === 'move_right') blockedX = x + 1;

        if (lastState.stuckCount >= 2) {
          // Stuck for 2+ attempts - try fallback movement to escape
          isStuck = true;
          console.log(`  [STUCK-DETECT] Round ${state.round}: Bot ${bot.id} stuck at (${x},${y}) after ${lastState.stuckCount} failed ${lastState.action}s, inv=[${bot.inventory.join(', ')}]`);
        }

        if (lastState.stuckCount >= 3) {
          // Failed 3+ times, definitely blocked - mark for pathfinder to learn
          this.getPathfinder(bot.id).blockCell(blockedX, blockedY);
          if (state.round >= 290) {
            console.log(`  [DEBUG Bot ${bot.id}] OBSTACLE LEARNED at (${blockedX},${blockedY}) after ${lastState.stuckCount} attempts`);
          }
          lastState.stuckCount = 0; // Reset for next obstacle
          obstacleDiscovered = true;
        }
      } else if (!isSamePos) {
        // Movement succeeded
        // BUT: Don't reset stuck counter if holding items - we need to stay in delivery mode!
        if (bot.inventory.length === 0) {
          if (lastState.stuckCount > 0) {
            console.log(`    [STUCK-RESET] stuckCount reset (was ${lastState.stuckCount}) after successful move to (${x},${y})`);
          }
          lastState.stuckCount = 0;
        } else {
          console.log(`    [STUCK-CONTINUING] stuckCount kept at ${lastState.stuckCount} (still holding items) after move to (${x},${y})`);
        }
      }
    }

    // If stuck with items, try to deliver them via pathfinding
    if (isStuck && bot.inventory.length > 0) {
      console.log(`  [STUCK-DROPOFF] Round ${state.round}: Bot ${bot.id} stuck with [${bot.inventory.join(', ')}] at (${x},${y}) - PATHFINDING TO DROPOFF`);
      return this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots);
    }

    // If stuck with no items, pick up ONLY NEEDED ITEMS that are adjacent, or fallback toward nearest needed item
    if (isStuck && bot.inventory.length === 0 && itemsStillNeeded.length > 0) {
      // Try to pick up adjacent NEEDED item to make progress
      for (const item of state.items.values()) {
        if (itemsStillNeeded.includes(item.type)) { // ONLY NEEDED ITEMS
          const [ix, iy] = item.position;
          const dist = Math.abs(ix - x) + Math.abs(iy - y);
          if (dist <= 1) {
            if (state.round <= 10) {
              console.log(`  [DEBUG Bot ${bot.id}] Stuck picking up adjacent NEEDED item "${item.type}" to make progress`);
            }
            return { bot: bot.id, action: 'pick_up', item_id: item.id };
          }
        }
      }

      // No adjacent needed items - try fallback toward NEAREST NEEDED ITEM
      let nearestNeededItem: any = null;
      let nearestDist = Infinity;
      for (const item of state.items.values()) {
        if (itemsStillNeeded.includes(item.type)) { // ONLY NEEDED ITEMS
          const dist = Math.abs(item.position[0] - x) + Math.abs(item.position[1] - y);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestNeededItem = item;
          }
        }
      }

      if (nearestNeededItem) {
        if (state.round <= 10) {
          console.log(`  [DEBUG Bot ${bot.id}] Stuck using fallback toward NEEDED item "${nearestNeededItem.type}" at (${nearestNeededItem.position[0]}, ${nearestNeededItem.position[1]})`);
        }
        return this.fallbackMovement(bot.id, x, y, nearestNeededItem.position[0], nearestNeededItem.position[1], state.round);
      }
    }


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
      return this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots);
    }

    // Active order was already found above, check if it exists
    if (!activeOrder) {
      // No orders, wait or go drop off if holding anything
      if (bot.inventory.length > 0) {
        return this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots);
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
    // Greedy: grab ANY adjacent needed item, not just assigned target
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
      return this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots);
    }

    // Debug: if at (9,7) and not moving to drop-off, show why
    if (x === 9 && y === 7 && state.round >= 290) {
      console.log(`  [DEBUG Bot ${bot.id}] AT (9,7): inventory=[${bot.inventory}] | items_required=[${activeOrder.items_required}] | junkItems=[${junkItems}] | needed=[${needed}]`);
    }

    // Build list of all needed items sorted by distance
    const botZone = this.getZone([x, y], state.gridWidth, state.gridHeight);
    const candidateItems: Array<{ item: any; dist: number; inZone: boolean }> = [];

    for (const item of state.items.values()) {
      if (needed.includes(item.type)) {
        const dist = Math.abs(item.position[0] - x) + Math.abs(item.position[1] - y);
        const itemZone = this.getZone(item.position as [number, number], state.gridWidth, state.gridHeight);
        const inZone = itemZone === botZone;
        candidateItems.push({ item, dist, inZone });
      }
    }

    // Sort by distance
    candidateItems.sort((a, b) => a.dist - b.dist);

    // Try items in distance order until we find a reachable one
    for (const { item: targetItem } of candidateItems) {
      if (state.round >= 200) {
        console.log(`  [DEBUG Bot ${bot.id}] Trying needed item "${targetItem.type}" at (${targetItem.position[0]}, ${targetItem.position[1]})`);
      }

      // Try to pathfind to this item
      const moveAction = this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], targetItem.position as [number, number], state.gridWidth, state.gridHeight, state.bots);

      // If unreachable AND holding items, drop off first then retry
      if (moveAction.action === 'wait' && bot.inventory.length > 0) {
        if (true) {  // Always log
          console.log(`  [UNREACHABLE] Bot ${bot.id} can't reach item at (${targetItem.position[0]}, ${targetItem.position[1]}), going to dropoff first with [${bot.inventory.join(', ')}]`);
        }
        return this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots);
      }

      // If reachable (action is not 'wait'), use it
      if (moveAction.action !== 'wait') {
        return moveAction;
      }

      // If unreachable and empty inventory, skip this item and try next
      if (moveAction.action === 'wait' && bot.inventory.length === 0) {
        if (state.round >= 150) {
          console.log(`  [SKIP-UNREACHABLE] Bot ${bot.id} skipping unreachable item "${targetItem.type}" at (${targetItem.position[0]}, ${targetItem.position[1]}), trying next...`);
        }
        continue;
      }
    }

    // If holding items but no more needed, go deliver
    if (bot.inventory.length > 0) {
      if (state.round <= 5 || state.round >= 20) {
        console.log(`  [DEBUG Bot ${bot.id}] Has [${bot.inventory.join(', ')}] but needed empty - GOING TO DROPOFF (${dropOff.x}, ${dropOff.y})`);
      }
      return this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots);
    }

    // No items found
    if ((state.round <= 5 || state.round >= 20) && needed.length > 0) {
      console.log(`  [DEBUG Bot ${bot.id}] WARNING: Needed [${needed.join(', ')}] but no items available!`);
    }

    // Nothing to do - log more detail when stuck
    if (state.round >= 250) {
      console.log(`  [DEBUG Bot ${bot.id}] WAIT_ACTION at (${x},${y}): inventory=[${bot.inventory}] | junk=[${junkItems}] | needed=[${needed}] | activeOrder=${activeOrder?.id}`);
    }
    return { bot: bot.id, action: 'wait' };
  }
}
