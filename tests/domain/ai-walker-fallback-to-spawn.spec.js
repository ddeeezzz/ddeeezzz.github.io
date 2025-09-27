import { describe, it, expect } from 'vitest'
import { createEventBus } from '@domain/core/event-bus' // 引入：事件总线
import { createWorld } from '@domain/core/world' // 引入：世界工厂
import { aiWalkerSystem } from '@domain/systems/ai-walker' // 引入：AI 行走系统

// 简易渲染桩：仅提供 applyEntity 防止空指针
function createRenderStub() {
  return {
    applyEntity: (_id, _state) => {},
    ensureEntity: (_id, _kind) => {}
  }
}

describe('ai-walker 回退导航：障碍清空且无敌方 → 前往敌方出生圈', () => {
  it('当障碍物为 0 且场上无任何敌方单位时，应朝敌方出生圈中心移动', () => {
    const bus = createEventBus()
    const render = createRenderStub()
    const world = createWorld({ bus, ports: { render } })
    world.registerSystem(aiWalkerSystem())

    // 监听单位位移
    const lastPos = new Map()
    bus.on('unit/transform', (e) => {
      const p = e.payload
      if (p?.id && p.position) lastPos.set(p.id, { x: p.position.x, z: p.position.z })
    })

    world.step(0)

    // 广播：障碍清空
    bus.emit({ type: 'arena/obstacles', payload: [] })

    // 广播出生点与出生圈：仅 teamB:1 为行走 AI，敌方 teamA 空；敌方出生圈中心在 (-40,-40)
    const circleA = { center: { x: -40, z: -40 }, radius: 10 }
    const circleB = { center: { x: 40, z: 40 }, radius: 10 }
    bus.emit({ type: 'arena/spawn-points', payload: {
      A: [],
      B: [{ id: 'player:1', x: 0, z: 0 }, { id: 'teamB:1', x: 0, z: 0 }],
      circle: { A: circleA, B: circleB },
      player: { id: 'player:1', x: 0, z: 0 }
    } })

    // 推进 1 秒，应向敌方出生圈中心(-40,-40)方向移动（距离变小）
    const before = { ...(lastPos.get('teamB:1') || { x: 0, z: 0 }) }
    world.step(1.0)
    const after = lastPos.get('teamB:1')
    expect(after).toBeTruthy()
    const d0 = Math.hypot(before.x - circleA.center.x, before.z - circleA.center.z)
    const d1 = Math.hypot(after.x - circleA.center.x, after.z - circleA.center.z)
    expect(d1).toBeLessThan(d0)
  })
})

