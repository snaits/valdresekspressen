import { BotAction } from './types';

export interface PathfindingBot {
  position: { x: number; y: number };
  [key: string]: any;
}

/**
 * Pathfinding module using BFS (Breadth-First Search)
 * Finds optimal routes around obstacles
 */
export class Pathfinder {
  private blockedCells: Set<string> = new Set();
  private cachedPath: [number, number][] = [];
  private cachedTarget: [number, number] | null = null;
  private cachedStart: [number, number] | null = null;
  private pathIndex: number = 0;
  private lastReachedPosition: [number, number] | null = null;

  /**
   * Find shortest path from start to target using BFS
   * Avoids other bots and discovered obstacles
   * @returns Array of [x, y] coordinates representing the path (including start and target)
   */
  findPath(
    start: [number, number],
    target: [number, number],
    gridWidth: number,
    gridHeight: number,
    bots: PathfindingBot[]
  ): [number, number][] {
    // Already at target
    if (start[0] === target[0] && start[1] === target[1]) {
      return [target];
    }

    const queue: Array<{ pos: [number, number]; path: [number, number][] }> = [
      { pos: start, path: [start] },
    ];
    const visited = new Set<string>();
    visited.add(`${start[0]},${start[1]}`);

    // Get other bot positions
    const botPositions = new Set(
      bots.map(b => `${b.position.x},${b.position.y}`)
    );

    while (queue.length > 0) {
      const { pos, path } = queue.shift()!;
      const [x, y] = pos;

      // Try all 4 directions (right, left, down, up)
      const neighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as [number, number][];

      for (const [nx, ny] of neighbors) {
        // Check bounds
        if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;

        const key = `${nx},${ny}`;

        // Check visited
        if (visited.has(key)) continue;

        // Check if blocked (known obstacle)
        if (this.blockedCells.has(key)) continue;

        // Check if other bot - but allow if it's the target (for dropoff coordination)
        const isBot = botPositions.has(key);
        if (isBot && !(nx === target[0] && ny === target[1])) continue;

        // Found target!
        if (nx === target[0] && ny === target[1]) {
          return [...path, [nx, ny]];
        }

        visited.add(key);
        queue.push({ pos: [nx, ny], path: [...path, [nx, ny]] });
      }
    }

    // No path found - return empty path
    return [];
  }

  /**
   * Get next move towards target using pathfinding
   * @returns BotAction for the next step along the path
   */
  moveTowardWithPath(
    botId: number,
    start: [number, number],
    target: [number, number],
    gridWidth: number,
    gridHeight: number,
    bots: PathfindingBot[]
  ): BotAction {
    // Check if target changed
    const targetChanged = !this.cachedTarget || this.cachedTarget[0] !== target[0] || this.cachedTarget[1] !== target[1];

    // Check if we're still on the cached path (at the expected position)
    const startChanged = !this.cachedStart || this.cachedStart[0] !== start[0] || this.cachedStart[1] !== start[1];

    // Check if path has become stale: pathIndex advanced but bot hasn't moved
    // This indicates the attempted move failed (hit a wall or obstacle)
    const noProgress = this.lastReachedPosition &&
                       this.lastReachedPosition[0] === start[0] &&
                       this.lastReachedPosition[1] === start[1] &&
                       this.pathIndex > 0;

    // Path is invalid if: target changed, start changed unexpectedly, we reached end, or no progress made
    const pathInvalid = this.pathIndex >= this.cachedPath.length || noProgress;

    if (targetChanged || startChanged || pathInvalid || this.cachedPath.length === 0) {
      // Recalculate path
      this.cachedPath = this.findPath(start, target, gridWidth, gridHeight, bots);
      this.cachedTarget = target;
      this.cachedStart = start;
      this.pathIndex = 0;
      this.lastReachedPosition = start;
    }

    if (this.cachedPath.length <= 1) {
      // No path or already at target
      return { bot: botId, action: 'wait' };
    }

    // Get next step from cached path
    const next = this.cachedPath[this.pathIndex + 1] || this.cachedPath[this.cachedPath.length - 1];
    const [x, y] = start;

    // Check if next cell is occupied by another bot
    const botPositions = new Set(
      bots.filter(b => !(b.position.x === x && b.position.y === y))
        .map(b => `${b.position.x},${b.position.y}`)
    );
    if (botPositions.has(`${next[0]},${next[1]}`)) {
      return { bot: botId, action: 'wait' };
    }

    // Move to next step
    this.pathIndex++;

    if (next[0] > x) return { bot: botId, action: 'move_right' };
    if (next[0] < x) return { bot: botId, action: 'move_left' };
    if (next[1] > y) return { bot: botId, action: 'move_down' };
    if (next[1] < y) return { bot: botId, action: 'move_up' };

    // Update last reached position to current position (for next call)
    this.lastReachedPosition = [x, y];

    return { bot: botId, action: 'wait' };
  }

  /**
   * Mark a cell as blocked (obstacle discovered)
   */
  blockCell(x: number, y: number): void {
    this.blockedCells.add(`${x},${y}`);
  }

  /**
   * Get all currently blocked cells
   */
  getBlockedCells(): string[] {
    return Array.from(this.blockedCells);
  }

  /**
   * Clear blocked cells cache (useful for testing or map changes)
   */
  clearBlockedCells(): void {
    this.blockedCells.clear();
    // Also clear path cache since the valid paths might have changed
    this.cachedPath = [];
    this.cachedTarget = null;
    this.cachedStart = null;
    this.pathIndex = 0;
    this.lastReachedPosition = null;
  }

  /**
   * Check if a cell is blocked
   */
  isBlocked(x: number, y: number): boolean {
    return this.blockedCells.has(`${x},${y}`);
  }
}
