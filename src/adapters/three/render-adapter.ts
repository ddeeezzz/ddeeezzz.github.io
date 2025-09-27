/**
 * TODO（阶段 2：Three 渲染适配器）
 * - 在此实现 RenderPort：创建 renderer/scene/camera，并处理尺寸与渲染
 * - 保持无领域依赖，仅作为“适配器”实现端口定义
 */
import * as THREE from 'three' // Three.js 渲染核心库
import type { CameraState, RenderPort, EntityTransform } from '@ports/render' // 引入：渲染端口/相机状态/实体变换类型
import type { DomainEventBus } from '@domain/core/event-bus' // 引入：领域事件总线类型
import { HealthBar } from './health-bar' // 引入：Sprite 血条组件，用于玩家/友军/敌人头顶血条

/**
 * 创建 Three 渲染适配器
 * 参数：opts.root — DOM 容器，用于挂载 WebGL 画布
 * 返回：实现 RenderPort 的适配器对象
 */
export function createThreeRenderAdapter(opts: { root: HTMLElement; bus: DomainEventBus }): RenderPort { // 导出：Three 渲染适配器工厂
  console.log('[渲染] 创建 Three 渲染适配器')

  opts.bus.on('entity/destroyed', (e) => {
    const payload = e.payload as { id?: string };
    if (payload?.id) {
      removeEntity(payload.id);
    }
  });
  // 监听队伍快照：初始化或刷新单位 HP 缓存（并同步已存在血条）
  opts.bus.on('team/state', (e) => {
    const payload = e.payload as { teams?: Record<string, { count: number; units: Array<{ id: string; hp?: number; teamId?: string }> }> }
    const teams = payload?.teams || {}
    Object.values(teams).forEach((info) => {
      info.units?.forEach((u) => {
        if (!u?.id) return
        const hp = typeof u.hp === 'number' ? u.hp : (hpMap.get(u.id)?.hp ?? 100)
        hpMap.set(u.id, { hp, max: 100, teamId: (u as any).teamId })
        const hb = healthBars.get(u.id)
        if (hb) hb.setHealth(hp, 100)
      })
    })
  })
  // 监听增量统计更新：更新单个单位 HP
  opts.bus.on('team/stats-update', (e) => {
    const updates = e.payload as Array<{ unitId?: string; setHp?: number; teamId?: string }> | undefined
    if (!updates?.length) return
    updates.forEach((u) => {
      if (!u?.unitId) return
      const prev = hpMap.get(u.unitId) || { hp: 100, max: 100, teamId: u.teamId }
      const nextHp = typeof u.setHp === 'number' ? u.setHp : prev.hp
      hpMap.set(u.unitId, { hp: nextHp, max: prev.max, teamId: prev.teamId ?? u.teamId })
      const hb = healthBars.get(u.unitId)
      if (hb) hb.setHealth(nextHp, prev.max)
    })
  })
    // 监听障碍快照：为障碍物建立 HP 档案并同步已存在血条（HP 统一 100）
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(opts.root.clientWidth, opts.root.clientHeight)
  opts.root.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x202225)
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000)
  camera.position.set(0, 2, 6)
  const entities = new Map<string, THREE.Object3D>() // 存放玩家/标记/障碍等对象
  const healthBars = new Map<string, HealthBar>() // 存放与单位绑定的血条组件
  const hpMap = new Map<string, { hp: number; max: number; teamId?: string }>() // 缓存：单位血量（来源：team/state）

  // 尺寸常量（可按需调整）：血条像素宽高与额外 Y 偏移
  // 注意：项目要求“尺寸在渲染适配器里抽成配置常量”。
  const HEALTH_BAR_CONFIG = { widthPx: 64, heightPx: 8, offsetExtra: 0.15 } as const
  // 仅障碍物的血条追加屏幕空间上移像素（不会改变血条厚度，仅抬高坐标位置）
  const OBSTACLE_HB_PIXEL_OFFSET_PX = 20 as const

  // 网格与光照
  const grid = new THREE.GridHelper(60, 60, 0x333333, 0x333333)
  grid.userData = { id: 'grid', kind: 'grid' } // 赋予网格类型，以便拾取时忽略
  scene.add(grid)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8)
  scene.add(hemi)

  function resize() {
    const w = opts.root.clientWidth || window.innerWidth
    const h = opts.root.clientHeight || window.innerHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const onResize = () => resize()
  window.addEventListener('resize', onResize)
  resize()

  function applyCamera(state: CameraState) {
    camera.fov = state.fov
    camera.updateProjectionMatrix()
    const cy = Math.cos(state.yaw)
    const sy = Math.sin(state.yaw)
    const cp = Math.cos(state.pitch)
    const sp = Math.sin(state.pitch)
    const lx = state.center.x
    const ly = state.center.y + state.height
    const lz = state.center.z
    const dx = -state.distance * cy * cp
    const dz = -state.distance * sy * cp
    const dy = state.distance * sp
    camera.position.set(lx + dx, ly + dy, lz + dz)
    camera.lookAt(lx, ly, lz)
  }

  function ensureEntity(id: string, kind: 'player' | string) {
    if (entities.has(id)) return
    let obj: THREE.Object3D
    if (kind === 'player') {
      const geom = new THREE.SphereGeometry(0.5, 16, 12)
      const mat = new THREE.MeshStandardMaterial({ color: 0x4fc08d })
      obj = new THREE.Mesh(geom, mat)
    } else if (kind === 'marker') {
      const geom = new THREE.RingGeometry(0.3, 0.45, 32)
      const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(geom, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0.01
      obj = mesh
    } else if (kind === 'ground') {
      const geom = new THREE.PlaneGeometry(60, 60, 1, 1)
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a2d31 })
      const mesh = new THREE.Mesh(geom, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0
      obj = mesh
    } else if (kind === 'obstacle') {
      // 修改为圆柱体
      const geom = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 16) // 半径0.5, 高度1.0
      const mat = new THREE.MeshStandardMaterial({ color: 0x808080 })
      obj = new THREE.Mesh(geom, mat)
    } else if (kind === 'spawnBox') {
      // 出生方形可视化：线框平面，单位 1x1，通过 scale 统一缩放为目标尺寸
      const geom = new THREE.PlaneGeometry(1, 1, 1, 1)
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.35 })
      const mesh = new THREE.Mesh(geom, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0.02
      obj = mesh
    } else if (kind === 'teamA') {
      // A 队：修改为圆柱体
      const geom = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 16)
      const mat = new THREE.MeshStandardMaterial({ color: 0x3da5ff })
      const mesh = new THREE.Mesh(geom, mat)
      obj = mesh
    } else if (kind === 'teamB') {
      // B 队：圆柱
      const geom = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 16)
      const mat = new THREE.MeshStandardMaterial({ color: 0xff5a5a })
      const mesh = new THREE.Mesh(geom, mat)
      obj = mesh
    } else if (kind === 'projectile') {
      const geom = new THREE.SphereGeometry(0.2, 12, 8)
      const mat = new THREE.MeshStandardMaterial({ color: 0xffee88, emissive: 0xffaa33, emissiveIntensity: 0.8 })
      obj = new THREE.Mesh(geom, mat)
    } else {
      obj = new THREE.Object3D()
    }
    obj.userData = { id, kind } // 注入类型信息，供拾取时识别
    scene.add(obj)
    entities.set(id, obj)

    // 若为单位/障碍，则为其挂载血条
    if (kind === 'player' || kind === 'teamA' || kind === 'teamB' || kind === 'obstacle') {
      try {
        // 对障碍物应用额外的像素级 Y 偏移（+20px），其他单位保持默认
        const bar = new HealthBar({
          widthPx: HEALTH_BAR_CONFIG.widthPx,
          heightPx: HEALTH_BAR_CONFIG.heightPx,
          offset: kind === 'obstacle'
            ? { auto: true, extra: HEALTH_BAR_CONFIG.offsetExtra, pixelExtra: OBSTACLE_HB_PIXEL_OFFSET_PX }
            : { auto: true, extra: HEALTH_BAR_CONFIG.offsetExtra }
        })
        bar.attachTo(obj)
        const cached = hpMap.get(id)
        if (cached) bar.setHealth(cached.hp, cached.max)
        healthBars.set(id, bar)
        // 中文日志：为实体创建血条（障碍物增加坐标高度 +20px）
        if (kind === 'obstacle') {
          // 已按你的要求关闭该日志以减少噪音
          // console.log('[渲染] 已为障碍物创建血条（坐标上移 +20px）', { id })
        }
      } catch (e) {
        console.error('[渲染] 创建血条失败', e)
      }
    }
  }

  function applyEntity(id: string, tf: EntityTransform) {
    const obj = entities.get(id)
    if (!obj) return
    obj.position.set(tf.position.x, tf.position.y, tf.position.z)
    obj.rotation.y = tf.rotationY
    if (tf.scale != null) {
      const s = tf.scale
      obj.scale.set(s, s, s)
    }
    if (tf.opacity != null || tf.color != null) {
      const mesh = obj as any
      const mat = mesh.material as any
      if (mat && typeof mat === 'object') {
        if (tf.opacity != null) {
          mat.transparent = true
          mat.opacity = tf.opacity
        }
        if (tf.color != null && mat.color) {
          mat.color.setHex(tf.color)
        }
        if (mat.needsUpdate != null) mat.needsUpdate = true
      }
    }
  }

  function removeEntity(id: string) {
    const obj = entities.get(id)
    if (!obj) return
    scene.remove(obj)
    entities.delete(id)
    // 移除并释放血条
    const hb = healthBars.get(id)
    if (hb) {
      try { hb.dispose() } catch {}
      healthBars.delete(id)
    }
  }

  function clearAll() {
    entities.forEach((obj) => {
      scene.remove(obj)
    })
    entities.clear()
    // 清理所有血条
    healthBars.forEach((hb) => { try { hb.dispose() } catch {} })
    healthBars.clear()
  }

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  function pick(xNdc: number, yNdc: number) {
    mouse.set(xNdc, yNdc)
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObjects(scene.children, true)

    for (const intersect of intersects) {
      let current: THREE.Object3D | null = intersect.object
      while (current) {
        if (current.userData.kind) {
          const { id, kind } = current.userData
          // 忽略对标记、辅助框、网格等非游戏单位的拾取
          if (kind === 'marker' || kind === 'spawnBox' || kind === 'grid') {
            break // 跳出 while 循环，继续检查下一个相交物体
          }
          return {
            objectId: id,
            objectKind: kind,
            point: { x: intersect.point.x, y: intersect.point.y, z: intersect.point.z }
          }
        }
        current = current.parent
      }
    }
    return null
  }

  function render() {
    // 在渲染前更新血条的像素锁定尺寸（以当前相机/视口）
    const size = renderer.getSize(new THREE.Vector2())
    const viewport = { widthPx: Math.max(1, Math.floor(size.x)), heightPx: Math.max(1, Math.floor(size.y)) }
    healthBars.forEach((bar) => bar.updatePerFrame(camera, viewport))
    renderer.render(scene, camera)
  }

  function requestFrame(cb: (t?: number) => void) {
    requestAnimationFrame(() => cb(performance.now()))
  }

  function dispose() {
    console.log('[渲染] 释放 Three 渲染资源并移除监听')
    window.removeEventListener('resize', onResize)
    // 释放血条资源
    healthBars.forEach((hb) => { try { hb.dispose() } catch {} })
    healthBars.clear()
    renderer.dispose()
    try {
      opts.root.removeChild(renderer.domElement)
    } catch {}
  }

  return { requestFrame, render, resize, applyCamera, ensureEntity, applyEntity, removeEntity, clearAll, pick, dispose }
}




