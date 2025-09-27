/**
 * TODO（阶段 3：相机系统测试）
 * - 验证夹角限制与阻尼收敛。
 * - 不依赖 Three：使用假 RenderPort 与 Control。
 */
// 引入世界与系统：用于在 Node 中推进逻辑
import { createWorld } from '../../src/domain/core/world.ts'
import { createEventBus } from '../../src/domain/core/event-bus.ts'
import { cameraFollowSystem } from '../../src/domain/systems/camera-follow.ts'

function createFakeRender() {
  return {
    last: null,
    requestFrame() {},
    render() {},
    resize() {},
    applyCamera(state) {
      this.last = state
    },
    dispose() {}
  }
}

describe('CameraFollowSystem', () => {
  it('pitch 夹角应被限制，lag=0 时立即生效', () => {
    const bus = createEventBus()
    const render = createFakeRender()
    const world = createWorld({ bus, ports: { render } })
    const control = { sampleFrame: () => ({ yawDelta: 0, pitchDelta: 10, zoomDelta: 0 }) }
    world.registerSystem(
      cameraFollowSystem({
        render,
        control,
        config: {
          yaw: 0,
          pitch: 0,
          distance: 5,
          height: 2,
          fovBase: 60,
          yawSpeed: 1,
          pitchSpeed: 0.2, // 10 * 0.2 = 2 -> 将被 clamp 到 0.5
          zoomSpeed: 0.5,
          pitchMin: -0.5,
          pitchMax: 0.5,
          minDistance: 3,
          maxDistance: 9,
          followLag: 0,
          mouseLag: 0,
          deadzone: 0,
          maxDelta: 999
        }
      })
    )
    world.step(0.016)
    expect(render.last.pitch).toBeCloseTo(0.5, 1)
  })

  it('yaw 阻尼应逐步逼近目标', () => {
    const bus = createEventBus()
    const render = createFakeRender()
    const world = createWorld({ bus, ports: { render } })
    let first = true
    const control = {
      sampleFrame: () => {
        if (first) {
          first = false
          return { yawDelta: 1, pitchDelta: 0, zoomDelta: 0 }
        }
        return { yawDelta: 0, pitchDelta: 0, zoomDelta: 0 }
      }
    }
    world.registerSystem(
      cameraFollowSystem({
        render,
        control,
        config: {
          yaw: 0,
          pitch: 0,
          distance: 5,
          height: 2,
          fovBase: 60,
          yawSpeed: 0.5, // 目标 yaw = 0.5
          pitchSpeed: 0.01,
          zoomSpeed: 0.5,
          pitchMin: -1,
          pitchMax: 1,
          minDistance: 3,
          maxDistance: 9,
          followLag: 0.1,
          mouseLag: 0.1,
          deadzone: 0,
          maxDelta: 999
        }
      })
    )

    world.step(0.016)
    const y1 = render.last.yaw
    world.step(0.016)
    const y2 = render.last.yaw
    expect(y1).toBeGreaterThan(0)
    expect(y2).toBeGreaterThan(y1) // 继续逼近目标
    expect(y2).toBeLessThan(0.5 + 1e-6)
  })

  it('相机被障碍阻挡时缩臂并在清除后恢复', () => {
    const bus = createEventBus()
    const render = createFakeRender()
    const physicsStub = {
      result: { hit: true, distance: 3.2 },
      sphereCast() {
        return this.result
      },
    }
    const world = createWorld({ bus, ports: { render, physics: physicsStub } })
    const control = { sampleFrame: () => ({ yawDelta: 0, pitchDelta: 0, zoomDelta: 0 }) }
    world.registerSystem(
      cameraFollowSystem({
        render,
        control,
        config: {
          yaw: 0,
          pitch: 0.3,
          distance: 6,
          height: 2,
          fovBase: 60,
          yawSpeed: 0.5,
          pitchSpeed: 0.1,
          zoomSpeed: 0.5,
          pitchMin: -0.2,
          pitchMax: 0.8,
          minDistance: 2,
          maxDistance: 8,
          followLag: 0.05,
          mouseLag: 0,
          deadzone: 0,
          maxDelta: 999
        },
      })
    )
    world.step(0.016)
    expect(render.last.distance).toBeLessThan(6)
    const clamped = render.last.distance
    physicsStub.result = { hit: false, distance: 10 }
    for (let i = 0; i < 60; i++) world.step(0.016)
    expect(render.last.distance).toBeGreaterThan(clamped)
  })

})
