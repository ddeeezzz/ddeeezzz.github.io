/**
 * 组件：基于 Sprite 的头顶血条（Three.js）
 * - 结构：背景条（深灰）+ 前景条（颜色随血量渐变），前景使用左中锚点实现从左向右缩放。
 * - 尺寸：通过相机参数将固定像素尺寸换算为世界尺寸，保证远近大小恒定。
 * - 遮挡：默认随场景遮挡（depthTest=true，depthWrite=false）。
 */
import * as THREE from 'three' // Three.js 渲染核心库
import { worldSizeFromPixels } from '../../utils/pixel-scale' // 引入：像素→世界尺寸换算工具（相对路径）
// 顶部像素间距（用于血条与模型顶部在屏幕上的留白）
const TOP_MARGIN_PX = 30

/**
 * 类型：HealthBar 构造参数
 */
export interface HealthBarOptions { // 导出：构造选项，供渲染适配器内部使用
  widthPx?: number
  heightPx?: number
  maxHp?: number
  /**
   * 偏移配置：
   * - auto: 是否根据宿主的高度自动计算基础 Y 偏移；默认 true。
   * - extra: 额外的“世界单位”Y 偏移（与宿主等比，随后通过 invSy 抵消宿主缩放影响）。
   * - pixelExtra: 额外的“屏幕像素”Y 偏移，会在每帧中按相机距离换算为世界单位后叠加，仅用于视觉上把血条再上提若干像素。
   */
  offset?: { auto?: boolean; extra?: number; pixelExtra?: number }
  debug?: boolean
}

/**
 * 类：HealthBar
 * - 调用 attachTo 绑定宿主；setHealth 更新数值；updatePerFrame 进行像素锁定缩放。
 */
export class HealthBar { // 导出：血条组件类，供 three 渲染适配器实例化
  private readonly widthPx: number
  private readonly heightPx: number
  private readonly maxHp: number
  private readonly debug: boolean
  private readonly offsetCfg: { auto: boolean; extra: number; pixelExtra: number }

  private owner: THREE.Object3D | null = null
  private group: THREE.Group | null = null
  private bg: THREE.Sprite | null = null
  private fg: THREE.Sprite | null = null
  private bgMat: THREE.SpriteMaterial | null = null
  private fgMat: THREE.SpriteMaterial | null = null
  // 复用的临时四元数：用于将血条容器对齐到相机坐标轴
  private _qOwner = new THREE.Quaternion()
  private _qLocal = new THREE.Quaternion()
  private pct = 1
  private cachedWorldW = 0
  private cachedWorldH = 0
  private offsetY = 1.2 // 初始回退值（若无法计算包围盒时使用）
  private ensuredOffset = false
    private _lastHeight = 0 // 上次计算的包围盒高度（用于检测变化）

  /**
   * 构造函数
   */
  constructor(opts?: HealthBarOptions) {
    this.widthPx = Math.max(1, Math.floor(opts?.widthPx ?? 64))
    this.heightPx = Math.max(1, Math.floor(opts?.heightPx ?? 8))
    this.maxHp = Math.max(1, Math.floor(opts?.maxHp ?? 100))
    this.debug = !!opts?.debug
    this.offsetCfg = {
      auto: opts?.offset?.auto !== false,
      extra: opts?.offset?.extra ?? 0.155,
      // 新增：像素级额外上移，默认 0；仅在需要（例如障碍物）时由外部传入
      pixelExtra: Math.max(0, Math.floor(opts?.offset?.pixelExtra ?? 0))
    }
    // 调试日志已按需求注释：
    // if (this.debug) console.debug('[血条] 已创建', { widthPx: this.widthPx, heightPx: this.heightPx })
  }

  /**
   * 绑定到宿主对象（通常为角色 Mesh）。
   */
  attachTo(owner: THREE.Object3D): void {
    if (this.disposed) return
    this.owner = owner

    // 容器：将 Sprite 放在 group 中，便于整体偏移与清理
    const group = new THREE.Group()
    group.name = 'HealthBarGroup'
    this.group = group

    // 背景材质与精灵
    this.bgMat = new THREE.SpriteMaterial({ color: 0x222222, depthTest: true, depthWrite: false })
    const bg = new THREE.Sprite(this.bgMat)
    // 背景中心默认 0.5,0.5 —— 以中点对齐
    bg.center.set(0.5, 0.5)
    bg.name = 'HB_BG'
    bg.renderOrder = 1 // 背景先绘制，避免与前景抖动
    this.bg = bg

    // 前景材质与精灵：颜色在 setHealth 中更新
    this.fgMat = new THREE.SpriteMaterial({ color: 0x00ff00, depthTest: true, depthWrite: false })
    const fg = new THREE.Sprite(this.fgMat)
    // 关键：左中锚点，实现从左到右增长
    fg.center.set(0.0, 0.5)
    fg.name = 'HB_FG'
    fg.renderOrder = 2 // 前景后绘制，覆盖背景
    this.fg = fg

    // 将前景向左平移半个背景宽度（世界单位），该偏移在 updatePerFrame 中根据实时宽度更新
    fg.position.set(0, 0, 0)

    group.add(bg)
    group.add(fg)
    owner.add(group)
    // if (this.debug) console.debug('[血条] 已绑定到实体')

    // 初次尝试计算偏移（基于包围盒），失败则在 updatePerFrame 再次尝试
    this.ensureOffsetY()
  }

  /**
   * 更新 HP 数值（0..max），内部换算为百分比并更新前景颜色与缩放因子。
   */
  setHealth(curr: number, max?: number): void {
    if (this.disposed) return
    const m = Math.max(1, Math.floor(max ?? this.maxHp))
    const c = Math.max(0, Math.min(m, Math.floor(curr)))
    this.pct = m > 0 ? c / m : 0
    // HSL 渐变：0→红(0) 到 1→绿(1/3)，保持饱和度与亮度
    const hue = 0.3333 * this.pct
    this.fgMat?.color.setHSL(hue, 1.0, 0.5)
    // if (this.debug) console.debug('[血条] 更新', { curr: c, max: m, pct: this.pct.toFixed(3) })
  }

  /**
   * 每帧更新像素锁定尺寸与位置偏移。
   */
  updatePerFrame(camera: THREE.PerspectiveCamera, viewport: { widthPx: number; heightPx: number }): void {
    if (this.disposed || !this.owner || !this.group || !this.bg || !this.fg || !this.bgMat || !this.fgMat) return

    // 若需要，尝试计算头顶偏移
    if (!this.ensuredOffset) this.ensureOffsetY()

    // 计算与相机的距离（用宿主世界位置）
    const worldPos = new THREE.Vector3()
    this.owner.getWorldPosition(worldPos)
    const dist = camera.position.distanceTo(worldPos)

    // 将像素尺寸换算为世界尺寸
    const { w, h } = worldSizeFromPixels(this.widthPx, this.heightPx, camera, Math.max(0.001, dist), { widthPx: viewport.widthPx, heightPx: viewport.heightPx })
    this.cachedWorldW = w
    this.cachedWorldH = h
    // 抵消宿主缩放：确保血条在屏幕上为固定像素尺寸，不随宿主 scale 放大/缩小
    const ownerScale = new THREE.Vector3()
    this.owner.getWorldScale(ownerScale)
    const invSx = ownerScale.x !== 0 ? 1 / ownerScale.x : 1
    const invSy = ownerScale.y !== 0 ? 1 / ownerScale.y : 1
    const invSz = ownerScale.z !== 0 ? 1 / ownerScale.z : 1
    this.group.scale.set(invSx, invSy, invSz)

    // 背景全长显示；前景按百分比缩放 X
    this.bg.scale.set(w, h, 1)
    this.fg.scale.set(Math.max(0, w * this.pct), h, 1)
    // 前景左对齐：相对于背景中心，向左移动半个背景宽度
    this.fg.position.set(-w / 2, 0, 0)

    // 容器朝向：将容器的世界朝向对齐到相机，使局部 X 与屏幕水平一致（避免前景/背景看似分离）
    // 计算本地旋转：ownerWorld^-1 * cameraWorld
    this.owner.getWorldQuaternion(this._qOwner)
    this._qLocal.copy(this._qOwner).invert().multiply(camera.quaternion)
    this.group.quaternion.copy(this._qLocal)

    // 计算像素级额外 Y 偏移：根据相机距离将 pixelExtra 像素转换为世界单位
    let extraWorldY = 0
    if (this.offsetCfg.pixelExtra > 0) {
      const pixelToWorld = worldSizeFromPixels(1, this.offsetCfg.pixelExtra, camera, Math.max(0.001, dist), { widthPx: viewport.widthPx, heightPx: viewport.heightPx })
      extraWorldY = pixelToWorld.h
    }

    // 相对宿主的 Y 偏移（在本地空间设置）：基础偏移 + 像素换算的额外偏移，再用 invSy 抵消宿主缩放
    const finalLocalY = (this.offsetY + extraWorldY) * invSy
    this.group.position.set(0, finalLocalY, 0)

    // 可选调试：周期性打印像素偏移换算结果，避免刷屏
    if (this.debug && this.offsetCfg.pixelExtra > 0) {
      if ((updateTick++ & 31) === 0) {
        console.debug('[血条] 像素Y偏移换算', { pixel: this.offsetCfg.pixelExtra, extraWorldY: +extraWorldY.toFixed(4), finalLocalY: +finalLocalY.toFixed(4) })
      }
    }

    // if (this.debug) {
    //   // 为避免刷屏，仅在较大变化时打印
    //   if ((updateTick++ & 31) === 0) {
    //     console.debug('[血条] 尺寸更新', { dist: +dist.toFixed(3), w: +w.toFixed(3), h: +h.toFixed(3) })
    //   }
    // }
  }

  /**
   * 释放 Sprite/材质并从父级移除。
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    try {
      if (this.group && this.group.parent) this.group.parent.remove(this.group)
    } catch {}
    try { this.bgMat?.dispose() } catch {}
    try { this.fgMat?.dispose() } catch {}
    this.bg = null
    this.fg = null
    this.bgMat = null
    this.fgMat = null
    this.group = null
    this.owner = null
    // if (this.debug) console.debug('[血条] 已销毁')
  }

  /**
   * 内部：确保根据包围盒计算头顶偏移。
   */
  private ensureOffsetY(): void {
    if (!this.owner) return
    if (!this.offsetCfg.auto) {
      this.offsetY = Math.max(0, this.offsetCfg.extra ?? 0)
      this.ensuredOffset = true
      return
    }
    // 优先：世界缩放 Y 作为“几何高度因子”（Cylinder 基础高度=1）
    try {
      const s = new THREE.Vector3()
      this.owner.getWorldScale(s)
      const height = s.y || 1
      if (!this.ensuredOffset || Math.abs(height - this._lastHeight) > 1e-4) {
        this.offsetY = height * 1.08 + (this.offsetCfg.extra ?? 0.155)
        this._lastHeight = height
        this.ensuredOffset = true
      }
      return
    } catch {}
    // 兜底：退回包围盒高度
    try {
      const box = new THREE.Box3().setFromObject(this.owner)
      const size = new THREE.Vector3()
      box.getSize(size)
      const height = size.y || 1
      this.offsetY = height * 1.08 + (this.offsetCfg.extra ?? 0.155)
      this._lastHeight = height
      this.ensuredOffset = true
    } catch {
      // 可能因为几何未就绪而失败，下次再试；维持默认回退值
    }
  }
  getDebugInfo(): {
    pct: number
    worldW: number
    worldH: number
    disposed: boolean
    centers?: { bg: { x: number; y: number }; fg: { x: number; y: number } }
  } { // 导出：供测试读取内部状态
    const centers = this.bg && this.fg ? { bg: { x: this.bg.center.x, y: this.bg.center.y }, fg: { x: this.fg.center.x, y: this.fg.center.y } } : undefined
    return { pct: this.pct, worldW: this.cachedWorldW, worldH: this.cachedWorldH, disposed: this.disposed, centers }
  }
}

// 简单的节流计数器（模块级局部），用于减少调试日志频率
let updateTick = 0







