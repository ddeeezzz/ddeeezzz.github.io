/**
 * 工具：像素到世界单位换算（透视相机）
 * - 作用：将固定的屏幕像素尺寸换算为给定距离处的世界尺寸，保证 UI 精灵（如血条）在屏幕上大小恒定。
 * - 说明：目前仅实现透视相机分支；如需正交相机可扩展。
 */
import type { PerspectiveCamera } from 'three' // 引入：Three 透视相机类型（仅类型）

/**
 * 计算：在给定距离处，1 像素对应多少世界单位（透视）
 * 参数：
 * - camera: PerspectiveCamera —— 透视相机
 * - distance: number —— 与相机的距离（米）
 * - viewport: { widthPx: number; heightPx: number } —— 视口像素大小
 * 返回：number —— 单位：世界单位/像素
 */
export function worldUnitsPerPixelPerspective(
  camera: PerspectiveCamera,
  distance: number,
  viewport: { widthPx: number; heightPx: number }
): number { // 导出：供渲染适配器/健康条组件换算使用
  // 计算给定距离处屏幕高度对应的世界高度，再除以像素高度得到每像素世界单位
  const fovRad = (camera.fov * Math.PI) / 180
  const worldHeightAtD = 2 * distance * Math.tan(fovRad / 2)
  return worldHeightAtD / Math.max(1, viewport.heightPx)
}

/**
 * 计算：给定像素宽高在指定距离处的世界宽高（透视）
 * 参数：
 * - widthPx/heightPx: number —— 目标像素尺寸
 * - camera: PerspectiveCamera —— 透视相机
 * - distance: number —— 与相机距离
 * - viewport: { widthPx: number; heightPx: number } —— 视口像素大小
 * 返回：{ w: number; h: number } —— 世界宽高
 */
export function worldSizeFromPixels(
  widthPx: number,
  heightPx: number,
  camera: PerspectiveCamera,
  distance: number,
  viewport: { widthPx: number; heightPx: number }
): { w: number; h: number } { // 导出：便捷计算接口
  const ppu = worldUnitsPerPixelPerspective(camera, distance, viewport)
  return { w: widthPx * ppu, h: heightPx * ppu }
}

