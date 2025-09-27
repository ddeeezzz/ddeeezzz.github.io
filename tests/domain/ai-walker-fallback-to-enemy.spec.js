import { describe, it, expect } from 'vitest'
import { createEventBus } from '@domain/core/event-bus' // 引入：事件总线
import { createWorld } from '@domain/core/world' // 引入：世界工厂
import { aiWalkerSystem } from '@domain/systems/ai-walker' // 引入：AI 行走系统
import { autoFireSystem } from '../../src/domain/systems/auto-fire.ts' // 引入：自动开火系统（验证不会因敌方不在射程而强行锁定）

// 渲染桩：避免空指针
function createRenderStub() {
  return {
    applyEntity: (_id, _state) => {},
    ensureEntity: (_id, _kind) => {}
  }
}

describe('ai-walker 回退导航：障碍清空且存在敌方（不在射程内）→ 前往最近敌方', () => {
  it('当障碍为 0 且最近敌方不在射程内时，应朝最近敌方推进（而非原地等待）', () => {
    const bus = createEventBus()
    const render = createRenderStub()
    const world = createWorld({ bus, ports: { render } })
    world.registerSystem(aiWalkerSystem())
    world.registerSystem(autoFireSystem())

    // 记录位移
    const lastPos = new Map()
    bus.on('unit/transform', (e) => {
      const p = e.payload
      if (p?.id && p.position) lastPos.set(p.id, { x: p.position.x, z: p.position.z })
    })

    world.step(0)
    // 无障碍
    bus.emit({ type: 'arena/obstacles', payload: [] })
    // 敌方 1 个在 (20,0)（超出 4m 射程），我方行走 AI teamB:1 在 (0,0)
    bus.emit({ type: 'arena/spawn-points', payload: {
      A: [{ id: 'teamA:0', x: 20, z: 0 }],
      B: [{ id: 'player:1', x: 0, z: 0 }, { id: 'teamB:1', x: 0, z: 0 }],
      circle: { A: { center: { x: -40, z: -40 }, radius: 10 }, B: { center: { x: 40, z: 40 }, radius: 10 } },
      player: { id: 'player:1', x: 0, z: 0 }
    } })

    const before = { ...(lastPos.get('teamB:1') || { x: 0, z: 0 }) }
    world.step(1.0)
    const after = lastPos.get('teamB:1')
    const d0 = Math.hypot(before.x - 20, before.z - 0)
    const d1 = Math.hypot(after.x - 20, after.z - 0)
    expect(d1).toBeLessThan(d0) // 应靠近敌人
  })
})
