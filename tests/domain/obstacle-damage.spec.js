/**
 * 集成测试：障碍物伤害与销毁
 * - 统一 HP=100，不显示数字（仅验证 HP 更新与销毁事件，不测 UI）。
 * - 右键两次命中同一障碍物：第一次 HP=50，第二次触发 entity/destroyed。
 */
import { describe, it, expect } from 'vitest'
import { createWorld } from '../../src/domain/core/world.ts'
import { createEventBus } from '../../src/domain/core/event-bus.ts'
import { teamManagerSystem } from '../../src/domain/systems/team-manager.ts'
import { combatSystem } from '../../src/domain/systems/combat.ts'
import { createSimplePhysicsAdapter } from '../../src/adapters/simple/physics-adapter.ts'

function createRightClickInput() {
  const pressed = new Set()
  let lastClick = undefined
  return {
    pressFire() { pressed.add('MouseRight'); lastClick = { xNdc: 0, yNdc: 0, button: 2 } },
    releaseFire() { pressed.delete('MouseRight') },
    getState() { return { axes: { x: 0, y: 0 }, yawDelta: 0, pitchDelta: 0, wheelDelta: 0, pressed: new Set(pressed), lastClick } },
    resetFrameDeltas() {}
  }
}

function createCombatRender() {
  const removed = []
  const applied = new Map()
  let pickResult = null
  return {
    ensureEntity() {},
    applyEntity(id, data) {
      const prev = applied.get(id) || {}
      applied.set(id, { ...prev, ...data })
    },
    removeEntity(id) {
      removed.push(id)
      applied.delete(id)
    },
    render() {},
    resize() {},
    requestFrame() {},
    applyCamera() {},
    dispose() {},
    setPick(result) { pickResult = result },
    pick() { return pickResult },
    removed,
    applied
  }
}

describe('Obstacle damage flow', () => {
  it('两次命中障碍物：先 -50 后归零并销毁', () => {
    const bus = createEventBus()
    const input = createRightClickInput()
    const render = createCombatRender()
    const physics = createSimplePhysicsAdapter(bus)
    const world = createWorld({ bus, ports: { input, render, physics } })
    world.registerSystem(teamManagerSystem())
    world.registerSystem(combatSystem())

    // 初始化系统（确保服务订阅就绪）
    world.step(0)

    // 构造玩家与障碍场景
    const player = { id: 'player:1', x: 0, z: 0 }
    bus.emit({ type: 'arena/spawn-points', payload: { A: [], B: [player], player } })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } })
    // 广播一个障碍物，位于玩家正前方 z=2
    bus.emit({ type: 'arena/obstacles', payload: [{ x: 0, z: 2, scale: 1 }] })

    const statsUpdates = []
    const destroyed = []
    bus.on('team/stats-update', (e) => statsUpdates.push(e.payload))
    bus.on('entity/destroyed', (e) => destroyed.push((e.payload || {}).id))

    // 第一次开火，沿屏幕中心向前（pick 指向障碍）
    render.setPick({ objectId: 'obstacle:0', objectKind: 'obstacle', point: { x: 0, y: 0, z: 3 } })
    input.pressFire()
    world.step(0.1)
    input.releaseFire()
    for (let i = 0; i < 3; i++) world.step(0.1)

    const flat1 = statsUpdates.flat()
    expect(flat1.find((u) => u?.unitId === 'obstacle:0' && u?.setHp === 50)).toBeTruthy()

    // 第二次开火，击毁障碍
    render.setPick({ objectId: 'obstacle:0', objectKind: 'obstacle', point: { x: 0, y: 0, z: 3 } })
    input.pressFire()
    world.step(0.1)
    input.releaseFire()
    for (let i = 0; i < 3; i++) world.step(0.1)

    expect(destroyed).toContain('obstacle:0')
  })
})
