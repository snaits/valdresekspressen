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
   * @param bots - Array of bot states with position and inventory
   * @param availableItems - Map of items: {id, type, position}
   * @param neededItems - Map of items still needed: {id, type, position}
   * @param activeOrder - Current order requirements
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

    // Track which items have been assigned
    const assignedItemIds = new Set<string>();

    // Sort bots by proximity to nearest needed item (prioritize closer bots first)
    const sortedBots = [...bots].sort((a, b) => {
      const distA = this.nearestItemDistance(a, neededItems);
      const distB = this.nearestItemDistance(b, neededItems);
      return distA - distB;
    });

    // Assign items to bots greedily
    for (const bot of sortedBots) {
      let targetItem = null;
      let rationale = 'no_target_found';

      // Find nearest needed item that hasn't been assigned and bot doesn't already have
      let nearestDist = Infinity;
      for (const item of neededItems.values()) {
        if (assignedItemIds.has(item.id)) {
          continue; // Already assigned to another bot
        }
        // Don't assign items the bot is already carrying
        if (bot.inventory.includes(item.type)) {
          continue;
        }

        const dist = Math.abs(item.position[0] - bot.position.x) + Math.abs(item.position[1] - bot.position.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          targetItem = item;
          rationale = `nearest_unclaimed_dist_${dist}`;
        }
      }

      if (targetItem) {
        assignedItemIds.add(targetItem.id);
        assignments.set(bot.id, {
          botId: bot.id,
          targetItemId: targetItem.id,
          rationale,
        });
      } else {
        assignments.set(bot.id, {
          botId: bot.id,
          targetItemId: null,
          rationale: 'all_items_assigned',
        });
      }
    }

    return assignments;
  }

  /**
   * Calculate distance to nearest needed item for a bot
   */
  private nearestItemDistance(bot: any, neededItems: Map<string, any>): number {
    let minDist = Infinity;
    for (const item of neededItems.values()) {
      const dist = Math.abs(item.position[0] - bot.position.x) + Math.abs(item.position[1] - bot.position.y);
      minDist = Math.min(minDist, dist);
    }
    return minDist;
  }
}
