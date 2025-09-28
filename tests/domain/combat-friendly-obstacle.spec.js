/**
 * 测试：光球穿过友军堆叠后仍需命中障碍
 * - 场景：玩家与两名友军沿 z 轴排成一列，前方存在障碍物。
 * - 期望：投射物连续忽略友军碰撞后，障碍物 HP 降至 50。
 */
import { describe, it, expect } from 'vitest' // 引入：测试框架 API
import { createWorld } from '../../src/domain/core/world.ts' // 引入：世界工厂
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线工厂
import { teamManagerSystem } from '../../src/domain/systems/team-manager.ts' // 引入：队伍管理系统，用于同步 HP
import { combatSystem } from '../../src/domain/systems/combat.ts' // 引入：战斗系统（被测对象）
import { createSimplePhysicsAdapter } from '../../src/adapters/simple/physics-adapter.ts' // 引入：简易物理适配器（负责球射线命中）

function createRightClickInput() {
  const pressed = new Set()
  let lastClick = undefined
  return {
    pressFire() {
      pressed.add('MouseRight')
      lastClick = { xNdc: 0, yNdc: 0, button: 2 }
    },
    releaseFire() {
      pressed.delete('MouseRight')
    },
    getState() {
      return {
        axes: { x: 0, y: 0 },
        yawDelta: 0,
        pitchDelta: 0,
        wheelDelta: 0,
        pressed: new Set(pressed),
        lastClick
      }
    },
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

describe('Combat projectile vs clustered friendlies', () => {
  it('友军堆叠时仍能命中障碍并扣血', () => {
    const bus = createEventBus()
    const input = createRightClickInput()
    const render = createCombatRender()
    const physics = createSimplePhysicsAdapter(bus)
    const world = createWorld({ bus, ports: { input, render, physics } })
    world.registerSystem(teamManagerSystem())
    world.registerSystem(combatSystem())

    world.step(0)

    const player = { id: 'player:1', x: 0, z: 0 }
    const allyFront = { id: 'teamB:0', x: 0, z: 0.9 }
    const allyCloser = { id: 'teamB:1', x: 0, z: 1.4 }
    bus.emit({ type: 'arena/spawn-points', payload: { A: [], B: [player, allyFront, allyCloser], player } })
    bus.emit({ type: 'arena/obstacles', payload: [{ x: 0, z: 2, scale: 1 }] })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } })

    const statsUpdates = []
    bus.on('team/stats-update', (e) => statsUpdates.push(e.payload))

    render.setPick({ objectId: 'obstacle:0', objectKind: 'obstacle', point: { x: 0, y: 0, z: 4 } })
    input.pressFire()
    world.step(0.05)
    input.releaseFire()

    for (let i = 0; i < 20; i++) {
      world.step(0.05)
    }

    const flat = statsUpdates.flat()
    expect(flat.find((u) => u?.unitId === 'obstacle:0' && u?.setHp === 50)).toBeTruthy()
  })
})
