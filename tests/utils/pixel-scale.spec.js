// 测试：像素到世界单位换算（透视相机）
import { describe, it, expect } from 'vitest' // 引入：Vitest 断言与结构
import { PerspectiveCamera } from 'three' // 引入：Three 透视相机类
import { worldUnitsPerPixelPerspective, worldSizeFromPixels } from '../../src/utils/pixel-scale' // 引入：待测工具函数

describe('pixel-scale 透视换算', () => {
  it('在已知 FOV/距离/视口下，ppu 与世界尺寸应匹配', () => {
    const cam = new PerspectiveCamera(60, 1, 0.1, 1000)
    const distance = 10
    const viewport = { widthPx: 1920, heightPx: 1080 }
    const ppu = worldUnitsPerPixelPerspective(cam, distance, viewport)
    // 期望：worldHeightAtD = 2 * d * tan(fov/2) = 20 * tan(30°) ≈ 11.547
    // ppu ≈ 11.547 / 1080 ≈ 0.01069（因 three 的 60° FOV）
    expect(ppu).toBeGreaterThan(0.009)
    expect(ppu).toBeLessThan(0.012)

    const { w, h } = worldSizeFromPixels(64, 8, cam, distance, viewport)
    expect(w).toBeCloseTo(ppu * 64, 5)
    expect(h).toBeCloseTo(ppu * 8, 5)
  })
})

