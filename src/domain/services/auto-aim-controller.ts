/**
 * 服务：自动瞄准控制器（AutoAimController）
 * - 按“射手（shooterId）”维护一个敌方目标队列（FIFO），半径内（默认 4m）按进入先后入队。
 * - 队首仅在“死亡或离开范围”时出队；命中但未死亡不会出队（持续锁定）。
 * - 提供方向解析 API，供战斗系统在开火前优先使用队首目标自动瞄准。
 */
import type { DomainEventBus } from '@domain/core/event-bus' // 引入：事件总线类型

type TeamId = 'teamA' | 'teamB'

interface UnitInfo { // 数据：目标单位快照
  id: string
  teamId: TeamId
  x: number
  z: number
}

interface ShooterQueue { // 数据：某个射手的自动瞄准状态
  teamId: TeamId
  pos: { x: number; z: number }
  radius: number
  queue: string[]
  inRange: Set<string>
}

/**
 * 导出：自动瞄准控制器
 * - 构造：传入事件总线与半径配置（默认 4）
 * - 公开方法：registerShooter / updateShooterPosition / resolveDirection / removeTarget / syncTargetsFromSpawns / reset
 */
export class AutoAimController { // 导出：自动瞄准服务，供战斗系统复用
  private readonly bus: DomainEventBus
  private readonly radius: number
  private targets = new Map<string, UnitInfo>() // 全局目标库（敌我皆存，按 teamId 区分）
  private shooters = new Map<string, ShooterQueue>()

  constructor(bus: DomainEventBus, opts?: { radius?: number }) {
    this.bus = bus
    this.radius = Math.max(0.1, opts?.radius ?? 4)

    // 订阅：实体销毁/队伍移除 → 清理所有队列中的该目标
    this.bus.on('entity/destroyed', (e) => {
      const id = (e.payload as { id?: string } | undefined)?.id
      if (id) this.removeTarget(id)
    })
    this.bus.on('team/unit-removed', (e) => {
      const id = (e.payload as { id?: string } | undefined)?.id
      if (id) this.removeTarget(id)
    })

    // 订阅单位位置变更：保持目标库坐标最新，利于自动瞄准方向。
    this.bus.on('unit/transform', (e) => {
      const p = e.payload as { id?: string; teamId?: TeamId; position?: { x: number; z: number } } | undefined
      if (!p?.id || !p.teamId || !p.position) return
      const t = this.targets.get(p.id)
      if (t) {
        t.x = p.position.x
        t.z = p.position.z
      } else {
        this.targets.set(p.id, { id: p.id, teamId: p.teamId, x: p.position.x, z: p.position.z })
      }
      // 受位置变更影响，可能导致进出半径，需要对每个射手更新 inRange/queue
      for (const [sid, s] of this.shooters) this.updateInRangeForShooter(sid, s)
    })
  }

  /** 注册射手（若存在则更新阵营但不清空队列） */
  registerShooter(shooterId: string, teamId: TeamId) {
    const s = this.shooters.get(shooterId)
    if (s) {
      s.teamId = teamId
      return
    }
    this.shooters.set(shooterId, { teamId, pos: { x: 0, z: 0 }, radius: this.radius, queue: [], inRange: new Set() })
    // console.log('[瞄准] 已登记射手', { shooterId, teamId })
  }

  /** 批量同步出生点（A 敌队/B 我队或相反），用于初始化目标库 */
  syncTargetsFromSpawns(A?: { id?: string; x: number; z: number }[], B?: { id?: string; x: number; z: number }[]) {
    // 清理并重建目标库（保留 shooters）
    const next = new Map<string, UnitInfo>()
    A?.forEach((u, idx) => { const id = u.id ?? `teamA:${idx}`; next.set(id, { id, teamId: 'teamA', x: u.x, z: u.z }) })
    B?.forEach((u, idx) => { const id = u.id ?? (idx === 0 ? 'player:1' : `teamB:${idx - 1}`); next.set(id, { id, teamId: 'teamB', x: u.x, z: u.z }) })
    this.targets = next
    // 重算各射手 inRange/queue（按现位置）
    for (const [sid, s] of this.shooters) {
      this.rebuildQueueForShooter(sid, s)
    }
    // console.log('[瞄准] 已根据出生点同步目标库', { A: A?.length ?? 0, B: B?.length ?? 0 })
  }

  /** 更新或新增单个目标位置 */
  upsertTarget(id: string, teamId: TeamId, x: number, z: number) {
    this.targets.set(id, { id, teamId, x, z })
    // 目标位置变化可能导致进出半径，逐个射手评估
    for (const [sid, s] of this.shooters) this.updateInRangeForShooter(sid, s)
  }

  /** 移除目标（死亡/移除） */
  removeTarget(id: string) {
    this.targets.delete(id)
    for (const s of this.shooters.values()) {
      if (s.inRange.delete(id)) {
        s.queue = s.queue.filter((q) => q !== id)
      } else {
        // 不在 inRange 也要清队列（例如销毁前已离开过范围）
        const before = s.queue.length
        if (before) s.queue = s.queue.filter((q) => q !== id)
      }
    }
    // console.log('[瞄准] 目标移除，已从所有队列清理', { id })
  }

  /** 更新射手位置，并维护入队/出队（离开范围） */
  updateShooterPosition(shooterId: string, pos: { x: number; z: number }) {
    const s = this.shooters.get(shooterId)
    if (!s) return
    s.pos = { x: pos.x, z: pos.z }
    this.updateInRangeForShooter(shooterId, s)
  }

  /**
   * 解析自动瞄准方向：若队首存在且仍在半径内，则返回指向队首的单位向量；否则返回 null
   */
  resolveDirection(shooterId: string, origin: { x: number; z: number }): { x: number; z: number } | null {
    const s = this.shooters.get(shooterId)
    if (!s) return null
    // 清理任何已不在半径内的队首
    this.trimFrontIfOutOfRange(s)
    const front = s.queue[0]
    if (!front) return null
    const t = this.targets.get(front)
    if (!t) {
      // 队首已被移除
      s.queue.shift()
      return null
    }
    const dx = t.x - origin.x
    const dz = t.z - origin.z
    const len = Math.hypot(dx, dz)
    if (len <= 1e-4) return null
    return { x: dx / len, z: dz / len }
  }

  /** 重置：清空所有状态 */
  reset() {
    this.targets.clear()
    this.shooters.clear()
    console.log('[瞄准] 控制器已重置')
  }

  // ——— 内部方法 ———

  private rebuildQueueForShooter(sid: string, s: ShooterQueue) {
    s.inRange.clear()
    s.queue = s.queue.filter(() => false)
    this.updateInRangeForShooter(sid, s)
  }

  private updateInRangeForShooter(_sid: string, s: ShooterQueue) {
    // 遍历所有目标，维护 inRange 与 queue
    for (const t of this.targets.values()) {
      if (t.teamId === s.teamId) continue // 跳过同阵营
      const dist = Math.hypot(t.x - s.pos.x, t.z - s.pos.z)
      const within = dist <= s.radius + 1e-6
      const was = s.inRange.has(t.id)
      if (within && !was) {
        s.inRange.add(t.id)
        if (!s.queue.includes(t.id)) s.queue.push(t.id)
        // console.log('[瞄准] 目标进入半径，入队', { shooterTeam: s.teamId, target: t.id })
      } else if (!within && was) {
        s.inRange.delete(t.id)
        s.queue = s.queue.filter((q) => q !== t.id)
        // console.log('[瞄准] 目标离开半径，出队', { shooterTeam: s.teamId, target: t.id })
      }
    }
    // 清理队首不在范围的情况
    this.trimFrontIfOutOfRange(s)
  }

  private trimFrontIfOutOfRange(s: ShooterQueue) {
    while (s.queue.length > 0) {
      const head = s.queue[0]
      if (!head) break
      if (!s.inRange.has(head) || !this.targets.has(head)) {
        s.queue.shift()
        continue
      }
      // 队首仍在半径内 → 停止清理
      break
    }
  }
}
