/**
 * 系统：竞技场与出生点
 * - 生成地面与障碍（可选渲染）
 * - 计算两队出生点（各 5 个），满足边界/不重叠/避障
 * - 通过事件总线广播：arena/spawn-points、arena/obstacles
 */
import type { System, World } from '@domain/core/world' // 引入：世界/系统类型

export interface ArenaConfig { // 导出：竞技场配置
  size: number // 正方形边长（米）
  obstacleCount: number // 障碍数量
  obstacleMin: number // 障碍最小尺度（与几何基准相乘）
  obstacleMax: number // 障碍最大尺度
  spawnPerTeam: number // 每队出生点数量
  spawnMinDist: number // 出生点之间的最小距离（米）
  spawnMargin: number // 距边界与障碍的安全边距（米）
  spawnRadius?: number // 可选：每队出生圆半径；未提供则按 size 推导
}

interface Obstacle { x: number; z: number; scale: number }

interface TeamSpawn {
  id: string
  x: number
  z: number
}

function rand(world: World): number {
  const rng = world.ports.rng
  return rng ? rng.next() : Math.random()
}

function dist2(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx
  const dz = az - bz
  return dx * dx + dz * dz
}

// 旧的全图障碍生成函数（保留以供参考）
function placeObstacles(cfg: ArenaConfig, world: World): Obstacle[] {
  const half = cfg.size / 2
  const obs: Obstacle[] = []
  let attempts = 0
  while (obs.length < cfg.obstacleCount && attempts < cfg.obstacleCount * 50) {
    attempts++
    const x = (rand(world) * 2 - 1) * (half - cfg.spawnMargin)
    const z = (rand(world) * 2 - 1) * (half - cfg.spawnMargin)
    const scale = cfg.obstacleMin + rand(world) * (cfg.obstacleMax - cfg.obstacleMin)
    const ok = obs.every((o) => dist2(o.x, o.z, x, z) >= (o.scale + scale + cfg.spawnMargin) ** 2)
    if (!ok) continue
    obs.push({ x, z, scale })
  }
  return obs
}

/**
 * 优化版障碍生成：
 * - 范围：以两出生圈圆心为对角线的轴对齐方形区域
 * - 约束：位于两出生圈外（半径 + spawnMargin），障碍间保持最小间距
 * - 方法：优先使用“抖动网格”候选点采样，回退到随机拒绝采样保证数量
 */
function generateObstaclesInBoxOutsideCircles(
  cfg: ArenaConfig,
  world: World,
  cA: { x: number; z: number },
  cB: { x: number; z: number },
  radius: number
): Obstacle[] {
  const minX = Math.min(cA.x, cB.x)
  const maxX = Math.max(cA.x, cB.x)
  const minZ = Math.min(cA.z, cB.z)
  const maxZ = Math.max(cA.z, cB.z)
  const w = Math.max(0.0001, maxX - minX)
  const h = Math.max(0.0001, maxZ - minZ)

  // 估算网格：尽量提供多于目标数量的候选格子
  const target = cfg.obstacleCount
  const gridN = Math.ceil(Math.sqrt(target) * 2)
  const cols = Math.max(2, gridN)
  const rows = Math.max(2, gridN)
  const cellW = w / cols
  const cellH = h / rows

  // 生成打乱的格子索引序列
  const idx: number[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) idx.push(r * cols + c)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand(world) * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }

  const out: Obstacle[] = []
  const rr = (radius + cfg.spawnMargin) ** 2
  // 网格候选采样
  let triedCells = 0
  for (const id of idx) {
    if (out.length >= target) break
    triedCells++
    const rc = Math.floor(id / cols)
    const cc = id % cols
    const x0 = minX + cc * cellW
    const z0 = minZ + rc * cellH
    // 单元内抖动采样（避免边界）
    const jx = (0.2 + 0.6 * rand(world)) * cellW
    const jz = (0.2 + 0.6 * rand(world)) * cellH
    const x = x0 + jx
    const z = z0 + jz
    const scale = cfg.obstacleMin + rand(world) * (cfg.obstacleMax - cfg.obstacleMin)
    // 出生圈外约束
    if (dist2(x, z, cA.x, cA.z) < rr || dist2(x, z, cB.x, cB.z) < rr) continue
    // 障碍间距约束
    const ok = out.every((o) => dist2(o.x, o.z, x, z) >= (o.scale * 0.5 + scale * 0.5 + cfg.spawnMargin) ** 2)
    if (!ok) continue
    out.push({ x, z, scale })
  }

  // 回退：若不足数量，使用随机拒绝采样补齐
  let attempts = 0
  while (out.length < target && attempts < target * 200) {
    attempts++
    const x = minX + rand(world) * w
    const z = minZ + rand(world) * h
    const scale = cfg.obstacleMin + rand(world) * (cfg.obstacleMax - cfg.obstacleMin)
    if (dist2(x, z, cA.x, cA.z) < rr || dist2(x, z, cB.x, cB.z) < rr) continue
    const ok = out.every((o) => dist2(o.x, o.z, x, z) >= (o.scale * 0.5 + scale * 0.5 + cfg.spawnMargin) ** 2)
    if (!ok) continue
    out.push({ x, z, scale })
  }
  console.log(`[竞技场] 障碍生成：网格候选 ${cols}x${rows}，格子尝试 ${triedCells}，数量 ${out.length}/${target}`)
  return out
}

function isInside(x: number, z: number, cfg: ArenaConfig): boolean {
  const half = cfg.size / 2
  return Math.abs(x) <= half - cfg.spawnMargin && Math.abs(z) <= half - cfg.spawnMargin
}

function tooCloseToObstacles(x: number, z: number, obstacles: Obstacle[], cfg: ArenaConfig): boolean {
  return obstacles.some((o) => dist2(x, z, o.x, o.z) < (o.scale * 0.5 + cfg.spawnMargin) ** 2)
}

function placeSpawnsInCircle(
  center: { x: number; z: number },
  radius: number,
  cfg: ArenaConfig,
  obstacles: Obstacle[],
  world: World,
  presets: { x: number; z: number }[] = []
): { x: number; z: number }[] {
  const spawns: { x: number; z: number }[] = []

  const tryAdd = (x: number, z: number) => {
    if (!isInside(x, z, cfg)) return false
    if (tooCloseToObstacles(x, z, obstacles, cfg)) return false
    if (!spawns.every((p) => dist2(p.x, p.z, x, z) >= cfg.spawnMinDist ** 2)) return false
    spawns.push({ x, z })
    return true
  }

  presets.forEach((p) => {
    if (!tryAdd(p.x, p.z)) {
      console.warn('[竞技场] 预设出生点无效，已跳过', p)
    }
  })

  let attempts = 0
  while (spawns.length < cfg.spawnPerTeam && attempts < cfg.spawnPerTeam * 400) {
    attempts++
    const u = rand(world)
    const v = rand(world)
    const r = radius * Math.sqrt(Math.max(0, u))
    const th = 2 * Math.PI * v
    const x = center.x + r * Math.cos(th)
    const z = center.z + r * Math.sin(th)
    if (!tryAdd(x, z)) continue
  }
  return spawns
}

export function arenaSystem(cfg: ArenaConfig): System { // 导出：竞技场系统
  console.log('[竞技场] 竞技场系统已创建')
  let initialized = false
  let obstacles: Obstacle[] = []
  let teamA: TeamSpawn[] = []
  let teamB: TeamSpawn[] = []
  let playerSpawnPos: { x: number; z: number } | null = null
  let spawnCenterA: { x: number; z: number } | null = null
  let spawnCenterB: { x: number; z: number } | null = null
  let spawnRadius = 0
  let needsVisualRefresh = false
  // 可视化开关（默认全部开启）
  let showObstacles = true
  let showSpawnPlaceholders = true
  let showSpawnCircles = true

  function applyVisuals(world: World) {
    if (!spawnCenterA || !spawnCenterB) return
    const render: any = world.ports.render
    if (!render?.ensureEntity || !render?.applyEntity) return

    if (render.removeEntity) {
      for (let i = 0; i < 256; i++) {
        render.removeEntity(`obstacle:${i}`)
        render.removeEntity(`teamA:${i}`)
        render.removeEntity(`teamB:${i}`)
      }
      render.removeEntity('spawnCircle:A')
      render.removeEntity('spawnCircle:B')
    }

    render.ensureEntity('ground', 'ground')
    render.applyEntity('ground', { position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 })

    // 将绿色范围框（spawnBox）扩展至与整个竞技场大小（cfg.size）一致
    render.ensureEntity('spawnBox', 'spawnBox')
    render.applyEntity('spawnBox', { position: { x: 0, y: 0.02, z: 0 }, rotationY: 0, scale: cfg.size, opacity: 0.35, color: 0x00ff88 })

    
    if (showObstacles) {
      const OBSTACLE_UNIFIED_SCALE = 2.0 // 统一障碍物缩放：高度≈2m，半径≈1m（Cylinder 基础高=1，半径=0.5）
      obstacles.forEach((o, i) => {
        const id = `obstacle:${i}`
        render.ensureEntity(id, 'obstacle')
        render.applyEntity(id, { position: { x: o.x, y: 0.5 * OBSTACLE_UNIFIED_SCALE, z: o.z }, rotationY: 0, scale: OBSTACLE_UNIFIED_SCALE })
      })
    }
    if (showSpawnCircles) {
      const s = spawnRadius / 0.45
      render.ensureEntity('spawnCircle:A', 'marker')
      render.applyEntity('spawnCircle:A', { position: { x: spawnCenterA.x, y: 0.02, z: spawnCenterA.z }, rotationY: 0, scale: s, opacity: 0.6, color: 0x3da5ff })
      render.ensureEntity('spawnCircle:B', 'marker')
      render.applyEntity('spawnCircle:B', { position: { x: spawnCenterB.x, y: 0.02, z: spawnCenterB.z }, rotationY: 0, scale: s, opacity: 0.6, color: 0xff5a5a })
    }

    if (showSpawnPlaceholders) {
      teamA.forEach((p) => {
        render.ensureEntity(p.id, 'teamA')
        render.applyEntity(p.id, { position: { x: p.x, y: 0.5, z: p.z }, rotationY: 0, scale: 1 })
      })
      teamB.forEach((p, i) => {
        if (i === 0) return
        render.ensureEntity(p.id, 'teamB')
        render.applyEntity(p.id, { position: { x: p.x, y: 0.5, z: p.z }, rotationY: 0, scale: 1 })
      })
    }
  }

  function update(_dt: number, world: World) {
    // 惰性订阅 reset 事件：收到后下一帧重新生成
    if (!(update as any)._subReset) {
      (update as any)._subReset = world.bus.on('arena/reset', () => {
        console.log('[竞技场] 收到重置事件，下一帧重新生成场景')
        initialized = false
      })
      ;(update as any)._subCfg = world.bus.on('arena/config', (e) => {
        const p = e.payload as Partial<{ showObstacles: boolean; showSpawnPlaceholders: boolean; showSpawnCircles: boolean }>
        if (p.showObstacles != null) showObstacles = !!p.showObstacles
        if (p.showSpawnPlaceholders != null) showSpawnPlaceholders = !!p.showSpawnPlaceholders
        if (p.showSpawnCircles != null) showSpawnCircles = !!p.showSpawnCircles
        console.log('[竞技场] 配置更新:', { showObstacles, showSpawnPlaceholders, showSpawnCircles })
        needsVisualRefresh = true
      })
    }
    if (!initialized) {
      // 生成出生点：对角线两端的两个圆形范围（先确定中心与半径）
      const half = cfg.size / 2
      const maxR = half - cfg.spawnMargin - 1
      const radius = Math.max(1, Math.min(cfg.spawnRadius ?? cfg.size * 0.15, maxR))
      const cA = { x: -half + cfg.spawnMargin + radius, z: -half + cfg.spawnMargin + radius }
      const cB = { x: half - cfg.spawnMargin - radius, z: half - cfg.spawnMargin - radius }
      // 生成障碍（优化版）
      obstacles = generateObstaclesInBoxOutsideCircles(cfg, world, cA, cB, radius)
      // 生成出生点（在圆内，避开障碍）
      const rawTeamA = placeSpawnsInCircle(cA, radius, cfg, obstacles, world)
      const rawTeamB = placeSpawnsInCircle(cB, radius, cfg, obstacles, world)
      // 为本地玩家随机决定出生点（重置列表顺序时放在索引 0）
      let playerSpawnIndex = rawTeamB.length > 0 ? Math.floor(rand(world) * rawTeamB.length) : -1
      if (playerSpawnIndex >= rawTeamB.length) playerSpawnIndex = rawTeamB.length - 1
      if (playerSpawnIndex > 0) {
        const swap = rawTeamB[playerSpawnIndex]
        rawTeamB[playerSpawnIndex] = rawTeamB[0]
        rawTeamB[0] = swap
      }
      teamA = rawTeamA.map((p, index) => ({ id: `teamA:${index}`, x: p.x, z: p.z }))
      teamB = rawTeamB.map((p, index) => ({ id: index === 0 ? 'player:1' : `teamB:${index - 1}`, x: p.x, z: p.z }))
      const playerSpawn = teamB[0]
      if (playerSpawn) {
        playerSpawnPos = { x: playerSpawn.x, z: playerSpawn.z }
        world.bus.emit({ type: 'player/spawn', payload: { x: playerSpawn.x, z: playerSpawn.z } })
        console.log('[竞技场] 玩家出生点已随机选择', {
          index: playerSpawnIndex,
          position: playerSpawn
        })
      } else {
        playerSpawnPos = null
      }
      // 广播
      world.bus.emit({ type: 'arena/obstacles', payload: obstacles })
      const boundsPayload = { minX: -half, maxX: half, minZ: -half, maxZ: half }
      world.bus.emit({ type: 'arena/bounds', payload: boundsPayload })
      // 广播出生点与出生圈元数据，便于相机等系统按出生区域对齐初始机位
      const spawnPayload = {
        A: teamA.map((u) => ({ id: u.id, x: u.x, z: u.z })),
        B: teamB.map((u) => ({ id: u.id, x: u.x, z: u.z })),
        player: playerSpawn ? { id: playerSpawn.id, x: playerSpawn.x, z: playerSpawn.z } : undefined,
        circle: {
          A: { center: cA, radius },
          B: { center: cB, radius }
        }
      }
      world.bus.emit({ type: 'arena/spawn-points', payload: spawnPayload })
      console.log(`[竞技场] 生成障碍 ${obstacles.length} 个；出生点 A=${teamA.length} B=${teamB.length}`)
      spawnCenterA = cA
      spawnCenterB = cB
      spawnRadius = radius
      needsVisualRefresh = true
      initialized = true
    }
    if (needsVisualRefresh) {
      applyVisuals(world)
      needsVisualRefresh = false
    }
  }

  return { name: 'Arena', update }
}




