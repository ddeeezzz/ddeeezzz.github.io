/**
 * 测试：玩家死亡后渲染不应立刻重建，重生后再重建
 */

import { createWorld } from '../../src/domain/core/world.ts' // 引入：创建世界
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线
import { renderSyncSystem } from '../../src/domain/systems/render-sync.ts' // 引入：渲染同步系统

function makeFakeRender() {
  const calls = { ensure: [], apply: [], remove: [] }
  return {
    calls,
    ensureEntity(id, kind) {
      calls.ensure.push({ id, kind })
    },
    applyEntity(id, tf) {
      calls.apply.push({ id, tf })
    },
    removeEntity(id) {
      calls.remove.push({ id })
    },
    applyCamera() {}
  }
}

describe('玩家死亡后的渲染控制', () => {
  it('死亡后不应重建玩家 Mesh，直至重生完成', () => {
    const bus = createEventBus()
    const render = makeFakeRender()
    const world = createWorld({ bus, ports: {} })
    world.registerSystem(renderSyncSystem(render, 'player:1'))

    // 初次推进，创建玩家 Mesh
    world.step(0)
    expect(render.calls.ensure.some((c) => c.id === 'player:1')).toBeTruthy()

    // 模拟玩家销毁（死亡）
    bus.emit({ type: 'entity/destroyed', payload: { id: 'player:1' } })
    const ensureCountAfterDestroy = render.calls.ensure.length

    // 多帧推进，不应再次 ensure
    for (let i = 0; i < 5; i++) world.step(0.016)
    expect(render.calls.ensure.length).toBe(ensureCountAfterDestroy)

    // 模拟玩家重生完成
    bus.emit({ type: 'respawn/complete', payload: { unitId: 'player:1', teamId: 'teamB', position: { x: 0, z: 0 } } })
    world.step(0)

    // 应在重生后再次重建 Mesh
    const timesEnsured = render.calls.ensure.filter((c) => c.id === 'player:1').length
    expect(timesEnsured).toBeGreaterThanOrEqual(2)
  })
})

