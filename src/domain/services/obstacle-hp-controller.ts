/**
 * 服务：障碍物生命值控制器（ObstacleHpController）
 * - 职责：为障碍物建立并维护 HP 档案，提供读写与扣血 API。
 * - 事件：
 *   - 监听 arena/obstacles 初始化障碍物 HP（统一为 100）。
 *   - 广播 team/stats-update 以便渲染适配器的血条同步（仅使用 unitId/setHp 字段）。
 */
import type { DomainEventBus } from '@domain/core/event-bus' // 引入：领域事件总线类型

/**
 * 类：ObstacleHpController
 * - 用法：combat 系统在初始化时创建实例并复用。
 */
export class ObstacleHpController { // 导出：障碍物 HP 控制器，供战斗系统调用
  private bus: DomainEventBus
  private hpMap = new Map<string, number>()
  private unsub: Array<() => void> = []
  private readonly defaultHp = 100

  /**
   * 构造函数
   * 参数：
   * - bus: DomainEventBus — 用于订阅障碍广播与发送 HP 更新事件
   */
  constructor(bus: DomainEventBus) {
    this.bus = bus
    // 订阅障碍广播：为每个 obstacle:<index> 初始化 HP=100
    const off = this.bus.on('arena/obstacles', (e) => {
      const list = e.payload as { x: number; z: number; scale: number }[] | undefined
      if (!Array.isArray(list)) return
      list.forEach((_, i) => {
        const id = `obstacle:${i}`
        if (!this.hpMap.has(id)) {
          this.hpMap.set(id, this.defaultHp)
          // 调试日志：按需注释，避免刷屏
          // console.log('[障碍HP] 初始化', { id, hp: this.defaultHp })
        } else {
          // 复用旧值，不强制重置；如需重置，可改为 this.setHp(id, this.defaultHp)
        }
      })
    })
    this.unsub.push(off)
  }

  /**
   * 获取 HP（未知则返回默认值）。
   */
  getHp(id: string): number {
    return Math.max(0, this.hpMap.get(id) ?? this.defaultHp)
  }

  /**
   * 设置 HP，并通过 team/stats-update 广播（供渲染血条更新）。
   */
  setHp(id: string, next: number): void {
    const hp = Math.max(0, Math.floor(next))
    this.hpMap.set(id, hp)
    this.bus.emit({ type: 'team/stats-update', payload: [{ unitId: id, setHp: hp }] })
    // console.log('[障碍HP] 写入', { id, hp })
  }

  /**
   * 扣血：返回新的 HP。
   */
  damage(id: string, amount: number): number {
    const dmg = Math.max(0, Math.floor(amount))
    const prev = this.getHp(id)
    const next = Math.max(0, prev - dmg)
    this.setHp(id, next)
    return next
  }

  /**
   * 释放：取消订阅。
   */
  dispose(): void {
    for (const f of this.unsub) {
      try { f() } catch {}
    }
    this.unsub = []
    // console.log('[障碍HP] 控制器已释放订阅')
  }
}


