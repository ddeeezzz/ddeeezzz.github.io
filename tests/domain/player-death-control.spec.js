/**
 * 测试：玩家死亡后禁用移动与开火，重生后恢复
 */

import { createWorld } from '../../src/domain/core/world.ts' // 引入：创建世界
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线
import { movementSystem } from '../../src/domain/systems/movement.ts' // 引入：移动系统
import { combatSystem } from '../../src/domain/systems/combat.ts' // 引入：战斗系统

function fakeInputPort(initialAxes = { x: 0, y: 0 }) {
  let axes = { ...initialAxes }
  const pressed = new Set()
  let lastClick = undefined
  return {
    getState() {
      return { axes, yawDelta: 0, pitchDelta: 0, wheelDelta: 0, pressed, lastClick }
    },
    setAxes(x, y) {
      axes = { x, y }
    },
    press(code) {
      pressed.add(code)
      if (code === 'MouseRight') lastClick = { xNdc: 0, yNdc: 0, button: 2 }
    },
    release(code) {
      pressed.delete(code)
    },
    resetFrameDeltas() {}
  }
}

describe('玩家死亡后的控制禁用', () => {
  it('移动：死亡后不再广播 transform，复活后恢复', () => {
    const bus = createEventBus()
    const input = fakeInputPort({ x: 0, y: 1 })
    const world = createWorld({ bus, ports: { input } })
    world.registerSystem(movementSystem({ maxSpeed: 5, acceleration: 1000, dampingTau: 0 }))

    // 初始相机朝向
    bus.emit({ type: 'camera/state', payload: { yaw: 0 } })

    let transforms = 0
    bus.on('entity/player/transform', () => transforms++)

    // 推进若干帧，产生变换
    for (let i = 0; i < 5; i++) world.step(0.1)
    expect(transforms).toBeGreaterThan(0)
    const baseline = transforms

    // 玩家死亡
    bus.emit({ type: 'entity/destroyed', payload: { id: 'player:1' } })
    for (let i = 0; i < 5; i++) world.step(0.1)
    // 死亡后不应再增长
    expect(transforms).toBe(baseline)

    // 玩家重生
    bus.emit({ type: 'respawn/complete', payload: { unitId: 'player:1', teamId: 'teamB', position: { x: 0, z: 0 } } })
    bus.emit({ type: 'player/spawn', payload: { x: 0, z: 0 } })
    for (let i = 0; i < 3; i++) world.step(0.1)
    // 复活后应恢复广播
    expect(transforms).toBeGreaterThan(baseline)
  })

  it('战斗：死亡后阻止按键开火，复活后恢复', () => {
    const bus = createEventBus()
    const input = fakeInputPort()
    const world = createWorld({ bus, ports: { input } })
    world.registerSystem(combatSystem())
    world.step(0) // 先推进一帧以建立订阅

    // 设置玩家位姿与目标环境，使系统具备开火条件
    bus.emit({ type: 'arena/spawn-points', payload: { A: [], B: [{ id: 'player:1', x: 0, z: 0 }] } })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } })

    let fireCount = 0
    bus.on('combat/fire', () => fireCount++)

    // 存活时右键触发一次
    input.press('MouseRight')
    world.step(0.016)
    input.release('MouseRight')
    world.step(0.016)
    expect(fireCount).toBeGreaterThan(0)
    const baseline = fireCount

    // 玩家死亡后再次右键，不应触发
    bus.emit({ type: 'entity/destroyed', payload: { id: 'player:1' } })
    input.press('MouseRight')
    world.step(0.016)
    input.release('MouseRight')
    world.step(0.016)
    expect(fireCount).toBe(baseline)

    // 玩家复活后可再次触发（右键）
    bus.emit({ type: 'respawn/complete', payload: { unitId: 'player:1', teamId: 'teamB', position: { x: 0, z: 0 } } })
    input.press('MouseRight')
    world.step(0.016)
    input.release('MouseRight')
    world.step(0.016)
    expect(fireCount).toBeGreaterThan(baseline)
  })
})
