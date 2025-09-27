/**
 * 测试：Q/E 离散旋转相机 45°（上升沿触发，长按不连发）
 */
import { describe, it, expect } from 'vitest'
import { createWorld } from '../../src/domain/core/world.ts' // 引入：World 工厂
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线
import { cameraFollowSystem } from '../../src/domain/systems/camera-follow.ts' // 引入：相机系统
import { cameraRotateStepSystem } from '../../src/domain/systems/camera-rotate-step.ts' // 引入：相机离散旋转系统

function createInput() {
  const pressed = new Set()
  return {
    getState() { return { axes: { x: 0, y: 0 }, yawDelta: 0, pitchDelta: 0, wheelDelta: 0, pressed } },
    press(code) { pressed.add(code) },
    release(code) { pressed.delete(code) },
    resetFrameDeltas() {}
  }
}

function createRenderStub() {
  let lastState = null
  return {
    requestFrame() {}, render() {}, resize() {}, dispose() {},
    ensureEntity() {}, applyEntity() {}, removeEntity() {}, clearAll() {}, pick() { return null },
    applyCamera(state) { lastState = state },
    getLast() { return lastState }
  }
}

function createControlZero() {
  return { sampleFrame() { return { yawDelta: 0, pitchDelta: 0, zoomDelta: 0 } } }
}

function makeCamConfig() {
  return {
    yaw: 0,
    pitch: 0.3,
    distance: 12,
    height: 2,
    fovBase: 60,
    yawSpeed: 0.0015,
    pitchSpeed: 0.0012,
    zoomSpeed: 0.003,
    pitchMin: 0.1,
    pitchMax: 0.8,
    minDistance: 10,
    maxDistance: 20,
    followLag: 0.0, // 置 0 以避免阻尼影响，便于断言
    mouseLag: 0.0,
    deadzone: 0,
    maxDelta: 50
  }
}

const RAD45 = Math.PI / 4

describe('Camera rotate by Q/E 45°', () => {
  it('Q 左转 45°，长按不连发；松开再按再次触发', () => {
    const bus = createEventBus()
    const input = createInput()
    const render = createRenderStub()
    const world = createWorld({ bus, ports: { input, render } })
    world.registerSystem(cameraFollowSystem({ render, control: createControlZero(), config: makeCamConfig() }))
    world.registerSystem(cameraRotateStepSystem())

    world.step(0) // 建立订阅
    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(0, 6)

    input.press('KeyQ')
    world.step(0.016) // 本帧旋转系统发出 camera/force
    world.step(0.016) // 下一帧相机系统应用 yaw
    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(RAD45, 3)

    // 持续按住不应再次触发
    world.step(0.016)
    world.step(0.016)
    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(RAD45, 3)

    // 松开并再次按下 → 再加 45°
    input.release('KeyQ')
    world.step(0.016)
    input.press('KeyQ')
    world.step(0.016)
    world.step(0.016)
    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(RAD45 * 2, 3)
  })

  it('E 右转 45°，按键上升沿触发一次', () => {
    const bus = createEventBus()
    const input = createInput()
    const render = createRenderStub()
    const world = createWorld({ bus, ports: { input, render } })
    world.registerSystem(cameraFollowSystem({ render, control: createControlZero(), config: makeCamConfig() }))
    world.registerSystem(cameraRotateStepSystem())
    world.step(0)

    input.press('KeyE')
    world.step(0.016)
    world.step(0.016)
    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(-RAD45, 3)

    // 保持按住不应累加
    world.step(0.016)
    world.step(0.016)
    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(-RAD45, 3)
  })

  it('Q 后接 E 应回到约 0°', () => {
    const bus = createEventBus()
    const input = createInput()
    const render = createRenderStub()
    const world = createWorld({ bus, ports: { input, render } })
    world.registerSystem(cameraFollowSystem({ render, control: createControlZero(), config: makeCamConfig() }))
    world.registerSystem(cameraRotateStepSystem())
    world.step(0)

    input.press('KeyQ')
    world.step(0.016)
    world.step(0.016)
    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(RAD45, 3)

    input.release('KeyQ')
    world.step(0.016)
    input.press('KeyE')
    world.step(0.016)
    world.step(0.016)
    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(0, 3)
  })
})

