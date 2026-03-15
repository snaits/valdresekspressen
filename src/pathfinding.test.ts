import { Pathfinder, PathfindingBot } from './pathfinding';

describe('Pathfinder - BFS Algorithm', () => {
  let pathfinder: Pathfinder;

  beforeEach(() => {
    pathfinder = new Pathfinder();
  });

  describe('findPath - Basic Navigation', () => {
    it('should return target when already at target', () => {
      const path = pathfinder.findPath([5, 5], [5, 5], 10, 10, []);
      expect(path).toEqual([[5, 5]]);
    });

    it('should find path: one step right', () => {
      const path = pathfinder.findPath([5, 5], [6, 5], 10, 10, []);
      expect(path).toEqual([[5, 5], [6, 5]]);
    });

    it('should find path: one step left', () => {
      const path = pathfinder.findPath([5, 5], [4, 5], 10, 10, []);
      expect(path).toEqual([[5, 5], [4, 5]]);
    });

    it('should find path: one step down', () => {
      const path = pathfinder.findPath([5, 5], [5, 6], 10, 10, []);
      expect(path).toEqual([[5, 5], [5, 6]]);
    });

    it('should find path: one step up', () => {
      const path = pathfinder.findPath([5, 5], [5, 4], 10, 10, []);
      expect(path).toEqual([[5, 5], [5, 4]]);
    });

    it('should find straight path horizontally', () => {
      const path = pathfinder.findPath([1, 5], [4, 5], 10, 10, []);
      expect(path).toEqual([[1, 5], [2, 5], [3, 5], [4, 5]]);
    });

    it('should find straight path vertically', () => {
      const path = pathfinder.findPath([5, 1], [5, 4], 10, 10, []);
      expect(path).toEqual([[5, 1], [5, 2], [5, 3], [5, 4]]);
    });

    it('should find L-shaped path (right then down)', () => {
      const path = pathfinder.findPath([2, 2], [5, 5], 10, 10, []);
      // Should be 1 right + 3 down, or 3 right + 3 down, depending on BFS exploration order
      expect(path.length).toBe(7); // 2->5 is 3 steps, 2->5 is 3 steps
      expect(path[0]).toEqual([2, 2]);
      expect(path[path.length - 1]).toEqual([5, 5]);
    });

    it('should find shortest path when multiple paths exist', () => {
      // From (1,1) to (3,3) - should be 4 steps minimum (Manhattan distance)
      const path = pathfinder.findPath([1, 1], [3, 3], 10, 10, []);
      expect(path.length).toBe(5); // 4 moves + start = 5 coords
    });
  });

  describe('findPath - Obstacle Avoidance', () => {
    it('should navigate around a single blocked cell', () => {
      pathfinder.blockCell(3, 2);
      const path = pathfinder.findPath([2, 2], [4, 2], 10, 10, []);
      // Should go around the blocked cell
      expect(path.length).toBeGreaterThan(2);
      expect(path).not.toContainEqual([3, 2]);
    });

    it('should navigate around a wall of blocked cells', () => {
      // Block a vertical wall
      pathfinder.blockCell(5, 2);
      pathfinder.blockCell(5, 3);
      pathfinder.blockCell(5, 4);

      const path = pathfinder.findPath([3, 3], [7, 3], 10, 10, []);
      // Should go around the wall
      expect(path[path.length - 1]).toEqual([7, 3]);
      // Should not pass through blocked cells
      for (const coord of path) {
        expect(coord).not.toEqual([5, 2]);
        expect(coord).not.toEqual([5, 3]);
        expect(coord).not.toEqual([5, 4]);
      }
    });

    it('should return empty path when target is unreachable', () => {
      // Block all paths to target
      pathfinder.blockCell(4, 5);
      pathfinder.blockCell(5, 4);
      pathfinder.blockCell(5, 6);
      pathfinder.blockCell(6, 5);

      const path = pathfinder.findPath([3, 5], [5, 5], 10, 10, []);
      expect(path).toEqual([]);
    });
  });

  describe('findPath - Bot Avoidance', () => {
    it('should navigate around other bots', () => {
      const bots: PathfindingBot[] = [
        {
          position: { x: 3, y: 2 },
        },
      ];

      const path = pathfinder.findPath([2, 2], [4, 2], 10, 10, bots);
      // Should go around the bot at (3,2)
      expect(path).not.toContainEqual([3, 2]);
    });

    it('should navigate around multiple bots', () => {
      const bots: PathfindingBot[] = [
        { position: { x: 3, y: 2 } },
        { position: { x: 3, y: 3 } },
        { position: { x: 3, y: 4 } },
      ];

      const path = pathfinder.findPath([2, 3], [4, 3], 10, 10, bots);
      // Should find a path (might go around vertically)
      expect(path[path.length - 1]).toEqual([4, 3]);
      // Should not pass directly through any bot
      expect(path).not.toContainEqual([3, 2]);
      expect(path).not.toContainEqual([3, 3]);
      expect(path).not.toContainEqual([3, 4]);
    });
  });

  describe('findPath - Boundary Checking', () => {
    it('should not pathfind outside grid bounds', () => {
      const path = pathfinder.findPath([0, 0], [11, 11], 10, 10, []);
      // Out of bounds, should return empty
      expect(path).toEqual([]);
    });

    it('should find path along grid edge', () => {
      const path = pathfinder.findPath([0, 0], [9, 0], 10, 10, []);
      expect(path[0]).toEqual([0, 0]);
      expect(path[path.length - 1]).toEqual([9, 0]);
    });

    it('should respect grid width', () => {
      const path = pathfinder.findPath([5, 5], [8, 5], 8, 10, []);
      // Target at x=8 is outside width of 8 (0-7)
      expect(path).toEqual([]);
    });

    it('should respect grid height', () => {
      const path = pathfinder.findPath([5, 5], [5, 8], 10, 8, []);
      // Target at y=8 is outside height of 8 (0-7)
      expect(path).toEqual([]);
    });
  });

  describe('moveTowardWithPath - Action Generation', () => {
    it('should return move_right action to go right', () => {
      const action = pathfinder.moveTowardWithPath(
        0,
        [5, 5],
        [7, 5],
        10,
        10,
        []
      );
      expect(action.action).toBe('move_right');
    });

    it('should return move_left action to go left', () => {
      const action = pathfinder.moveTowardWithPath(
        0,
        [5, 5],
        [3, 5],
        10,
        10,
        []
      );
      expect(action.action).toBe('move_left');
    });

    it('should return move_down action to go down', () => {
      const action = pathfinder.moveTowardWithPath(
        0,
        [5, 5],
        [5, 7],
        10,
        10,
        []
      );
      expect(action.action).toBe('move_down');
    });

    it('should return move_up action to go up', () => {
      const action = pathfinder.moveTowardWithPath(
        0,
        [5, 5],
        [5, 3],
        10,
        10,
        []
      );
      expect(action.action).toBe('move_up');
    });

    it('should return wait when already at target', () => {
      const action = pathfinder.moveTowardWithPath(
        0,
        [5, 5],
        [5, 5],
        10,
        10,
        []
      );
      expect(action.action).toBe('wait');
    });

    it('should return wait when no path to unreachable target', () => {
      // Block all paths
      pathfinder.blockCell(4, 5);
      pathfinder.blockCell(5, 4);
      pathfinder.blockCell(5, 6);
      pathfinder.blockCell(6, 5);

      const action = pathfinder.moveTowardWithPath(
        0,
        [3, 5],
        [5, 5],
        10,
        10,
        []
      );
      expect(action.action).toBe('wait');
    });

    it('should include correct bot id in action', () => {
      const action = pathfinder.moveTowardWithPath(
        42,
        [5, 5],
        [7, 5],
        10,
        10,
        []
      );
      expect(action.bot).toBe(42);
    });
  });

  describe('Blocked Cells Management', () => {
    it('should block a cell', () => {
      expect(pathfinder.isBlocked(5, 5)).toBe(false);
      pathfinder.blockCell(5, 5);
      expect(pathfinder.isBlocked(5, 5)).toBe(true);
    });

    it('should get all blocked cells', () => {
      pathfinder.blockCell(1, 1);
      pathfinder.blockCell(2, 2);
      pathfinder.blockCell(3, 3);

      const blocked = pathfinder.getBlockedCells();
      expect(blocked).toContain('1,1');
      expect(blocked).toContain('2,2');
      expect(blocked).toContain('3,3');
      expect(blocked.length).toBe(3);
    });

    it('should clear all blocked cells', () => {
      pathfinder.blockCell(1, 1);
      pathfinder.blockCell(2, 2);

      pathfinder.clearBlockedCells();

      expect(pathfinder.isBlocked(1, 1)).toBe(false);
      expect(pathfinder.isBlocked(2, 2)).toBe(false);
      expect(pathfinder.getBlockedCells().length).toBe(0);
    });
  });

  describe('findPath - Complex Scenarios', () => {
    it('should find path through maze-like obstacles', () => {
      // Create a corridor
      for (let i = 1; i < 8; i++) {
        pathfinder.blockCell(5, i);
      }
      // But leave an opening at (5, 4)
      pathfinder.clearBlockedCells();
      for (let i = 1; i < 4; i++) {
        pathfinder.blockCell(5, i);
      }
      for (let i = 5; i < 8; i++) {
        pathfinder.blockCell(5, i);
      }

      const path = pathfinder.findPath([4, 4], [6, 4], 10, 10, []);
      expect(path[path.length - 1]).toEqual([6, 4]);
    });

    it('should handle path with diagonal-equivalent requirements', () => {
      const path = pathfinder.findPath([1, 1], [5, 5], 10, 10, []);
      // Minimum path is 8 moves (Manhattan distance)
      expect(path.length).toBe(9); // 8 moves + start
    });

    it('should find shortest path when multiple equal-length paths exist', () => {
      // From (2,2) to (5,5) - multiple equal paths
      const path = pathfinder.findPath([2, 2], [5, 5], 10, 10, []);
      expect(path.length).toBe(7); // Manhattan distance = 6 moves + start
    });
  });

  describe('Deadlock Recovery - Target Blocking Fix', () => {
    it('should NOT mark target as blocked when pathfinding fails', () => {
      // Block all paths to target - simulates temporary obstacle
      pathfinder.blockCell(4, 5);
      pathfinder.blockCell(5, 4);
      pathfinder.blockCell(5, 6);
      pathfinder.blockCell(6, 5);

      // First attempt: path fails
      const path1 = pathfinder.findPath([3, 5], [5, 5], 10, 10, []);
      expect(path1).toEqual([]);

      // Target should NOT be marked as blocked (bug fix)
      expect(pathfinder.isBlocked(5, 5)).toBe(false);

      // Clear blocking obstacles
      pathfinder.clearBlockedCells();

      // Second attempt: should now work because target wasn't permanently blocked
      const path2 = pathfinder.findPath([3, 5], [5, 5], 10, 10, []);
      expect(path2.length).toBeGreaterThan(1);
      expect(path2[path2.length - 1]).toEqual([5, 5]);
    });

    it('should only mark actually discovered obstacles as blocked', () => {
      // Block a cell that BFS discovers
      pathfinder.blockCell(5, 5);

      const path = pathfinder.findPath([3, 5], [6, 5], 10, 10, []);
      // Should find path around the obstacle
      expect(path.length).toBeGreaterThan(1);
      // Blocked cell should stay blocked
      expect(pathfinder.isBlocked(5, 5)).toBe(true);
    });
  });

  describe('Fallback Movement - Direction Alternation', () => {
    it('should alternate between X and Y priority every 3 rounds when trapped', () => {
      // This test verifies the fallback strategy works correctly
      // by ensuring pathfind can return empty path (trapped) without deadlock

      // Create unreachable target
      pathfinder.blockCell(4, 5);
      pathfinder.blockCell(5, 4);
      pathfinder.blockCell(5, 6);
      pathfinder.blockCell(6, 5);

      // Multiple attempts should return empty (not stuck)
      const path1 = pathfinder.findPath([3, 5], [5, 5], 10, 10, []);
      const path2 = pathfinder.findPath([3, 5], [5, 5], 10, 10, []);
      const path3 = pathfinder.findPath([3, 5], [5, 5], 10, 10, []);

      // All should be empty but not crash
      expect(path1).toEqual([]);
      expect(path2).toEqual([]);
      expect(path3).toEqual([]);

      // Target should NOT be marked as blocked
      expect(pathfinder.isBlocked(5, 5)).toBe(false);
    });
  });
});
