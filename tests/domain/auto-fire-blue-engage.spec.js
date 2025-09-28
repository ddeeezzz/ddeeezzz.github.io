import { describe, it, expect } from 'vitest' // 引入：测试断言与套件 API
import { createWorld } from '../../src/domain/core/world' // 引入：World 工厂
import { createEventBus } from '../../src/domain/core/event-bus' // 引入：事件总线工厂

describe('AutoFire 蓝队逼近敌人', () => {
  it('障碍清空后蓝队锁定敌人并进入射程应触发开火', async () => {
    const bus = createEventBus()
    const world = createWorld({ bus, ports: {} })
    try { delete /** @type {any} */ (globalThis).__autoFirePrimaryTaken } catch {}
    const { autoFireSystem } = await import('../../src/domain/systems/auto-fire')
    world.registerSystem(autoFireSystem())

    const fires = []
    bus.on('combat/fire', (e) => fires.push(e.payload))

    world.step(0)

    bus.emit({ type: 'arena/obstacles', payload: [] })
    bus.emit({
      type: 'arena/spawn-points',
      payload: {
        A: [{ id: 'teamA:0', x: 0, z: 0 }],
        B: [
          { id: 'player:1', x: 12, z: 0 },
          { id: 'teamB:0', x: 18, z: 0 }
        ]
      }
    })

    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 12, y: 0, z: 0 } } })
    world.step(0.05)

    const approachFrames = [
      { enemyX: 2, allyX: 10 },
      { enemyX: 1, allyX: 6 },
      { enemyX: 0.2, allyX: 4 }
    ]

    approachFrames.forEach((frame) => {
      bus.emit({ type: 'unit/transform', payload: { id: 'teamA:0', teamId: 'teamA', position: { x: frame.enemyX, z: 0 } } })
      bus.emit({ type: 'unit/transform', payload: { id: 'teamB:0', teamId: 'teamB', position: { x: frame.allyX, z: 0 } } })
      world.step(0.25)
    })

    // 再推进 1.5 秒以跨越冷却周期并验证开火
    world.step(1.5)

    expect(fires.some((p) => p?.shooterId === 'teamB:0')).toBe(true)
  })
})
