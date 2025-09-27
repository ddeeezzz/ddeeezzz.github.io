/**
 * 阶段5：玩家移动系统测试
 * - 直线位移 ≈ speed*dt
 * - 相机系方向映射正确
 * - 无输入时阻尼收敛到 0
 */

// 引入世界与事件总线：推进系统并发出相机状态
import { createWorld } from '../../src/domain/core/world.ts' // 引入：创建世界
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线
// 引入移动系统：被测目标
import { movementSystem, PLAYER_COLLISION_RADIUS } from '../../src/domain/systems/movement.ts' // 引入：移动系统

function fakeInputPort(axes = { x: 0, y: 0 }) {
  let _axes = { ...axes }
  const pressed = new Set()
  return {
    getState() {
      return { axes: _axes, yawDelta: 0, pitchDelta: 0, wheelDelta: 0, pressed }
    },
    setAxes(x, y) {
      _axes = { x, y }
    },
    resetFrameDeltas() {}
  }
}

describe('MovementSystem', () => {
  it('直线位移≈speed*dt（yaw=0，W前进→+X）', () => {
    const bus = createEventBus()
    const input = fakeInputPort({ x: 0, y: 1 })
    const world = createWorld({ bus, ports: { input } })
    world.registerSystem(movementSystem({ maxSpeed: 5, acceleration: 1000, dampingTau: 0 }))
    // 设置相机朝向 yaw=0
    bus.emit({ type: 'camera/state', payload: { yaw: 0 } })
    // 订阅玩家变换
    let last = null
    bus.on('entity/player/transform', (e) => (last = e.payload))
    // 推进 1s
    world.step(1)
    expect(last.position.x).toBeCloseTo(5, 2)
    expect(last.position.z).toBeCloseTo(0, 3)
  })

  it('相机系方向映射：yaw=PI/2 时 W 前进→+Z', () => {
    const bus = createEventBus()
    const input = fakeInputPort({ x: 0, y: 1 })
    const world = createWorld({ bus, ports: { input } })
    world.registerSystem(movementSystem({ maxSpeed: 4, acceleration: 1000, dampingTau: 0 }))
    // 先推进 0 帧以建立订阅，再设置相机朝向 yaw=PI/2
    world.step(0)
    bus.emit({ type: 'camera/state', payload: { yaw: Math.PI / 2 } })
    let last = null
    bus.on('entity/player/transform', (e) => (last = e.payload))
    world.step(1)
    expect(last.position.z).toBeCloseTo(4, 2)
    expect(last.position.x).toBeCloseTo(0, 3)
  })

  it('无输入时速度应阻尼收敛至 0', () => {
    const bus = createEventBus()
    const input = fakeInputPort({ x: 0, y: 1 })
    const world = createWorld({ bus, ports: { input } })
    world.registerSystem(movementSystem({ maxSpeed: 6, acceleration: 1000, dampingTau: 0.2 }))
    bus.emit({ type: 'camera/state', payload: { yaw: 0 } })
    // 第一帧：加速到最大
    world.step(0.1)
    // 停止输入
    input.setAxes(0, 0)
    // 多步阻尼
    for (let i = 0; i < 30; i++) world.step(0.1)
    // 取最后一次变换并估算速度接近 0（通过相邻两帧位移差近似）
    let tPrev = null, tCurr = null
    bus.on('entity/player/transform', (e) => {
      tPrev = tCurr
      tCurr = e.payload
    })
    world.step(0.1)
    const dx = Math.abs((tCurr.position.x - (tPrev?.position.x ?? tCurr.position.x)) / 0.1)
    const dz = Math.abs((tCurr.position.z - (tPrev?.position.z ?? tCurr.position.z)) / 0.1)
    expect(Math.hypot(dx, dz)).toBeLessThan(0.05)
  })

  it('遇到障碍时保持在障碍外侧', () => {
    const bus = createEventBus()
    const input = fakeInputPort({ x: 0, y: 1 })
    const world = createWorld({ bus, ports: { input } })
    world.registerSystem(movementSystem({ maxSpeed: 5, acceleration: 120, dampingTau: 0 }))
    world.step(0)
    bus.emit({ type: 'camera/state', payload: { yaw: 0 } })
    bus.emit({ type: 'arena/obstacles', payload: [{ x: 2, z: 0, scale: 1 }] })
    let last = null
    bus.on('entity/player/transform', (e) => (last = e.payload))
    const dt = 1 / 60
    for (let i = 0; i < 180; i++) world.step(dt)
    const dist = Math.hypot(last.position.x - 2, last.position.z)
    const obstacleRadius = 1 * 0.5 // obstacle.scale * 0.5
    expect(dist).toBeGreaterThanOrEqual(obstacleRadius + PLAYER_COLLISION_RADIUS - 1e-2)
    expect(dist).toBeLessThanOrEqual(obstacleRadius + PLAYER_COLLISION_RADIUS + 0.1)
  })

  it('接近边界时限制在安全范围内', () => {
    const bus = createEventBus()
    const input = fakeInputPort({ x: 0, y: -1 })
    const world = createWorld({ bus, ports: { input } })
    world.registerSystem(movementSystem({ maxSpeed: 6, acceleration: 120, dampingTau: 0 }))
    world.step(0)
    bus.emit({ type: 'camera/state', payload: { yaw: 0 } })
    bus.emit({ type: 'arena/bounds', payload: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 } })
    let last = null
    bus.on('entity/player/transform', (e) => (last = e.payload))
    const dt = 1 / 60
    for (let i = 0; i < 240; i++) world.step(dt)
expect(last.position.x).toBeGreaterThanOrEqual(-3 + PLAYER_COLLISION_RADIUS - 1e-2)
    expect(last.position.x).toBeLessThanOrEqual(-3 + PLAYER_COLLISION_RADIUS + 0.05)
  })

})

