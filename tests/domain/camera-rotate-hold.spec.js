/**
 * 测试：Q/E 连续旋转（方案1：camera/adjust → target yaw，保留 followLag）
 */
import { describe, it, expect } from 'vitest'
import { createWorld } from '../../src/domain/core/world.ts' // 引入：World 工厂
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线
import { cameraFollowSystem } from '../../src/domain/systems/camera-follow.ts' // 引入：相机系统
import { cameraRotateHoldSystem } from '../../src/domain/systems/camera-rotate-hold.ts' // 引入：连续旋转系统

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

function createControlZero() { return { sampleFrame() { return { yawDelta: 0, pitchDelta: 0, zoomDelta: 0 } } } }

function makeCamConfigNoLag() {
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
    followLag: 0.0,
    mouseLag: 0.0,
    deadzone: 0,
    maxDelta: 50
  }
}

const RAD90 = Math.PI / 2

describe('Camera rotate by holding Q/E at 90°/s', () => {
  it('按住 Q 共 1.0s → yaw≈+90°；松开停止', () => {
    const bus = createEventBus()
    const input = createInput()
    const render = createRenderStub()
    const world = createWorld({ bus, ports: { input, render } })
    world.registerSystem(cameraFollowSystem({ render, control: createControlZero(), config: makeCamConfigNoLag() }))
    world.registerSystem(cameraRotateHoldSystem({ rateDegPerSec: 90 }))

    world.step(0)
    // 按住 Q 旋转总计 1.0s
    input.press('KeyQ')
    for (let i = 0; i < 10; i++) {
      world.step(0.1)
    }
    input.release('KeyQ')
    world.step(0.016)

    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(RAD90, 3)
  })

  it('按住 E 共 0.5s → yaw≈-45°；松开停止', () => {
    const bus = createEventBus()
    const input = createInput()
    const render = createRenderStub()
    const world = createWorld({ bus, ports: { input, render } })
    world.registerSystem(cameraFollowSystem({ render, control: createControlZero(), config: makeCamConfigNoLag() }))
    world.registerSystem(cameraRotateHoldSystem({ rateDegPerSec: 90 }))
    world.step(0)

    input.press('KeyE')
    for (let i = 0; i < 5; i++) world.step(0.1)
    input.release('KeyE')
    world.step(0.016)

    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(-(Math.PI / 4), 3)
  })

  it('同时按下 Q+E → 相互抵消（yaw 近似不变）', () => {
    const bus = createEventBus()
    const input = createInput()
    const render = createRenderStub()
    const world = createWorld({ bus, ports: { input, render } })
    world.registerSystem(cameraFollowSystem({ render, control: createControlZero(), config: makeCamConfigNoLag() }))
    world.registerSystem(cameraRotateHoldSystem({ rateDegPerSec: 90 }))
    world.step(0)

    input.press('KeyQ'); input.press('KeyE')
    for (let i = 0; i < 10; i++) world.step(0.1)
    input.release('KeyQ'); input.release('KeyE')
    world.step(0.016)

    expect(render.getLast()?.yaw ?? 0).toBeCloseTo(0, 4)
  })
})

