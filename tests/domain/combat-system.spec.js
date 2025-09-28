/**
 * 阶段8：战斗系统基础验证
 * - 按键 P 命中敌人应广播移除事件并清理渲染实体
 * - 按键 P 命中友军仅自毁光球，不影响友军实体
 */
import { createWorld } from '../../src/domain/core/world.ts'
import { createEventBus } from '../../src/domain/core/event-bus.ts'
import { combatSystem } from '../../src/domain/systems/combat.ts'
import { createSimplePhysicsAdapter } from '../../src/adapters/simple/physics-adapter.ts'

function createRightClickInput() {
  // 模拟：仅维护右键按下集合与最近一次点击的 NDC 坐标
  const pressed = new Set()
  let lastClick = undefined
  return {
    pressFire() {
      // 右键按下：记录按键并设置一次点击坐标（取屏幕中心 NDC=0,0，测试用渲染适配器忽略参数）
      pressed.add('MouseRight')
      lastClick = { xNdc: 0, yNdc: 0, button: 2 }
    },
    releaseFire() {
      pressed.delete('MouseRight')
    },
    getState() {
      return { axes: { x: 0, y: 0 }, yawDelta: 0, pitchDelta: 0, wheelDelta: 0, pressed: new Set(pressed), lastClick }
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

describe('CombatSystem', () => {


  it('按键 P 命中友军仅自毁光球', () => {
    const bus = createEventBus()
    const input = createRightClickInput()
    const render = createCombatRender()
    const physics = createSimplePhysicsAdapter(bus)
    const world = createWorld({ bus, ports: { input, render, physics } })
    world.registerSystem(combatSystem())

    world.step(0)

    const player = { id: 'player:1', x: 0, z: 0 }
    const ally = { id: 'teamB:0', x: 1.5, z: 0 }
    const enemy = { id: 'teamA:0', x: 10, z: 0 }
    bus.emit({ type: 'arena/spawn-points', payload: { A: [enemy], B: [player, ally], player } })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } })

    const removedEnemies = []
    bus.on('combat/enemy-removed', (e) => removedEnemies.push((e.payload || {}).id))

    input.pressFire()
    render.setPick({ objectId: 'ground', objectKind: 'ground', point: { x: 2, y: 0, z: 0 } })

    world.step(0.1)
    input.releaseFire()
    for (let i = 0; i < 12; i++) world.step(0.1)

    expect(removedEnemies).toHaveLength(0)
    const projectileRemovals = render.removed.filter((id) => id.startsWith('projectile'))
    expect(projectileRemovals.length).toBeGreaterThan(0)
    expect(render.removed).not.toContain('teamB:0')
  })



  it('竞技场重置后仍沿屏幕中心方向发射', () => {
    const bus = createEventBus()
    const input = createRightClickInput()
    const render = createCombatRender()
    const physics = createSimplePhysicsAdapter(bus)
    const world = createWorld({ bus, ports: { input, render, physics } })
    world.registerSystem(combatSystem())

    world.step(0)

    const player = { id: 'player:1', x: 0, z: 0 }
    const enemy = { id: 'teamA:0', x: 2, z: 0 }

    bus.emit({ type: 'arena/reset' })
    world.step(0)

    bus.emit({ type: 'arena/spawn-points', payload: { A: [enemy], B: [player], player } })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } })
    bus.emit({
      type: 'camera/state',
      payload: { yaw: 0, pitch: -0.3, distance: 10, height: 1.8, fov: 60, center: { x: 0, y: 0, z: 0 } }
    })

    render.setPick({ objectId: 'teamA:0', objectKind: 'teamA', point: { x: 0, y: 0, z: 3 } })

    input.pressFire()
    world.step(0.1)
    input.releaseFire()

    const projectileState = render.applied.get('projectile:0')
    expect(projectileState).toBeTruthy()
    expect(projectileState.rotationY).toBeDefined()
    expect(projectileState.rotationY).toBeCloseTo(Math.PI / 2, 2)
  })
})
