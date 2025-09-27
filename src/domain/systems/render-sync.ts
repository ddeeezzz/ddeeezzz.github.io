/**
 * 系统：渲染同步（Transform → RenderPort.Mesh）
 * - 确保玩家实体 Mesh 创建
 * - 订阅玩家变换事件并在每帧应用
 */
// 引入系统与世界类型
import type { System, World } from '@domain/core/world' // 引入：系统/世界类型
// 引入渲染端口类型
import type { RenderPort, EntityTransform } from '@ports/render' // 引入：渲染端口与实体变换类型

/** 标记动画配置 */
export interface MarkerConfig { // 导出：标记动画配置，供 UI 调整
  rippleAmp: number // 涟漪幅度（0~0.5）
  fadeDuration: number // 渐隐时长（秒）
  color: string // 颜色（#rrggbb）
}

/**
 * 创建渲染同步系统
 * 参数：render — 渲染端口；playerId — 实体标识（默认 'player:1'）
 */
export function renderSyncSystem(render: RenderPort, playerId = 'player:1', markerCfg?: MarkerConfig): System { // 导出：渲染同步系统
  console.log('[渲染] 渲染同步系统已创建')
  let latest: EntityTransform | null = null
  let ensured = false
  // 状态：玩家是否存活；用于控制 Mesh 的创建与应用，防止死亡后被立即重建
  let playerAlive = true
  let markerEnsured = false
  // 标记涟漪/渐隐状态
  let markerState: {
    active: boolean
    x: number
    z: number
    life: number
    fading: boolean
    fadeTime: number
    fadeDuration: number
    color: number
  } = { active: false, x: 0, z: 0, life: 0, fading: false, fadeTime: 0, fadeDuration: markerCfg?.fadeDuration ?? 1.5, color: markerCfg?.color ? parseInt(markerCfg.color.replace('#',''), 16) : 0xffcc00 }

  function update(dt: number, world: World) {
    // 惰性订阅：仅绑定一次事件
    if (!(update as any)._sub) {
      (update as any)._sub = world.bus.on('entity/player/transform', (e) => {
        const p = e.payload as EntityTransform
        latest = p
      })
      ;(update as any)._sub2 = world.bus.on('ui/ground-click', (e) => {
        const p = e.payload as { x: number; z: number; color?: number }
        if (!markerEnsured && (render as any).ensureEntity) {
          ;(render as any).ensureEntity('marker:ground', 'marker')
          markerEnsured = true
        }
        if ((render as any).applyEntity) {
          const defaultColor = markerCfg?.color ? parseInt(markerCfg.color.replace('#', ''), 16) : 0xffcc00
          const colorValue = typeof p.color === 'number' ? p.color : defaultColor
          ;(render as any).applyEntity('marker:ground', { position: { x: p.x, y: 0.01, z: p.z }, rotationY: 0, scale: 1, opacity: 1, color: colorValue })
          markerState.active = true
          markerState.fading = false
          markerState.life = 0
          markerState.fadeTime = 0
          markerState.x = p.x
          markerState.z = p.z
          markerState.fadeDuration = markerCfg?.fadeDuration ?? markerState.fadeDuration
          markerState.color = colorValue
        }
      })
      ;(update as any)._sub3 = world.bus.on('ui/ground-clear', () => {
        // 不立即删除，进入渐隐阶段
        if (markerState.active) {
          markerState.fading = true
          markerState.fadeTime = 0
        }
      })
      ;(update as any)._subReset = world.bus.on('arena/reset', () => {
        ensured = false
        markerEnsured = false
        // 重置为存活状态（场景重置通常意味着重新开始）
        playerAlive = true
        markerState.active = false
        markerState.fading = false
        markerState.fadeTime = 0
        markerState.life = 0
        markerState.x = 0
        markerState.z = 0
        markerState.color = markerCfg?.color ? parseInt(markerCfg.color.replace('#', ''), 16) : 0xffcc00
      })
      // 监听：玩家实体被销毁后禁止重建 Mesh，等待重生事件
      ;(update as any)._subDestroyed = world.bus.on('entity/destroyed', (e) => {
        const p = e.payload as { id?: string } | undefined
        if (p?.id === playerId) {
          ensured = false
          playerAlive = false
          // console.log('[渲染] 监听到玩家实体销毁，已暂停渲染且禁止重建', { id: p.id }) // 调试日志：按需已注释
        }
      })
      // 监听：玩家重生完成后恢复渲染并立即重建 Mesh，避免一帧空窗
      ;(update as any)._subRespawn = world.bus.on('respawn/complete', (e) => {
        const p = e.payload as { unitId?: string; teamId?: string } | undefined
        if (p?.unitId === playerId && (render as any).ensureEntity) {
          playerAlive = true
          ;(render as any).ensureEntity(playerId, 'player')
          ensured = true
          // console.log('[渲染] 玩家重生，已重建 Mesh', { id: playerId }) // 调试日志：按需已注释
        }
      })
      // 兼容：若系统直接发出 player/spawn 也视为复活
      ;(update as any)._subPlayerSpawn = world.bus.on('player/spawn', () => {
        playerAlive = true
      })
    }
    // 确保玩家实体已创建
    if (playerAlive && !ensured && (render as any).ensureEntity) {
      ;(render as any).ensureEntity(playerId, 'player')
      ensured = true
      console.log('[渲染] 玩家 Mesh 已创建')
    }
    // 应用最近变换
    if (playerAlive && latest && (render as any).applyEntity) {
      const lifted: EntityTransform = {
        position: { x: latest.position.x, y: (latest.position.y ?? 0) + 0.5, z: latest.position.z },
        rotationY: latest.rotationY,
        scale: latest.scale,
        opacity: latest.opacity,
        color: latest.color
      }
      ;(render as any).applyEntity(playerId, lifted)
    }

    // 标记动画：涟漪（常驻）+ 渐隐（到达/取消后）
    if (markerEnsured && markerState.active && (render as any).applyEntity) {
      markerState.life += dt
      let scale = 1
      let opacity = 1
      if (!markerState.fading) {
        // 涟漪：按配置幅度脉冲（默认 0.15）
        const amp = Math.max(0, Math.min(0.5, markerCfg?.rippleAmp ?? 0.15))
        scale = 1 + amp * Math.sin(markerState.life * 4)
        opacity = 1
      } else {
        // 渐隐：1.5 秒透明到 0，同时略微放大
        markerState.fadeTime += dt
        const t = Math.min(1, markerState.fadeTime / (markerCfg?.fadeDuration ?? markerState.fadeDuration))
        opacity = 1 - t
        scale = 1 + 0.5 * t
        if (t >= 1) {
          // 渐隐结束，删除或隐藏
          if ((render as any).removeEntity) {
            ;(render as any).removeEntity('marker:ground')
            markerEnsured = false
          } else {
            ;(render as any).applyEntity('marker:ground', { position: { x: 0, y: -999, z: 0 }, rotationY: 0, scale: 1, opacity: 0 })
          }
          markerState.active = false
          markerState.fading = false
        }
      }
      if (markerState.active) {
        const fallbackColor = markerCfg?.color ? parseInt(markerCfg.color.replace('#', ''), 16) : 0xffcc00
        const colorValue = typeof markerState.color === 'number' ? markerState.color : fallbackColor
        ;(render as any).applyEntity('marker:ground', {
          position: { x: markerState.x, y: 0.01, z: markerState.z },
          rotationY: 0,
          scale,
          opacity,
          color: colorValue
        })
      }
    }
  }
  return { name: 'RenderSync', update }
}







