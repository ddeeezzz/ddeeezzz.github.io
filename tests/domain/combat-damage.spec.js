/**
 * 集成测试：CombatSystem 伤害逻辑
 * - 第一次命中敌人仅扣 50 HP，不触发击败事件。
 * - 第二次命中后 HP 归零，触发 combat/enemy-removed。
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
    setPick(result) {
      pickResult = result
    },
    pick() {
      return pickResult
    },
    removed,
    applied
  }
}

describe('CombatSystem damage flow', () => {
  it('两次命中敌人：先 -50 后归零并击败', () => {
    const bus = createEventBus()
    const input = createRightClickInput()
    const render = createCombatRender()
    const physics = createSimplePhysicsAdapter(bus)
    const world = createWorld({ bus, ports: { input, render, physics } })
    world.registerSystem(teamManagerSystem())
    world.registerSystem(combatSystem())

    world.step(0)

    const player = { id: 'player:1', x: 0, z: 0 }
    const enemy = { id: 'teamA:0', x: 0, z: 2 }
    bus.emit({ type: 'arena/spawn-points', payload: { A: [enemy], B: [player], player } })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } })

    const statsUpdates = []
    const removedEnemies = []
    bus.on('team/stats-update', (e) => statsUpdates.push(e.payload))
    bus.on('combat/enemy-removed', (e) => removedEnemies.push((e.payload || {}).id))

    // 第一次开火，沿屏幕中心向前
    render.setPick({ objectId: 'teamA:0', objectKind: 'teamA', point: { x: 0, y: 0, z: 3 } })
    input.pressFire()
    world.step(0.1)
    input.releaseFire()
    for (let i = 0; i < 3; i++) world.step(0.1)

    // 断言：仅有一次 setHp=50，不触发击败
    const flat1 = statsUpdates.flat()
    expect(flat1.find((u) => u?.unitId === 'teamA:0' && u?.setHp === 50)).toBeTruthy()
    expect(removedEnemies).toHaveLength(0)

    // 第二次开火，完成击败
    render.setPick({ objectId: 'teamA:0', objectKind: 'teamA', point: { x: 0, y: 0, z: 3 } })
    input.pressFire()
    world.step(0.1)
    input.releaseFire()
    for (let i = 0; i < 3; i++) world.step(0.1)

    expect(removedEnemies).toContain('teamA:0')
  })
})
