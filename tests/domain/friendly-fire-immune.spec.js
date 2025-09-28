/**
 * 集成测试：友军免伤（来源队伍判断）
 * - 玩家（teamB）发出的光球命中 teamB 单位时，不扣 HP、不移除友军，仅移除投射物。
 */
import { describe, it, expect } from 'vitest' // 引入：测试框架 API
import { createWorld } from '../../src/domain/core/world.ts' // 引入：World 工厂
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线
import { teamManagerSystem } from '../../src/domain/systems/team-manager.ts' // 引入：队伍管理系统（用于 HP 同步）
import { combatSystem } from '../../src/domain/systems/combat.ts' // 引入：战斗系统（被测）
import { createSimplePhysicsAdapter } from '../../src/adapters/simple/physics-adapter.ts' // 引入：简单物理适配器（碰撞）

function createRightClickInput() {
  // 模拟：右键按下触发与点击坐标
  const pressed = new Set()
  let lastClick = undefined
  return {
    pressFire() { pressed.add('MouseRight'); lastClick = { xNdc: 0, yNdc: 0, button: 2 } }, // 模拟：按下右键
    releaseFire() { pressed.delete('MouseRight') }, // 模拟：松开右键
    getState() { return { axes: { x: 0, y: 0 }, yawDelta: 0, pitchDelta: 0, wheelDelta: 0, pressed: new Set(pressed), lastClick } }, // 返回：输入状态
    resetFrameDeltas() {}
  }
}

function createCombatRender() {
  const removed = []
  const applied = new Map()
  let pickResult = null
  return {
    ensureEntity() {},
    applyEntity(id, data) { const prev = applied.get(id) || {}; applied.set(id, { ...prev, ...data }) }, // 记录：实体变换
    removeEntity(id) { removed.push(id); applied.delete(id) }, // 记录：移除实体
    render() {}, resize() {}, requestFrame() {}, applyCamera() {}, dispose() {},
    setPick(result) { pickResult = result }, // 设置：拾取结果
    pick() { return pickResult }, // 返回：拾取结果
    removed, applied
  }
}

describe('Friendly fire immunity by projectile source team', () => {
  it('命中友军应免伤：不发出 setHp=50，友军不被移除', () => {
    const bus = createEventBus()
    const input = createRightClickInput()
    const render = createCombatRender()
    const physics = createSimplePhysicsAdapter(bus)
    const world = createWorld({ bus, ports: { input, render, physics } })
    world.registerSystem(teamManagerSystem())
    world.registerSystem(combatSystem())

    world.step(0)

    const player = { id: 'player:1', x: 0, z: 0 }
    const ally = { id: 'teamB:0', x: 0, z: 2 }
    const enemy = { id: 'teamA:0', x: 10, z: 0 }
    bus.emit({ type: 'arena/spawn-points', payload: { A: [enemy], B: [player, ally], player } })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } })

    const statsUpdates = []
    bus.on('team/stats-update', (e) => statsUpdates.push(e.payload))

    // 向前开火命中友军 teamB:0
    render.setPick({ objectId: 'teamB:0', objectKind: 'teamB', point: { x: 0, y: 0, z: 3 } })
    input.pressFire(); world.step(0.1); input.releaseFire()
    for (let i = 0; i < 12; i++) world.step(0.1)

    // 验证：未产生 setHp=50 的写入（免伤）
    const flat = statsUpdates.flat()
    expect(flat.find((u) => u?.unitId === 'teamB:0' && u?.setHp === 50)).toBeFalsy()

    // 友军未被移除，仅投射物被移除（通过 render.removed 中的 projectiles）
    expect(render.removed).not.toContain('teamB:0')
    const projectileRemovals = render.removed.filter((id) => id.startsWith('projectile'))
    expect(projectileRemovals.length).toBeGreaterThan(0)
  })
})
