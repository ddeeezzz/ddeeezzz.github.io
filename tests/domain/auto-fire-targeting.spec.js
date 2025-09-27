/**
 * 自动开火目标选择：
 * - 队列为空且最近敌方在攻击距离外 → 选择最近障碍物并发射。
 * - 队列为空且最近敌方在攻击距离内 → 选择最近敌方并发射。
 */
import { describe, it, expect } from 'vitest'
import { createWorld } from '../../src/domain/core/world.ts'
import { createEventBus } from '../../src/domain/core/event-bus.ts'

describe('AutoFire targeting priority', () => {
  it('无敌方在射程内时，优先攻击最近障碍物', async () => {
    const bus = createEventBus()
    const world = createWorld({ bus, ports: {} })
    // 动态导入以兼容别名/相对路径
    // 复位全局主实例标记，避免与其他测试并发冲突
    try { delete (globalThis).__autoFirePrimaryTaken } catch {}
    const { autoFireSystem } = await import('../../src/domain/systems/auto-fire.ts')
    world.registerSystem(autoFireSystem())

    const fires = []
    bus.on('combat/fire', (e) => fires.push(e.payload))

    // 初始化
    world.step(0)

    // 出生点：添加一个射手（teamA:0）与一个远处敌方（player:1）
    bus.emit({ type: 'arena/spawn-points', payload: { A: [{ id: 'teamA:0', x: 0, z: 0 }], B: [{ id: 'player:1', x: 10, z: 0 }] } })
    // 同步玩家位置（敌方在 10m 外，不在 4m 射程）
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 10, y: 0, z: 0 } } })
    // 障碍放在 2m 处
    bus.emit({ type: 'arena/obstacles', payload: [{ x: 2, z: 0, scale: 1 }] })

    // 推进 1.1s 触发一次开火
    world.step(1.1)

    expect(fires.length).toBe(1)
    const p = fires[0]
    // 应锁定并朝向障碍（+X 方向）
    expect(p.direction.x).toBeGreaterThan(0.7)
    expect(p.forceManualAim).toBe(true)
  })

  it('敌方在射程内时，优先攻击最近敌方', async () => {
    const bus = createEventBus()
    const world = createWorld({ bus, ports: {} })
    try { delete (globalThis).__autoFirePrimaryTaken } catch {}
    const { autoFireSystem } = await import('../../src/domain/systems/auto-fire.ts')
    world.registerSystem(autoFireSystem())

    const fires = []
    bus.on('combat/fire', (e) => fires.push(e.payload))

    world.step(0)
    // 射手与敌方（玩家）距离 2m（在 4m 射程内），同时存在更近的障碍但按规则仍应优先敌人
    bus.emit({ type: 'arena/spawn-points', payload: { A: [{ id: 'teamA:0', x: 0, z: 0 }], B: [{ id: 'player:1', x: 2, z: 0 }] } })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 2, y: 0, z: 0 } } })
    bus.emit({ type: 'arena/obstacles', payload: [{ x: 1, z: 0, scale: 1 }] })

    world.step(1.1)

    expect(fires.length).toBe(1)
    const p = fires[0]
    // 朝向 +X（敌人在 +X 方向 2m）
    expect(p.direction.x).toBeGreaterThan(0.7)
    expect(p.forceManualAim).toBe(true)
  })
})
