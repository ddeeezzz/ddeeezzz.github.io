/**
 * 阶段5：点击移动（左键）测试
 * - 左键点击屏幕中心应使玩家沿相机前向移动
 */
import { createWorld } from '../../src/domain/core/world.ts' // 引入：创建世界
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线
import { movementSystem } from '../../src/domain/systems/movement.ts' // 引入：移动系统

function fakeInputPortWithClick(xNdc = 0, yNdc = 0) {
  let clickArmed = false
  const pressed = new Set()
  return {
    getState() {
      const lastClick = clickArmed ? { xNdc, yNdc, button: 0 } : undefined
      clickArmed = false
      return { axes: { x: 0, y: 0 }, yawDelta: 0, pitchDelta: 0, wheelDelta: 0, pressed, lastClick }
    },
    armClick() { clickArmed = true },
    resetFrameDeltas() {}
  }
}

// 为测试创建的可配置的假渲染器
function createFakeRender(pickResult) {
  return {
    last: null,
    requestFrame() {},
    render() {},
    resize() {},
    applyCamera(state) {
      this.last = state
    },
    pick() {
      return pickResult
    },
    dispose() {}
  }
}

describe('ClickToMove', () => {
  it('左键点击地面时 → 玩家应朝目标点移动', () => {
    const bus = createEventBus()
    const input = fakeInputPortWithClick(0, 0)
    // 配置 fakeRender 在 pick 时返回一个地面上的点
    const render = createFakeRender({ objectId: 'ground', objectKind: 'ground', point: { x: 5, y: 0, z: 0 } })
    const world = createWorld({ bus, ports: { input, render } })
    world.registerSystem(movementSystem({ maxSpeed: 5, acceleration: 1000, dampingTau: 0 }))
    
    world.step(0) // 建立订阅

    let last = null
    bus.on('entity/player/transform', (e) => (last = e.payload))
    
    input.armClick()
    world.step(1) // 推进1秒，让玩家移动

    expect(last.position.x).toBeGreaterThan(0.1)
    expect(last.position.x).toBeCloseTo(5, 0)
  })

  it('左键点击单位时 → 玩家不应移动', () => {
    const bus = createEventBus()
    const input = fakeInputPortWithClick(0, 0)
    // 配置 fakeRender 在 pick 时返回一个 teamB 单位
    const render = createFakeRender({ objectId: 'teamB:1', objectKind: 'teamB', point: { x: 5, y: 0.5, z: 0 } })
    const world = createWorld({ bus, ports: { input, render } })
    world.registerSystem(movementSystem({ maxSpeed: 5, acceleration: 1000, dampingTau: 0 }))

    world.step(0) // 建立订阅

    let last = { position: { x: 0, z: 0 } } // 记录初始位置
    bus.on('entity/player/transform', (e) => (last = e.payload))

    input.armClick()
    world.step(1)

    // 验证玩家位置没有改变
    expect(last.position.x).toBeCloseTo(0)
    expect(last.position.z).toBeCloseTo(0)
  })
})

