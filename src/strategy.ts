import { BotAction, Coordinate } from './types';
import { GameStateManager } from './gameState';
import { Pathfinder } from './pathfinding';
import { BotOrchestrator, BotAssignment } from './orchestrator';

export class BotStrategy {
  private gameState: GameStateManager;
  private orchestrator: BotOrchestrator;
  private pathfinders: Map<number, Pathfinder> = new Map(); // One pathfinder per bot
  private lastBotStates: Map<number, { pos: [number, number], action: string, stuckCount: number, dropoffFailCount?: number, lastInventorySize?: number, failedDropoffInventorySize?: number, failedDropoffSinceRound?: number, lastOrderIdSeen?: string, wallsLoadedForOrderId?: string }> = new Map();
  private assignedTargets: Map<number, BotAssignment> = new Map(); // Current round's assigned targets

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
   * Try BFS pathfinding first; if it returns 'wait' (no path found or blocked by bots),
   * fall back to naive directional movement toward the target.
   */
  private pathfindOrFallback(
    botId: number,
    start: [number, number],
    target: [number, number],
    gridWidth: number,
    gridHeight: number,
    bots: any[],
    round: number
  ): BotAction {
    const moveAction = this.getPathfinder(botId).moveTowardWithPath(botId, start, target, gridWidth, gridHeight, bots);
    if (moveAction.action !== 'wait') return moveAction;
    return this.fallbackMovement(botId, start[0], start[1], target[0], target[1], round);
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

    // Assign target items to bots (multi-bot coordination)
    this.assignedTargets = this.orchestrator.assignTargets(bots, state.items, neededItemsMap, activeOrder);

    for (const bot of bots) {
      const action = this.decideAction(bot, state, dropOff);
      actions.push(action);

      // Save bot state for next round (to detect stuck moves and dropoff failures)
      const activeOrder = state.orders.find((o: any) => o.status === 'active');
      const prevState = this.lastBotStates.get(bot.id);
      this.lastBotStates.set(bot.id, {
        pos: [bot.position.x, bot.position.y],
        action: action.action,
        stuckCount: prevState?.stuckCount || 0,
        dropoffFailCount: prevState?.dropoffFailCount || 0,
        lastInventorySize: bot.inventory.length,
        lastOrderIdSeen: activeOrder?.id,
        // CRITICAL: Preserve failedDropoffInventorySize so it persists across rounds
        // decideAction modifies lastState directly, and prevState points to the same object
        failedDropoffInventorySize: prevState?.failedDropoffInventorySize,
        failedDropoffSinceRound: prevState?.failedDropoffSinceRound,
        wallsLoadedForOrderId: prevState?.wallsLoadedForOrderId,
      });
    }

    return actions;
  }

  private decideAction(bot: any, state: any, dropOff: Coordinate): BotAction {
    const [x, y] = [bot.position.x, bot.position.y];

    // Find active order first
    const activeOrder = state.orders.find((o: any) => o.status === 'active');
    const currentOrderId = activeOrder?.id;

    // CRITICAL: Detect when active order CHANGES for a bot
    // Old inventory from previous order should be treated as junk in new order
    const lastState = this.lastBotStates.get(bot.id);

    // Pre-load walls per-bot independently (not shared across bots)
    if (lastState?.wallsLoadedForOrderId !== currentOrderId) {
      const pathfinder = this.getPathfinder(bot.id);
      pathfinder.clearBlockedCells();
      for (const [wx, wy] of state.walls) {
        pathfinder.blockCell(wx, wy);
      }
      if (lastState) {
        lastState.wallsLoadedForOrderId = currentOrderId;
      }
    }
    if (lastState && lastState.lastOrderIdSeen !== currentOrderId && lastState.lastOrderIdSeen !== undefined) {
      // Order changed! Clear the rejected-inventory flag so bot can try the new order
      if (lastState.failedDropoffInventorySize !== undefined) {
        lastState.failedDropoffInventorySize = undefined;
        lastState.failedDropoffSinceRound = undefined;
      }
      // Order changed! Any inventory not matching the NEW order is now junk
      if (activeOrder) {
        const oldInventoryNotInNewOrder = bot.inventory.filter((item: string) => !activeOrder.items_required.includes(item));
        if (oldInventoryNotInNewOrder.length > 0) {
          if (state.round < 150) {
            console.log(`    [ORDER-CHANGED-JUNK] Bot ${bot.id} had inventory [${bot.inventory}] from old order - now junk in new order. Sending to dropoff.`);
          }
          // Go drop off all inventory that's not in the new order
          if (x === dropOff.x && y === dropOff.y) {
            return { bot: bot.id, action: 'drop_off' };
          }
          return this.pathfindOrFallback(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots, state.round);
        }
      }
    }

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

    // Detect stuck moves and learn obstacles
    let obstacleDiscovered = false;
    let isStuck = false;
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

        if (lastState.stuckCount >= 2) {
          // Stuck for 2+ attempts - try fallback movement to escape
          isStuck = true;
        }

        if (lastState.stuckCount >= 3) {
          // Failed 3+ times, definitely blocked - mark for pathfinder to learn
          this.getPathfinder(bot.id).blockCell(blockedX, blockedY);
          lastState.stuckCount = 0; // Reset for next obstacle
          obstacleDiscovered = true;
        }
      } else if (!isSamePos) {
        // Movement succeeded
        // BUT: Don't reset stuck counter if holding items - we need to stay in delivery mode!
        if (bot.inventory.length === 0) {
          lastState.stuckCount = 0;
        }
      }
    }

    // If stuck with items, try to deliver them via pathfinding
    if (isStuck && bot.inventory.length > 0) {
      return this.pathfindOrFallback(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots, state.round);
    }

    // If stuck with no items, try pathfinding to multiple items (skip unreachable ones)
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

      // Build sorted list of needed items and try pathfinding to find a reachable one
      const stuckCandidates: Array<{ item: any; dist: number }> = [];
      for (const item of state.items.values()) {
        if (itemsStillNeeded.includes(item.type)) {
          const dist = Math.abs(item.position[0] - x) + Math.abs(item.position[1] - y);
          stuckCandidates.push({ item, dist });
        }
      }

      // Sort by distance
      stuckCandidates.sort((a, b) => a.dist - b.dist);

      // Try pathfinding to each item - skip unreachable ones
      for (const { item: candidateItem } of stuckCandidates) {
        const moveAction = this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], candidateItem.position as [number, number], state.gridWidth, state.gridHeight, state.bots);

        // If reachable, use it
        if (moveAction.action !== 'wait') {
          return moveAction;
        }

        // If unreachable, skip and try next
      }

      // If no reachable items found, use fallback movement to escape the immediate area
      if (stuckCandidates.length > 0) {
        const nearestNeededItem = stuckCandidates[0].item;
        return this.fallbackMovement(bot.id, x, y, nearestNeededItem.position[0], nearestNeededItem.position[1], state.round);
      }
    }



    // CRITICAL: Empty bot at dropoff must move away immediately to unblock other bots
    // Without this, an empty bot parks at the dropoff forever and prevents deliveries
    if (bot.inventory.length === 0 && x === dropOff.x && y === dropOff.y) {
      if (x + 1 < state.gridWidth) return { bot: bot.id, action: 'move_right' };
      if (y - 1 >= 0) return { bot: bot.id, action: 'move_up' };
      if (x - 1 >= 0) return { bot: bot.id, action: 'move_left' };
      if (y + 1 < state.gridHeight) return { bot: bot.id, action: 'move_down' };
    }

    if (bot.inventory.length > 0 && x === dropOff.x && y === dropOff.y) {
      // CRITICAL FIRST: Check if oscillation abandonment applies (happens before any other dropoff logic)
      // Detect if dropoff attempts are failing (inventory not clearing)
      if (lastState) {
        const samePos = lastState.pos[0] === x && lastState.pos[1] === y;
        const lastWasDropoff = lastState.action === 'drop_off';
        const inventorySameSize = bot.inventory.length === (lastState.lastInventorySize || 0);

        if (samePos && lastWasDropoff && inventorySameSize) {
          // Drop attempt failed - inventory unchanged
          // Mark this inventory size as "failed at dropoff" with expiry timer
          lastState.failedDropoffInventorySize = bot.inventory.length;
          lastState.failedDropoffSinceRound = state.round; // Start retry timer
          if (state.round < 150) {
            console.log(`    [DROP-OFF-FAILED-FIRST] Bot ${bot.id} drop_off attempt rejected. Moving away and won't retry with this inventory.`);
          }
        } else if (bot.inventory.length !== (lastState.failedDropoffInventorySize || -1)) {
          // Inventory changed - clear the failed marker so bot can try dropping again if needed
          lastState.failedDropoffInventorySize = undefined;
          lastState.failedDropoffSinceRound = undefined;
        }

        // Track inventory for next round
        lastState.lastInventorySize = bot.inventory.length;
      }

      // If THIS inventory was already tried at dropoff and rejected, GIVE UP and move away
      // But expire after 15 rounds to allow retry (sequence position may have advanced)
      const roundsSinceFailed = lastState?.failedDropoffSinceRound !== undefined
        ? state.round - lastState.failedDropoffSinceRound
        : Infinity;
      if (lastState?.failedDropoffInventorySize === bot.inventory.length && roundsSinceFailed < 15) {
        if (state.round < 150) {
          console.log(`    [COMMITTED-ABANDON] Bot ${bot.id} moving away - this inventory was already rejected at dropoff.`);
        }
        // Move away from dropoff to make room for other bots - try in order: right, left, down, up
        if (x + 1 < state.gridWidth) return { bot: bot.id, action: 'move_right' };
        if (x - 1 >= 0) return { bot: bot.id, action: 'move_left' };
        if (y + 1 < state.gridHeight) return { bot: bot.id, action: 'move_down' };
        if (y - 1 >= 0) return { bot: bot.id, action: 'move_up' };
        // If can't move away, just wait
        return { bot: bot.id, action: 'wait' };
      } else if (roundsSinceFailed >= 15 && lastState?.failedDropoffInventorySize !== undefined) {
        // Retry timeout expired - clear the flag and fall through to try drop_off again
        lastState.failedDropoffInventorySize = undefined;
        lastState.failedDropoffSinceRound = undefined;
      }

      // SECOND: Check inventory sequence (but don't return - just note it)
      // Verify inventory sequence matches what's NEEDED at dropoff
      // If bot is at dropoff but holding items that don't start with the next needed position,
      // the server will reject the drop ANYWAY. So just drop immediately.
      if (activeOrder) {
        const nextPosition = activeOrder.items_delivered.length;
        const nextNeededType = activeOrder.items_required[nextPosition];
        const firstItemInInventory = bot.inventory[0];

        // Check if first item matches the next needed position
        if (firstItemInInventory !== nextNeededType) {
          // Inventory is OUT OF SEQUENCE - server will reject anyway
          // Just drop it to clear inventory and let other bots try
          if (state.round < 150) {
            console.log(`    [SEQUENCE-MISMATCH] Bot ${bot.id} at dropoff with [${bot.inventory}] - first item ${firstItemInInventory} doesn't match next needed position ${nextPosition}=${nextNeededType}. Dropping anyway.`);
          }
          return { bot: bot.id, action: 'drop_off' };
        }
      }

      if (activeOrder) {
        // Only drop if we have items that match the active order requirements
        const itemsNeeded = [...activeOrder.items_required];
        const hasMatchingItem = bot.inventory.some((item: string) => itemsNeeded.includes(item));
        if (hasMatchingItem) {
          if (state.round < 150) {
            console.log(`    [DROP-OFF] Bot ${bot.id} at dropoff (${x},${y}) with inv=[${bot.inventory}], items_needed=${itemsNeeded.length}, items_delivered=${activeOrder.items_delivered.length}`);
          }
          return { bot: bot.id, action: 'drop_off' };
        }

        // CRITICAL: If holding ANY items that DON'T match active order, DROP THEM ANYWAY
        // This clears inventory even if items won't deliver, freeing up slots for new items
        // This is more important than trying to keep items for future orders
        if (bot.inventory.length > 0) {
          if (state.round < 150) {
            console.log(`    [DROP-JUNK] Bot ${bot.id} at dropoff dropping junk [${bot.inventory}] to free inventory slot.`);
          }
          return { bot: bot.id, action: 'drop_off' };
        }

        // No inventory to drop, move away to let other bots try
        if (state.round < 150) {
          console.log(`    [NO-MATCH] Bot ${bot.id} at dropoff (${x},${y}) but inv=[] - moving away.`);
        }
        // Move away to let other bots try - try in order: right, left, down, up
        if (x + 1 < state.gridWidth) return { bot: bot.id, action: 'move_right' };
        if (x - 1 >= 0) return { bot: bot.id, action: 'move_left' };
        if (y + 1 < state.gridHeight) return { bot: bot.id, action: 'move_down' };
        if (y - 1 >= 0) return { bot: bot.id, action: 'move_up' };
        return { bot: bot.id, action: 'wait' };
      } else {
        // No active order, just drop everything
        if (state.round < 150) {
          console.log(`    [DROP-OFF-NO-ORDER] Bot ${bot.id} at dropoff with inv=[${bot.inventory}]`);
        }
        return { bot: bot.id, action: 'drop_off' };
      }
    }

    // CRITICAL: If this inventory was already rejected at dropoff, don't route back there.
    // Expires after 15 rounds so bots can retry once the sequence position may have advanced.
    const rejectedRounds = lastState?.failedDropoffSinceRound !== undefined
      ? state.round - lastState.failedDropoffSinceRound
      : Infinity;
    const inventoryRejected = lastState?.failedDropoffInventorySize !== undefined &&
      lastState.failedDropoffInventorySize === bot.inventory.length &&
      bot.inventory.length > 0 &&
      rejectedRounds < 15;

    if (inventoryRejected) {
      if (state.round < 150) {
        console.log(`    [IDLE-ABANDON] Bot ${bot.id} has rejected inventory [${bot.inventory}] - parking away from dropoff.`);
      }
      // Navigate to far parking zone, staggered by bot id to spread bots out
      const parkX = dropOff.x < state.gridWidth / 2 ? state.gridWidth - 2 : 1;
      const parkY = Math.min(Math.max(bot.id * 2, 1), state.gridHeight - 2);
      const distToDropoff = Math.abs(x - dropOff.x) + Math.abs(y - dropOff.y);
      if (distToDropoff <= 5 || (x !== parkX || y !== parkY)) {
        const moveAway = this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], [parkX, parkY], state.gridWidth, state.gridHeight, state.bots);
        if (moveAway.action !== 'wait') return moveAway;
        // Pathfinding blocked - nudge in any valid direction
        if (x + 1 < state.gridWidth) return { bot: bot.id, action: 'move_right' };
        if (y - 1 >= 0) return { bot: bot.id, action: 'move_up' };
      }
      return { bot: bot.id, action: 'wait' };
    }

    // If inventory full (3 items), need to drop off
    // CRITICAL: If full inventory is all junk (non-matching), move AWAY to clear area, don't crowd dropoff
    if (bot.inventory.length >= 3) {
      if (activeOrder) {
        const orderItemTypes = new Set(activeOrder.items_required);
        const hasAnyMatchingType = bot.inventory.some((item: string) => orderItemTypes.has(item));

        if (!hasAnyMatchingType) {
          // Full inventory of pure junk - navigate to far parking zone away from dropoff
          // Use pathfinding so bots don't bounce off walls
          if (state.round < 150) {
            console.log(`    [FULL-JUNK] Bot ${bot.id} has FULL junk inventory. Parking away from dropoff.`);
          }
          // Park at opposite corner from dropoff, stagger by bot id to spread bots out
          const parkX = dropOff.x < state.gridWidth / 2 ? state.gridWidth - 2 : 1;
          const parkY = Math.min(Math.max(bot.id * 2, 1), state.gridHeight - 2);
          const moveAway = this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], [parkX, parkY], state.gridWidth, state.gridHeight, state.bots);
          if (moveAway.action !== 'wait') return moveAway;
          // Pathfinding blocked - try any direction to get unstuck
          if (x + 1 < state.gridWidth) return { bot: bot.id, action: 'move_right' };
          if (x - 1 >= 0) return { bot: bot.id, action: 'move_left' };
          if (y + 1 < state.gridHeight) return { bot: bot.id, action: 'move_down' };
          if (y - 1 >= 0) return { bot: bot.id, action: 'move_up' };
          return { bot: bot.id, action: 'wait' };
        }
      }

      // Full inventory with some matching items - go to dropoff normally
      return this.pathfindOrFallback(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots, state.round);
    }

    // Active order was already found above, check if it exists
    if (!activeOrder) {
      // No orders, wait or go drop off if holding anything
      if (bot.inventory.length > 0) {
        return this.pathfindOrFallback(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots, state.round);
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

    // CRITICAL: If bot has junk items AND inventory is FULL, must drop them
    // This prevents collecting needed items when full of junk
    // But if inventory has space, bot can still collect needed items alongside junk
    if (activeOrder && bot.inventory.length >= 3) {
      const junkItems = bot.inventory.filter((item: string) => !activeOrder.items_required.includes(item));
      if (junkItems.length > 0) {
        // Inventory FULL of (or with) junk - drop it before anything else
        if (x === dropOff.x && y === dropOff.y) {
          // At dropoff - drop the junk
          if (state.round < 150) {
            console.log(`    [FULL-JUNK-DROP] Bot ${bot.id} dropping full junk inventory [${junkItems}]`);
          }
          return { bot: bot.id, action: 'drop_off' };
        } else {
          // Not at dropoff - move there immediately
          if (state.round < 150) {
            console.log(`    [FULL-JUNK-MOVE] Bot ${bot.id} FULL with junk [${junkItems}] - must go to dropoff`);
          }
          return this.pathfindOrFallback(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots, state.round);
        }
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

    // Get orchestrator assignment for this bot
    const assignment = this.assignedTargets?.get(bot.id);
    let assignedItem: any = null;

    // Only use orchestrator assignment if we have empty inventory
    // Bots with items should go to dropoff, not collect more
    if (bot.inventory.length === 0 && assignment?.targetItemId) {
      assignedItem = state.items.get(assignment.targetItemId);
    }

    // Build set of items assigned to OTHER bots (not this one)
    const itemsAssignedToOthers = new Set<string>();
    for (const [otherId, otherAssignment] of this.assignedTargets || []) {
      if (otherId !== bot.id && otherAssignment.targetItemId) {
        itemsAssignedToOthers.add(otherAssignment.targetItemId);
      }
    }

    // CRITICAL SAFETY CHECK: Only pick up items in the active order
    // Before any pick_up action, verify the item type is needed
    if (!activeOrder || !activeOrder.items_required.includes(assignedItem?.type)) {
      if (assignedItem && state.round < 150) {
        console.log(`    [REJECT-PICKUP] Bot ${bot.id} prevented from picking "${assignedItem.type}" - NOT in active order items_required`);
      }
      // Don't pick this up - let fallback logic handle it
      assignedItem = null;
    }

    if (assignedItem && needed.includes(assignedItem.type)) {
      const [ix, iy] = assignedItem.position;
      const dist = Math.abs(ix - x) + Math.abs(iy - y);

      if (dist <= 1) {
        // Adjacent to assigned item - pick it up
        return { bot: bot.id, action: 'pick_up', item_id: assignedItem.id };
      }

      // Not adjacent - pathfind toward assigned item
      const moveAction = this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], assignedItem.position as [number, number], state.gridWidth, state.gridHeight, state.bots);

      if (moveAction.action !== 'wait') {
        // Reachable - move toward it
        return moveAction;
      }

      // If unreachable and holding items, drop off first
      if (bot.inventory.length > 0) {
        return this.pathfindOrFallback(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots, state.round);
      }

      // If unreachable and empty, try fallback movement toward assigned item
      const fallback = this.fallbackMovement(bot.id, x, y, assignedItem.position[0], assignedItem.position[1], state.round);
      if (fallback.action !== 'wait') return fallback;
      return { bot: bot.id, action: 'wait' };
    }

    // NO ASSIGNMENT - use remaining items opportunistically
    // Only grab adjacent items if they're not assigned to another bot
    // CRITICAL: If bot has items, verify adjacent items continue the sequence
    for (const item of state.items.values()) {
      // CRITICAL: ONLY pick items that are (1) needed and (2) in the active order
      const isInOrder = activeOrder && activeOrder.items_required.includes(item.type);
      if (needed.includes(item.type) && !itemsAssignedToOthers.has(item.id) && isInOrder) {
        const [ix, iy] = item.position;
        const dist = Math.abs(ix - x) + Math.abs(iy - y);

        // Check sequence compatibility only if bot already has items
        if (bot.inventory.length > 0) {
          // Bot has items - only pick if this item matches next sequence positions
          const nextPosition = activeOrder.items_delivered.length;
          let itemBelongsInNextSequence = false;

          // Check if item type belongs in any of the next ~3 positions
          for (let pos = nextPosition; pos < Math.min(nextPosition + 3, activeOrder.items_required.length); pos++) {
            if (activeOrder.items_required[pos] === item.type) {
              itemBelongsInNextSequence = true;
              break;
            }
          }

          if (!itemBelongsInNextSequence) {
            // Skip this item - it doesn't match sequence
            if (state.round < 150 && dist <= 1) {
              console.log(`    [SKIP-WRONG-SEQ] Bot ${bot.id} skipping adjacent "${item.type}" - doesn't match sequence after position ${nextPosition}`);
            }
            continue;
          }
        }

        // If adjacent or at location, pick up
        if (dist <= 1) {
          if (state.round < 150) {
            console.log(`    [SAFE-PICKUP] Bot ${bot.id} picking adjacent needed item "${item.type}"`);
          }
          return { bot: bot.id, action: 'pick_up', item_id: item.id };
        }
      }
    }
    for (const item of state.items.values()) {
      // CRITICAL: ONLY pick items that are (1) needed and (2) in the active order
      const isInOrder = activeOrder && activeOrder.items_required.includes(item.type);
      if (needed.includes(item.type) && !itemsAssignedToOthers.has(item.id) && isInOrder) {
        const [ix, iy] = item.position;
        const dist = Math.abs(ix - x) + Math.abs(iy - y);

        // Sequence check - only pick up items matching the next few positions
        if (bot.inventory.length > 0) {
          const nextPosition2 = activeOrder.items_delivered.length;
          let itemBelongsInNextSequence2 = false;
          for (let pos = nextPosition2; pos < Math.min(nextPosition2 + 3, activeOrder.items_required.length); pos++) {
            if (activeOrder.items_required[pos] === item.type) {
              itemBelongsInNextSequence2 = true;
              break;
            }
          }
          if (!itemBelongsInNextSequence2) continue;
        }

        // If adjacent or at location, pick up
        if (dist <= 1) {
          if (state.round < 150) {
            console.log(`    [SAFE-PICKUP] Bot ${bot.id} picking adjacent needed item "${item.type}"`);
          }
          return { bot: bot.id, action: 'pick_up', item_id: item.id };
        }
      }
    }

    // Check if carrying junk items (items NOT in the active order at all)
    const junkItems = bot.inventory.filter((item: string) => !activeOrder.items_required.includes(item));

    // If carrying junk and there are still items to pick AND not at drop-off, go drop junk first
    if (junkItems.length > 0 && !(x === dropOff.x && y === dropOff.y) && needed.length > 0) {
      return this.pathfindOrFallback(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots, state.round);
    }

    // CRITICAL: Only try other items if there was NO orchestrator assignment
    // If we had an assignment, we already tried it above and it was unreachable/incomplete
    // Don't fall back to other items - wait for assignment or go deliver what we have
    if (!assignedItem) {
      // Build list of items matching ONLY the next few sequence positions
      // This prevents bots from running across the map to grab items they can't deliver yet
      const botZone = this.getZone([x, y], state.gridWidth, state.gridHeight);
      const candidateItems: Array<{ item: any; dist: number; inZone: boolean }> = [];

      // Determine which item types are needed for the next few sequence positions
      const nextPosition = activeOrder.items_delivered.length;
      const maxLookahead = Math.min(nextPosition + Math.max(3, state.bots.length), activeOrder.items_required.length);
      const sequenceTypes = new Set<string>();
      for (let pos = nextPosition; pos < maxLookahead; pos++) {
        sequenceTypes.add(activeOrder.items_required[pos]);
      }

      for (const item of state.items.values()) {
        if (needed.includes(item.type) && sequenceTypes.has(item.type)) {
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
        // Skip if this item is assigned to another bot (multi-bot coordination)
        if (itemsAssignedToOthers.has(targetItem.id)) {
          continue;
        }

        // Try to pathfind to this item
        const moveAction = this.getPathfinder(bot.id).moveTowardWithPath(bot.id, [x, y], targetItem.position as [number, number], state.gridWidth, state.gridHeight, state.bots);

        // If unreachable AND holding items, drop off first then retry
        if (moveAction.action === 'wait' && bot.inventory.length > 0) {
          return this.pathfindOrFallback(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots, state.round);
        }

        // If reachable (action is not 'wait'), use it
        if (moveAction.action !== 'wait') {
          return moveAction;
        }

        // If unreachable and empty inventory, try fallback movement toward this item
        if (bot.inventory.length === 0) {
          const fallback = this.fallbackMovement(bot.id, x, y, targetItem.position[0], targetItem.position[1], state.round);
          if (fallback.action !== 'wait') return fallback;
          continue; // fallback also failed (already at target?), try next item
        }
      }
    }

    // If holding items but no more needed, go deliver
    if (bot.inventory.length > 0) {
      return this.pathfindOrFallback(bot.id, [x, y], [dropOff.x, dropOff.y], state.gridWidth, state.gridHeight, state.bots, state.round);
    }

    // No items found - wait
    return { bot: bot.id, action: 'wait' };
  }
}
