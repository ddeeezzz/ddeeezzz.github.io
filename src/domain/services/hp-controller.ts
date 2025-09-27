/**
 * 服务：生命值控制器（HpController）
 * - 职责：统一管理单位 HP 的读取/写入/增减，并通过事件与队伍系统同步。
 * - 数据来源：监听 team/state 快照以刷新本地缓存。
 * - 写入方式：统一通过 bus.emit('team/stats-update', [{ setHp }]) 推送，避免直接改动其他系统。
 */
import type { DomainEventBus } from '@domain/core/event-bus' // 引入：领域事件总线类型

/**
 * 类型：HP 控制器构造参数
 * - defaultHp：默认生命值（当缓存未知时回退使用）
 */
export interface HpControllerOptions { // 导出：构造选项，供装配层或系统配置使用
  defaultHp?: number
}

/**
 * 类：HpController
 * - 提供 getHp/setHp/damage/heal/ensureProfile 等通用 API，供战斗、AI、技能系统复用。
 * - 订阅 team/state 快照保持本地缓存与队伍系统一致。
 */
export class HpController { // 导出：HP 控制器，供战斗/AI 系统复用
  private bus: DomainEventBus
  private hpMap = new Map<string, number>()
  private unsub: Array<() => void> = []
  private readonly defaultHp: number

  /**
   * 构造函数
   * 参数：
   * - bus: DomainEventBus — 事件总线，用于订阅快照与广播统计更新
   * - opts?: HpControllerOptions — 可选配置，支持覆盖默认 HP
   */
  constructor(bus: DomainEventBus, opts?: HpControllerOptions) {
    this.bus = bus
    this.defaultHp = Math.max(0, opts?.defaultHp ?? 100)
    // 订阅队伍快照，同步 HP 缓存
    const off = this.bus.on('team/state', (e) => {
      const payload = e.payload as { teams?: Record<string, { count: number; units: Array<{ id: string; hp?: number }> }> }
      const teams = payload?.teams
      if (!teams) return
      for (const info of Object.values(teams)) {
        for (const unit of info.units || []) {
          if (!unit?.id) continue
          const hp = typeof unit.hp === 'number' ? unit.hp : this.hpMap.get(unit.id) ?? this.defaultHp
          this.hpMap.set(unit.id, hp)
        }
      }
      // 调试：快照同步完成
      // console.log('[HP] 已同步队伍快照至本地缓存')
    })
    this.unsub.push(off)
  }

  /**
   * 获取指定单位的 HP。
   * 参数：
   * - id: string — 单位 ID
   * - fallback?: number — 回退值（未命中缓存时使用，默认取构造参数 defaultHp）
   * 返回：number — 当前 HP（非负整数）
   */
  getHp(id: string, fallback?: number): number {
    if (!id) return 0
    const v = this.hpMap.get(id)
    return Math.max(0, v ?? (fallback ?? this.defaultHp))
  }

  /**
   * 设置单位 HP（并广播统计更新）。
   * 参数：
   * - teamId: string — 队伍 ID（teamA|teamB）
   * - id: string — 单位 ID
   * - next: number — 新的 HP 值（将被钳制为非负）
   * 返回：void
   */
  setHp(teamId: string, id: string, next: number): void {
    const hp = Math.max(0, Math.floor(next))
    this.hpMap.set(id, hp)
    this.bus.emit({ type: 'team/stats-update', payload: [{ unitId: id, teamId, setHp: hp }] })
    // console.log('[HP] 已设置单位血量', { id, teamId, hp })
  }

  /**
   * 对单位造成伤害（扣血并广播）。
   * 参数：
   * - teamId: string — 队伍 ID
   * - id: string — 单位 ID
   * - amount: number — 伤害数值（将被钳制为非负）
   * 返回：number — 扣减后的新 HP
   */
  damage(teamId: string, id: string, amount: number): number {
    const dmg = Math.max(0, Math.floor(amount))
    const prev = this.getHp(id)
    const next = Math.max(0, prev - dmg)
    this.setHp(teamId, id, next)
    // console.log('[HP] 造成伤害', { id, teamId, prev, dmg, next })
    return next
  }

  /**
   * 为单位恢复生命值。
   * 参数：
   * - teamId: string — 队伍 ID
   * - id: string — 单位 ID
   * - amount: number — 恢复量（将被钳制为非负）
   * 返回：number — 恢复后的新 HP
   */
  heal(teamId: string, id: string, amount: number): number {
    const h = Math.max(0, Math.floor(amount))
    const prev = this.getHp(id)
    const next = prev + h
    this.setHp(teamId, id, next)
    console.log('[HP] 恢复生命', { id, teamId, prev, h, next })
    return next
  }

  /**
   * 确保为单位建立本地档案（如未知则按默认 HP 初始化）。
   * 参数：
   * - teamId: string — 队伍 ID
   * - id: string — 单位 ID
   * - hp?: number — 初始 HP（可选）
   */
  ensureProfile(teamId: string, id: string, hp?: number): void {
    const v = typeof hp === 'number' ? Math.max(0, Math.floor(hp)) : this.defaultHp
    if (!this.hpMap.has(id)) {
      this.hpMap.set(id, v)
      this.bus.emit({ type: 'team/stats-update', payload: [{ unitId: id, teamId, setHp: v }] })
      console.log('[HP] 初始化单位血量', { id, teamId, hp: v })
    }
  }

  /**
   * 释放资源：取消内部订阅。
   */
  dispose(): void {
    for (const f of this.unsub) {
      try {
        f()
      } catch (e) {
        // 忽略单个取消订阅错误
      }
    }
    this.unsub = []
    console.log('[HP] 控制器已释放订阅')
  }
}

