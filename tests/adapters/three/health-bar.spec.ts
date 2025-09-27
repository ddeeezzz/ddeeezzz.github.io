// 测试：基于 Sprite 的血条组件（不依赖 WebGL 渲染器）
import { describe, it, expect } from 'vitest' // 引入：Vitest 断言与结构
import * as THREE from 'three' // 引入：Three.js 基本类型
import { HealthBar } from '@adapters/three/health-bar' // 引入：待测血条组件（使用路径别名）

describe('HealthBar 基础行为', () => {
  it('前景锚点为左中，背景为居中', () => {
    const bar = new HealthBar({ widthPx: 64, heightPx: 8 })
    const owner = new THREE.Object3D()
    bar.attachTo(owner)
    const info = bar.getDebugInfo()
    expect(info.centers?.bg).toBeTruthy()
    expect(info.centers?.fg).toBeTruthy()
    expect(info.centers?.bg?.x).toBeCloseTo(0.5, 6)
    expect(info.centers?.bg?.y).toBeCloseTo(0.5, 6)
    expect(info.centers?.fg?.x).toBeCloseTo(0.0, 6)
    expect(info.centers?.fg?.y).toBeCloseTo(0.5, 6)
  })

  it('血量 0/50/100% 时前景宽度比例正确', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    const bar = new HealthBar({ widthPx: 100, heightPx: 10 })
    const owner = new THREE.Object3D()
    bar.attachTo(owner)
    const viewport = { widthPx: 1000, heightPx: 1000 }
    // 放置相机与目标
    cam.position.set(0, 0, 10)
    owner.position.set(0, 0, 0)

    // 100%
    bar.setHealth(100, 100)
    bar.updatePerFrame(cam, viewport)
    const info100 = bar.getDebugInfo()
    expect(info100.pct).toBeCloseTo(1, 6)
    const w100 = info100.worldW
    // 50%
    bar.setHealth(50, 100)
    bar.updatePerFrame(cam, viewport)
    const info50 = bar.getDebugInfo()
    expect(info50.pct).toBeCloseTo(0.5, 6)
    expect(info50.worldW).toBeCloseTo(w100, 6) // 背景不变
    // 0%
    bar.setHealth(0, 100)
    bar.updatePerFrame(cam, viewport)
    const info0 = bar.getDebugInfo()
    expect(info0.pct).toBeCloseTo(0, 6)
  })

  it('dispose 后标记为已释放', () => {
    const bar = new HealthBar()
    const owner = new THREE.Object3D()
    bar.attachTo(owner)
    bar.dispose()
    expect(bar.getDebugInfo().disposed).toBe(true)
  })
})

