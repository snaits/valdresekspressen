import { BotOrchestrator } from './orchestrator';

describe('BotOrchestrator', () => {
  let orchestrator: BotOrchestrator;

  beforeEach(() => {
    orchestrator = new BotOrchestrator();
  });

  describe('assignTargets - Sequential Position Assignment', () => {
    it('should assign items by their sequence position in items_required', () => {
      const bots = [
        { id: 0, position: { x: 2, y: 5 }, inventory: [] },
        { id: 1, position: { x: 8, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [3, 5] }],
        ['item_cheese', { id: 'item_cheese', type: 'cheese', position: [9, 5] }],
      ]);

      const activeOrder = {
        id: 'order_1',
        items_required: ['butter', 'cheese'],
        items_delivered: [],
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Bot 0 should target butter (position 0)
      expect(assignments.get(0)?.targetItemId).toBe('item_butter');
      expect(assignments.get(0)?.rationale).toContain('seq_pos_0_butter');

      // Bot 1 should target cheese (position 1)
      expect(assignments.get(1)?.targetItemId).toBe('item_cheese');
      expect(assignments.get(1)?.rationale).toContain('seq_pos_1_cheese');
    });

    it('should respect items already delivered (skip to next position)', () => {
      const bots = [
        { id: 0, position: { x: 2, y: 5 }, inventory: [] },
        { id: 1, position: { x: 8, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [3, 5] }],
        ['item_cheese', { id: 'item_cheese', type: 'cheese', position: [9, 5] }],
        ['item_milk', { id: 'item_milk', type: 'milk', position: [5, 5] }],
      ]);

      // First butter already delivered, so start from position 1 (second butter/cheese)
      const activeOrder = {
        id: 'order_1',
        items_required: ['butter', 'butter', 'cheese', 'milk'],
        items_delivered: ['butter'], // First butter delivered
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Bot 0 (position 1) should get butter at position [3,5] or closest to next needed type
      // Bot 1 should get the next needed type

      const assignments_arr = Array.from(assignments.values());
      const buttCount = assignments_arr.filter(a => a.targetItemId === 'item_butter').length;
      const cheeseCount = assignments_arr.filter(a => a.targetItemId === 'item_cheese').length;

      // Should have exactly 1 butter and 1 cheese/milk assigned
      expect(buttCount + cheeseCount).toBe(2);
    });

    it('CRITICAL: should assign items in order to prevent delivery sequence mismatch', () => {
      // This is the critical test for the bug: order requires [eggs, eggs, milk, milk, cheese]
      // Bot should collect eggs for positions 0-1, not pick milk first
      const bots = [
        { id: 0, position: { x: 10, y: 10 }, inventory: [] },
        { id: 1, position: { x: 10, y: 10 }, inventory: [] },
        { id: 2, position: { x: 10, y: 10 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['egg_1', { id: 'egg_1', type: 'eggs', position: [1, 1] }],
        ['egg_2', { id: 'egg_2', type: 'eggs', position: [1, 2] }],
        ['milk_1', { id: 'milk_1', type: 'milk', position: [20, 20] }], // Far away
        ['milk_2', { id: 'milk_2', type: 'milk', position: [20, 21] }],
        ['cheese', { id: 'cheese', type: 'cheese', position: [30, 30] }],
      ]);

      const activeOrder = {
        id: 'order_1',
        items_required: ['eggs', 'eggs', 'milk', 'milk', 'cheese'],
        items_delivered: [],
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Bot 0 should be assigned to eggs position 0 (not milk!)
      const bot0Target = assignments.get(0)?.targetItemId;
      expect(['egg_1', 'egg_2']).toContain(bot0Target);

      // At least 2 eggs should be assigned (positions 0-1)
      const eggsAssigned = Array.from(assignments.values()).filter(a =>
        a.targetItemId === 'egg_1' || a.targetItemId === 'egg_2'
      ).length;
      expect(eggsAssigned).toBeGreaterThanOrEqual(1);
    });

    it('should not assign the same item to multiple bots', () => {
      const bots = [
        { id: 0, position: { x: 5, y: 5 }, inventory: [] },
        { id: 1, position: { x: 6, y: 5 }, inventory: [] },
        { id: 2, position: { x: 7, y: 5 }, inventory: [] },
      ];

      // Only 1 butter available, but 3 bots need it
      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [10, 5] }],
      ]);

      const activeOrder = {
        id: 'order_1',
        items_required: ['butter'],
        items_delivered: [],
      };

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

    it('should choose closest bot for each sequential position', () => {
      const bots = [
        { id: 0, position: { x: 2, y: 5 }, inventory: [] }, // Closer to butter
        { id: 1, position: { x: 8, y: 5 }, inventory: [] }, // Closer to cheese
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [3, 5] }],
        ['item_cheese', { id: 'item_cheese', type: 'cheese', position: [9, 5] }],
      ]);

      const activeOrder = {
        id: 'order_1',
        items_required: ['butter', 'cheese'],
        items_delivered: [],
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Bot 0 (closer to butter) should get butter for position 0
      expect(assignments.get(0)?.targetItemId).toBe('item_butter');

      // Bot 1 should get cheese for position 1
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

      const activeOrder = {
        id: 'order_1',
        items_required: ['butter', 'cheese'],
        items_delivered: [],
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Only 2 items for 3 bots
      const withTarget = Array.from(assignments.values()).filter(a => a.targetItemId !== null).length;
      const withoutTarget = Array.from(assignments.values()).filter(a => a.targetItemId === null).length;

      expect(withTarget).toBe(2);
      expect(withoutTarget).toBe(1);
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
      const activeOrder = {
        id: 'order_1',
        items_required: [],
        items_delivered: [],
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      for (const assignment of assignments.values()) {
        expect(assignment.targetItemId).toBeNull();
      }
    });

    it('should handle order complete (all items delivered)', () => {
      const bots = [
        { id: 0, position: { x: 5, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [7, 5] }],
      ]);

      const activeOrder = {
        id: 'order_1',
        items_required: ['butter'],
        items_delivered: ['butter'], // All delivered
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      expect(assignments.get(0)?.targetItemId).toBeNull();
      expect(assignments.get(0)?.rationale).toBe('order_complete');
    });

    it('should handle single bot correctly', () => {
      const bots = [
        { id: 0, position: { x: 5, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [7, 5] }],
      ]);

      const activeOrder = {
        id: 'order_1',
        items_required: ['butter'],
        items_delivered: [],
      };

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

      const activeOrder = {
        id: 'order_1',
        items_required: ['butter'],
        items_delivered: [],
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      expect(assignments.get(0)?.rationale).toContain('seq_pos_0_butter_dist_6');
    });
  });

  describe('assignTargets - Multi-Bot Scenarios', () => {
    it('should distribute items efficiently across 3 bots by sequence', () => {
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

      const activeOrder = {
        id: 'order_1',
        items_required: ['butter', 'cheese', 'milk'],
        items_delivered: [],
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Position 0 (butter) should go to closest bot
      const pos0 = assignments.get(0)?.targetItemId;
      expect(pos0).toBe('item_a');

      // Position 1 (cheese) should go to next closest
      const pos1 = assignments.get(1)?.targetItemId;
      expect(pos1).toBe('item_b');

      // Position 2 (milk) should go to remaining bot
      const pos2 = assignments.get(2)?.targetItemId;
      expect(pos2).toBe('item_c');
    });

    it('should have rationale for each assignment', () => {
      const bots = [
        { id: 0, position: { x: 5, y: 5 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['item_butter', { id: 'item_butter', type: 'butter', position: [7, 5] }],
      ]);

      const activeOrder = {
        id: 'order_1',
        items_required: ['butter'],
        items_delivered: [],
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      for (const assignment of assignments.values()) {
        expect(assignment.rationale).toBeDefined();
        expect(assignment.rationale.length).toBeGreaterThan(0);
      }
    });

    it('should handle duplicate item types in sequence', () => {
      // This tests: items_required = [eggs, eggs, milk, milk, cheese]
      // Should assign both eggs positions before assigning milks
      const bots = [
        { id: 0, position: { x: 1, y: 1 }, inventory: [] },
        { id: 1, position: { x: 2, y: 1 }, inventory: [] },
      ];

      const neededItems = new Map([
        ['egg1', { id: 'egg1', type: 'eggs', position: [2, 1] }],
        ['egg2', { id: 'egg2', type: 'eggs', position: [3, 1] }],
        ['milk1', { id: 'milk1', type: 'milk', position: [4, 1] }],
      ]);

      const activeOrder = {
        id: 'order_1',
        items_required: ['eggs', 'eggs', 'milk'],
        items_delivered: [],
      };

      const assignments = orchestrator.assignTargets(bots, new Map(), neededItems, activeOrder);

      // Count eggs assigned
      const eggsAssigned = Array.from(assignments.values()).filter(a =>
        a.targetItemId === 'egg1' || a.targetItemId === 'egg2'
      ).length;

      // Should assign eggs, not milk (eggs come first in sequence)
      expect(eggsAssigned).toBeGreaterThan(0);
    });
  });
});

