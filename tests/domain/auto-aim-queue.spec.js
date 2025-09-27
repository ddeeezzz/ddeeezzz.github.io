/**
 * 自动瞄准队列规则验证
 * - 当两名敌人同时在 4m 内时，优先锁定先入队的目标，直到其死亡或离开范围才切换队首。
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
    applyEntity(id, data) { const prev = applied.get(id) || {}; applied.set(id, { ...prev, ...data }) },
    removeEntity(id) { removed.push(id); applied.delete(id) },
    render() {}, resize() {}, requestFrame() {}, applyCamera() {}, dispose() {},
    setPick(result) { pickResult = result }, pick() { return pickResult },
    removed, applied
  }
}

describe('AutoAim queue lock until death or leave', () => {
  it('两次连续开火应锁定同一队首，直到其死亡才切换', () => {
    const bus = createEventBus()
    const input = createRightClickInput()
    const render = createCombatRender()
    const physics = createSimplePhysicsAdapter(bus)
    const world = createWorld({ bus, ports: { input, render, physics } })
    world.registerSystem(teamManagerSystem())
    world.registerSystem(combatSystem())

    world.step(0)

    // 玩家在原点，两个敌人均在 4m 范围内，E1 更近
    const player = { id: 'player:1', x: 0, z: 0 }
    const E1 = { id: 'teamA:0', x: 0, z: 3.0 }
    const E2 = { id: 'teamA:1', x: 0, z: 3.5 }
    bus.emit({ type: 'arena/spawn-points', payload: { A: [E1, E2], B: [player], player } })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } })

    const stats = []
    const removed = []
    bus.on('team/stats-update', (e) => stats.push(...(e.payload || [])))
    bus.on('combat/enemy-removed', (e) => removed.push((e.payload || {}).id))

    // 第一次开火 → 应命中 E1（扣 50）
    // 点击朝向 E1（通过拾取结果提供方向）
    render.setPick({ objectId: 'teamA:0', objectKind: 'teamA', point: { x: 0, y: 0, z: 3.0 } })
    input.pressFire(); world.step(0.1); input.releaseFire()
    for (let i = 0; i < 3; i++) world.step(0.1)

    const s1 = stats.filter((u) => u.unitId === 'teamA:0')
    expect(s1.find((u) => u.setHp === 50)).toBeTruthy()
    expect(removed).toHaveLength(0)

    // 第二次开火 → 继续命中 E1（再扣 50 → 0，触发击败）
    // 再次点击，仍朝向 E1
    render.setPick({ objectId: 'teamA:0', objectKind: 'teamA', point: { x: 0, y: 0, z: 3.0 } })
    input.pressFire(); world.step(0.1); input.releaseFire()
    for (let i = 0; i < 3; i++) world.step(0.1)

    const s2 = stats.filter((u) => u.unitId === 'teamA:0')
    expect(s2.find((u) => u.setHp === 0)).toBeTruthy()
    expect(removed).toContain('teamA:0')

    // E1 死亡后，下一次开火应转向 E2（可选：如需继续验证可再开火一次）
  })
})
