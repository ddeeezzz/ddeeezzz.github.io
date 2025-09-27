import { describe, it, expect } from 'vitest'
import { createEventBus } from '@domain/core/event-bus' // 引入：事件总线
import { createWorld } from '@domain/core/world' // 引入：世界工厂
import { aiWalkerSystem } from '@domain/systems/ai-walker' // 引入：AI 行走系统

// 简易渲染桩：仅提供 applyEntity 以避免空指针
function createRenderStub() {
  return {
    applyEntity: (_id, _state) => {},
    ensureEntity: (_id, _kind) => {}
  }
}

describe('ai-walker 障碍 Map 修复', () => {
  it('销毁低索引障碍后，仍能解析高索引锁定并持续移动', () => {
    const bus = createEventBus()
    const render = createRenderStub()
    const world = createWorld({ bus, ports: { render } })
    world.registerSystem(aiWalkerSystem())

    // 监听位移广播，记录单位位置
    const lastPos = new Map()
    bus.on('unit/transform', (e) => {
      const p = e.payload
      if (p?.id && p.position) {
        lastPos.set(p.id, { x: p.position.x, z: p.position.z })
        if (p.id === 'teamB:1') {
          // console.log('[TEST] teamB:1 transform', lastPos.get('teamB:1'))
        }
      }
    })

    // 先推进一帧以完成系统订阅
    world.step(0)

    // 广播障碍（两枚，索引 0 和 1）
    bus.emit({ type: 'arena/obstacles', payload: [
      { x: 10, z: 0, scale: 2.0 },
      { x: 12, z: 0, scale: 2.0 }
    ] })
    // 广播出生点（敌：teamA:0；友军：teamB:1）
    bus.emit({ type: 'arena/spawn-points', payload: {
      A: [{ id: 'teamA:0', x: -20, z: 0 }],
      B: [{ id: 'player:1', x: -30, z: 0 }, { id: 'teamB:1', x: 0, z: 0 }]
    } })

    // 锁定高索引障碍 obstacle:1
    bus.emit({ type: 'ai/locked-target', payload: { shooterId: 'teamB:1', teamId: 'teamB', lock: { kind: 'obstacle', id: 'obstacle:1' } } })

    // 推进 0.5s，应向 +x 移动 ~4m
    world.step(0.5)
    const p1 = lastPos.get('teamB:1')
    expect(p1).toBeTruthy()
    expect(p1.x).toBeGreaterThan(0)

    // 销毁低索引障碍 obstacle:0，不应影响对 obstacle:1 的解析
    bus.emit({ type: 'entity/destroyed', payload: { id: 'obstacle:0' } })

    // 再推进 0.5s，应继续向 +x 方向前进
    world.step(0.5)
    const p2 = lastPos.get('teamB:1')
    expect(p2.x).toBeGreaterThan(p1.x)
  })
})
