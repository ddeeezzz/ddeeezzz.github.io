/**
 * 阶段6：竞技场与出生点测试
 * - 出生点在可行走区域且互不重叠
 * - 障碍数量/尺寸正确
 */
import { createWorld } from '../../src/domain/core/world.ts' // 引入：创建世界
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线
import { arenaSystem } from '../../src/domain/systems/arena.ts' // 引入：竞技场系统

function seededRng(seed = 1) {
  let s = seed >>> 0
  return {
    next() {
      // xorshift32
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5
      return ((s >>> 0) % 1000000) / 1000000
    }
  }
}

describe('ArenaSystem', () => {
  it('出生点与障碍应满足约束', () => {
    const bus = createEventBus()
    const rng = seededRng(42)
    const world = createWorld({ bus, ports: { rng } })
    const cfg = { size: 60, obstacleCount: 20, obstacleMin: 1.8, obstacleMax: 4.8, spawnPerTeam: 5, spawnMinDist: 2.5, spawnMargin: 2.0, spawnRadius: 6 }
    world.registerSystem(arenaSystem(cfg))

    let obstacles = []
    let spawns = null
    bus.on('arena/obstacles', (e) => (obstacles = e.payload))
    bus.on('arena/spawn-points', (e) => (spawns = e.payload))

    world.step(0)

    expect(obstacles.length).toBe(cfg.obstacleCount)
    for (const o of obstacles) {
      expect(o.scale).toBeGreaterThanOrEqual(cfg.obstacleMin)
      expect(o.scale).toBeLessThanOrEqual(cfg.obstacleMax)
      expect(Math.abs(o.x)).toBeLessThanOrEqual(cfg.size / 2)
      expect(Math.abs(o.z)).toBeLessThanOrEqual(cfg.size / 2)
    }

    expect(spawns.A.length).toBe(cfg.spawnPerTeam)
    expect(spawns.B.length).toBe(cfg.spawnPerTeam)
    expect(spawns.circle).toBeTruthy()
    expect(spawns.circle.A.radius).toBeGreaterThan(0)
    expect(spawns.circle.B.radius).toBeGreaterThan(0)
    const playerSpawn = spawns.B[0]
    const distToCenter = Math.hypot(playerSpawn.x - spawns.circle.B.center.x, playerSpawn.z - spawns.circle.B.center.z)
    expect(distToCenter).toBeLessThanOrEqual(spawns.circle.B.radius + 1e-6)
    const all = [...spawns.A, ...spawns.B]
    for (let i = 0; i < all.length; i++) {
      const p = all[i]
      expect(Math.abs(p.x)).toBeLessThanOrEqual(cfg.size / 2 - cfg.spawnMargin + 1e-6)
      expect(Math.abs(p.z)).toBeLessThanOrEqual(cfg.size / 2 - cfg.spawnMargin + 1e-6)
      for (let j = i + 1; j < all.length; j++) {
        const q = all[j]
        const dx = p.x - q.x
        const dz = p.z - q.z
        const d = Math.hypot(dx, dz)
        expect(d).toBeGreaterThanOrEqual(cfg.spawnMinDist - 1e-6)
      }
      // 避障
      for (const o of obstacles) {
        const d = Math.hypot(p.x - o.x, p.z - o.z)
        expect(d).toBeGreaterThanOrEqual(o.scale + cfg.spawnMargin - 1e-6)
      }
    }
  })
})



