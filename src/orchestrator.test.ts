import { BotOrchestrator } from './orchestrator';

describe('BotOrchestrator', () => {
  let orchestrator: BotOrchestrator;

  beforeEach(() => {
    orchestrator = new BotOrchestrator();
  });

  describe('assignTargets - Basic Assignment', () => {
    it('should assign each bot to the nearest needed item', () => {
      const bots = [
        { id: 0, position: { x: 2, y: 5 }, inventory: [] },
        { id: 1, position: { x: 8, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [3, 5] }],
        ['item_cheese', { id: 'item_cheese', type: 'cheese', position: [9, 5] }],
      ]);

      const activeOrder = { id: 'order_1', items_required: ['butter', 'cheese'] };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Bot 0 (at 2,5) should target butter (at 3,5) - distance 1
      expect(assignments.get(0)?.targetItemId).toBe('item_butter');

      // Bot 1 (at 8,5) should target cheese (at 9,5) - distance 1
      expect(assignments.get(1)?.targetItemId).toBe('item_cheese');
    });

    it('should not assign the same item to multiple bots', () => {
      const bots = [
        { id: 0, position: { x: 5, y: 5 }, inventory: [] },
        { id: 1, position: { x: 6, y: 5 }, inventory: [] },
        { id: 2, position: { x: 7, y: 5 }, inventory: [] },
      ];

      // Only 1 butter available, 3 bots need it
      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [10, 5] }],
      ]);

      const activeOrder = { id: 'order_1', items_required: ['butter'] };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Count how many bots are assigned to the butter
      let buttAssignments = 0;
      for (const assignment of assignments.values()) {
        if (assignment.targetItemId === 'item_butter') {
          buttAssignments++;
        }
      }

      // Only 1 bot should be assigned to butter
      expect(buttAssignments).toBe(1);

      // Other bots should get null target
      const unassignedCount = Array.from(assignments.values()).filter(a => a.targetItemId === null).length;
      expect(unassignedCount).toBe(2);
    });

    it('should prioritize closer bots first when assigning items', () => {
      const bots = [
        { id: 0, position: { x: 2, y: 5 }, inventory: [] }, // Closer to butter
        { id: 1, position: { x: 8, y: 5 }, inventory: [] }, // Farther from butter
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [3, 5] }],
        ['item_cheese', { id: 'item_cheese', type: 'cheese', position: [3, 5] }], // Same location
      ]);

      const activeOrder = { id: 'order_1', items_required: ['butter', 'cheese'] };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Bot 0 (closer) should get butter
      expect(assignments.get(0)?.targetItemId).toBe('item_butter');

      // Bot 1 (farther) should get cheese
      expect(assignments.get(1)?.targetItemId).toBe('item_cheese');
    });

    it('should return null target when all items are assigned', () => {
      const bots = [
        { id: 0, position: { x: 2, y: 5 }, inventory: [] },
        { id: 1, position: { x: 3, y: 5 }, inventory: [] },
        { id: 2, position: { x: 4, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [5, 5] }],
        ['item_cheese', { id: 'item_cheese', type: 'cheese', position: [6, 5] }],
      ]);

      const activeOrder = { id: 'order_1', items_required: ['butter', 'cheese'] };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Bots 0, 1, 2 sorted by proximity: Bot 2 (dist 1), Bot 1 (dist 2), Bot 0 (dist 3)
      // Bot 2 gets butter (distance 1), Bot 1 gets cheese (distance 2), Bot 0 gets nothing
      const withTarget = Array.from(assignments.values()).filter(a => a.targetItemId !== null).length;
      const withoutTarget = Array.from(assignments.values()).filter(a => a.targetItemId === null).length;

      expect(withTarget).toBe(2);
      expect(withoutTarget).toBe(1);
      expect(assignments.get(0)?.rationale).toBe('all_items_assigned');
    });
  });

  describe('assignTargets - Edge Cases', () => {
    it('should return all waits when no active order', () => {
      const bots = [
        { id: 0, position: { x: 2, y: 5 }, inventory: [] },
        { id: 1, position: { x: 8, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map();
      const activeOrder = null;

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      for (const assignment of assignments.values()) {
        expect(assignment.targetItemId).toBeNull();
        expect(assignment.rationale).toBe('no_active_order');
      }
    });

    it('should return all waits when no items needed', () => {
      const bots = [
        { id: 0, position: { x: 2, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map();
      const activeOrder = { id: 'order_1', items_required: [] };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      for (const assignment of assignments.values()) {
        expect(assignment.targetItemId).toBeNull();
      }
    });

    it('should handle single bot correctly', () => {
      const bots = [
        { id: 0, position: { x: 5, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [7, 5] }],
      ]);

      const activeOrder = { id: 'order_1', items_required: ['butter'] };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      expect(assignments.size).toBe(1);
      expect(assignments.get(0)?.targetItemId).toBe('item_butter');
    });

    it('should calculate distances correctly (Manhattan distance)', () => {
      const bots = [
        { id: 0, position: { x: 5, y: 5 }, inventory: [] },
      ];

      // Item at (8, 8) - manhattan distance = |8-5| + |8-5| = 6
      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [8, 8] }],
      ]);

      const activeOrder = { id: 'order_1', items_required: ['butter'] };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      expect(assignments.get(0)?.rationale).toBe('nearest_unclaimed_dist_6');
    });
  });

  describe('assignTargets - Multi-Bot Scenarios', () => {
    it('should distribute items efficiently across 3 bots', () => {
      const bots = [
        { id: 0, position: { x: 2, y: 2 }, inventory: [] },
        { id: 1, position: { x: 5, y: 5 }, inventory: [] },
        { id: 2, position: { x: 8, y: 8 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['item_a', { id: 'item_a', type: 'butter', position: [3, 2] }], // Closest to bot 0
        ['item_b', { id: 'item_b', type: 'cheese', position: [5, 6] }], // Closest to bot 1
        ['item_c', { id: 'item_c', type: 'milk', position: [8, 9] }],   // Closest to bot 2
      ]);

      const activeOrder = { id: 'order_1', items_required: ['butter', 'cheese', 'milk'] };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Each bot gets assigned to a different item
      expect(assignments.get(0)?.targetItemId).toBe('item_a');
      expect(assignments.get(1)?.targetItemId).toBe('item_b');
      expect(assignments.get(2)?.targetItemId).toBe('item_c');
    });

    it('should have rationale for each assignment', () => {
      const bots = [
        { id: 0, position: { x: 5, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [7, 5] }],
      ]);

      const activeOrder = { id: 'order_1', items_required: ['butter'] };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      for (const assignment of assignments.values()) {
        expect(assignment.rationale).toBeDefined();
        expect(assignment.rationale.length).toBeGreaterThan(0);
      }
    });
  });
});
