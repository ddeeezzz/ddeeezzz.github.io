/**
 * 阶段9：移动系统复活订阅校验
 * - 确保 respawn/complete 监听仅注册一次
 * - 防止复活日志重复触发
 */
import { createWorld } from '../../src/domain/core/world.ts' // 导入：创建领域世界实例
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 导入：事件总线工厂
import { movementSystem } from '../../src/domain/systems/movement.ts' // 导入：移动系统构建函数

/**
 * 构造伪输入端口
 * @param {{ x: number; y: number }} axes 初始轴向输入
 * @returns {{ getState: () => { axes: { x: number; y: number }; yawDelta: number; pitchDelta: number; wheelDelta: number; pressed: Set<string> }; setAxes: (x: number, y: number) => void; resetFrameDeltas: () => void }} 伪输入端口实现
 */
function fakeInputPort(axes = { x: 0, y: 0 }) {
  let currentAxes = { ...axes }
  const pressed = new Set()
  return {
    getState() {
      return { axes: currentAxes, yawDelta: 0, pitchDelta: 0, wheelDelta: 0, pressed }
    },
    setAxes(x, y) {
      currentAxes = { x, y }
    },
    resetFrameDeltas() {}
  }
}

describe('MovementSystem Respawn Dedup', () => {
  it('复活事件监听仅注册一次', () => {
    const bus = createEventBus()
    const originalOn = bus.on
    const respawnSubscriptions = []

    bus.on = (type, fn) => {
      if (type === 'respawn/complete') {
        respawnSubscriptions.push(fn)
      }
      return originalOn(type, fn)
    }

    const input = fakeInputPort()
    const world = createWorld({ bus, ports: { input } })
    world.registerSystem(movementSystem({ maxSpeed: 5, acceleration: 120, dampingTau: 0.15 }))

    world.step(0)
    world.step(0.016)
    world.step(0.032)

    expect(respawnSubscriptions.length).toBe(1)
    expect(new Set(respawnSubscriptions).size).toBe(1)
  })
})
