/**
 * BotOrchestrator: Coordinates multiple bots to complete orders efficiently
 * Assigns target items to each bot, preventing redundancy and deadlocks
 */

export interface BotAssignment {
  botId: number;
  targetItemId: string | null; // null means "wait" or "deliver current inventory"
  rationale: string;
}

export class BotOrchestrator {
  /**
   * Assign target items to bots for this decision cycle
   * CRITICAL: Assigns items by their POSITION in items_required (sequential order)
   * This ensures when bots drop items at the dropoff, they match the required sequence
   *
   * @param bots - Array of bot states with position and inventory
   * @param availableItems - Map of items: {id, type, position}
   * @param neededItems - Map of items still needed: {id, type, position}
   * @param activeOrder - Current order requirements with items_required[] and items_delivered[]
   * @returns Map of bot ID to assignment
   */
  assignTargets(
    bots: any[],
    availableItems: Map<string, any>,
    neededItems: Map<string, any>,
    activeOrder: any
  ): Map<number, BotAssignment> {
    const assignments = new Map<number, BotAssignment>();

    if (!activeOrder || neededItems.size === 0) {
      // No order or no items needed - all wait
      for (const bot of bots) {
        assignments.set(bot.id, {
          botId: bot.id,
          targetItemId: null,
          rationale: 'no_active_order',
        });
      }
      return assignments;
    }

    // Track which items and positions have been assigned in this round
    const assignedItemIds = new Set<string>();
    const assignedBotIds = new Set<number>();

    // Calculate next position to fill
    const nextPosition = activeOrder.items_delivered.length;

    // Remaining positions to fill
    const remainingPositions = activeOrder.items_required.length - nextPosition;
    if (remainingPositions <= 0) {
      // Order complete - all bots wait
      for (const bot of bots) {
        assignments.set(bot.id, {
          botId: bot.id,
          targetItemId: null,
          rationale: 'order_complete',
        });
      }
      return assignments;
    }

    // Assign items by position sequence
    // For each position starting from nextPosition, assign a bot to collect that item type
    let currentPosition = nextPosition;
    while (currentPosition < activeOrder.items_required.length && assignedBotIds.size < bots.length) {
      const requiredItemType = activeOrder.items_required[currentPosition];

      // Find items of this type that aren't assigned yet
      const availableItemsOfType = Array.from(neededItems.values()).filter(
        item => item.type === requiredItemType && !assignedItemIds.has(item.id)
      );

      if (availableItemsOfType.length === 0) {
        // No items available for this position - skip it (might be delivered already, or out of map)
        currentPosition++;
        continue;
      }

      // Find unassigned bot closest to one of these items
      let closestBot = null;
      let closestDist = Infinity;
      let closestItem = null;

      for (const bot of bots) {
        if (assignedBotIds.has(bot.id)) {
          continue; // Bot already assigned
        }
        // Don't assign items the bot is already carrying
        if (bot.inventory.includes(requiredItemType)) {
          continue;
        }

        for (const item of availableItemsOfType) {
          const dist = Math.abs(item.position[0] - bot.position.x) + Math.abs(item.position[1] - bot.position.y);
          if (dist < closestDist) {
            closestDist = dist;
            closestBot = bot;
            closestItem = item;
          }
        }
      }

      if (closestBot && closestItem) {
        assignedBotIds.add(closestBot.id);
        assignedItemIds.add(closestItem.id);
        assignments.set(closestBot.id, {
          botId: closestBot.id,
          targetItemId: closestItem.id,
          rationale: `seq_pos_${currentPosition}_${requiredItemType}_dist_${closestDist}`,
        });
      }

      currentPosition++;
    }

    // Assign remaining unassigned bots to wait
    for (const bot of bots) {
      if (!assignments.has(bot.id)) {
        assignments.set(bot.id, {
          botId: bot.id,
          targetItemId: null,
          rationale: assignedBotIds.size >= bots.length ? 'all_bots_assigned' : 'no_items_for_position',
        });
      }
    }

    return assignments;
  }

}
