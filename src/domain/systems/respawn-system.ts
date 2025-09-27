/**
 * 系统：单位重生
 * - 监听击败事件，安排延迟复活
 * - 固定出生点，无轮换逻辑
 * - 向 UI 与队伍系统广播倒计时与复活结果
 */
import type { System, World } from '@domain/core/world' // 引入：系统与世界类型

interface RespawnTask { // 数据：重生任务结构
  unitId: string
  teamId: string
  spawnPointId: string
  position: { x: number; z: number }
  remaining: number
  total: number
  lastLogSlot: number | null
}

const DEFAULT_RESPAWN_DELAY = 10 // 常量：默认重生秒数

/**
 * 创建重生系统
 * 参数：delaySeconds —— 默认重生倒计时
 * 返回：System —— 注册到世界后生效
 */
export function respawnSystem(delaySeconds = DEFAULT_RESPAWN_DELAY): System { // 导出：重生系统供装配使用
  console.log('[重生] 重生系统已初始化', { 默认延迟: delaySeconds })

  const tasks = new Map<string, RespawnTask>()
  const spawnRegistry = new Map<string, { teamId: string; spawnPointId: string; position: { x: number; z: number } }>()

  const emitCountdown = (world: World, task: RespawnTask) => {
    world.bus.emit({
      type: 'respawn/countdown',
      payload: {
        unitId: task.unitId,
        teamId: task.teamId,
        remainingSeconds: task.remaining,
        totalSeconds: task.total,
        spawnPointId: task.spawnPointId,
        position: task.position
      }
    })
  }

  const clearAll = (world: World) => {
    if (tasks.size === 0) return
    tasks.clear()
    world.bus.emit({ type: 'respawn/clear' })
    console.log('[重生] 已清空全部重生排队')
  }

  const schedule = (world: World, unitId: string, teamId: string, spawnPointId: string, position: { x: number; z: number }, delay: number) => {
    const task: RespawnTask = {
      unitId,
      teamId,
      spawnPointId,
      position,
      remaining: delay,
      total: delay,
      lastLogSlot: Math.ceil(delay)
    }
    tasks.set(unitId, task)
    // console.log(`[重生] 接到击败事件，计划在 ${delay.toFixed(1)} 秒后复活 ${unitId}`, {
    //   teamId,
    //   spawnPointId,
    //   position
    // })
    world.bus.emit({
      type: 'respawn/scheduled',
      payload: {
        unitId,
        teamId,
        spawnPointId,
        delaySeconds: delay,
        position
      }
    })
    emitCountdown(world, task)
  }

  const complete = (world: World, task: RespawnTask) => {
    // console.log('[重生] 倒计时结束，准备复活', {
    //   unitId: task.unitId,
    //   spawnPointId: task.spawnPointId,
    //   position: task.position
    // })
    tasks.delete(task.unitId)
    world.bus.emit({
      type: 'respawn/ready',
      payload: {
        unitId: task.unitId,
        teamId: task.teamId,
        spawnPointId: task.spawnPointId,
        position: task.position
      }
    })
    world.bus.emit({
      type: 'respawn/complete',
      payload: {
        unitId: task.unitId,
        teamId: task.teamId,
        spawnPointId: task.spawnPointId,
        position: task.position
      }
    })
    // 若是玩家单位，额外发出 player/spawn 以复位移动系统
    if (task.unitId === 'player:1') {
      world.bus.emit({ type: 'player/spawn', payload: { x: task.position.x, z: task.position.z } })
      console.log('[重生] 玩家重生完成，已发出 player/spawn', { unitId: task.unitId, position: task.position })
    }
    // console.log('[重生] 单位已复活', {
    //   unitId: task.unitId,
    //   teamId: task.teamId,
    //   position: task.position
    // })
  }

  const update: System['update'] = (dt, world) => {
    if (!(update as { subscribed?: boolean }).subscribed) {
      (update as { subscribed?: boolean }).subscribed = true

      world.bus.on('arena/reset', () => {
        console.log('[重生] 收到场景重置，强制清理重生任务')
        clearAll(world)
      })

      world.bus.on('team/unit-registered', (e) => {
        const payload = e.payload as { id?: string; teamId?: string; x?: number; z?: number }
        if (!payload?.id || !payload.teamId || typeof payload.x !== 'number' || typeof payload.z !== 'number') return
        spawnRegistry.set(payload.id, {
          teamId: payload.teamId,
          spawnPointId: payload.id,
          position: { x: payload.x, z: payload.z }
        })
        // console.log('[重生] 记录出生点信息', {
        //   unitId: payload.id,
        //   teamId: payload.teamId,
        //   position: { x: payload.x, z: payload.z }
        // })
      })

      world.bus.on('team/unit-removed', (e) => {
        const payload = e.payload as { id?: string }
        if (!payload?.id) return
        // console.log('[重生] 单位离场，等待击败事件确认', { unitId: payload.id })
      })

      world.bus.on('respawn/register-spawn', (e) => {
        const payload = e.payload as { unitId?: string; teamId?: string; spawnPointId?: string; position?: { x: number; z: number } }
        if (!payload?.unitId || !payload.teamId || !payload.spawnPointId || !payload.position) return
        spawnRegistry.set(payload.unitId, {
          teamId: payload.teamId,
          spawnPointId: payload.spawnPointId,
          position: payload.position
        })
        console.log('[重生] 手动更新出生点', payload)
      })

      world.bus.on('combat/enemy-removed', (e) => {
        const payload = e.payload as { id?: string }
        if (!payload?.id) return
        const unitId = payload.id
        const registry = spawnRegistry.get(unitId)
        if (!registry) {
          console.warn('[重生] 未找到单位出生点，跳过重生计划', { unitId })
          return
        }
        schedule(world, unitId, registry.teamId, registry.spawnPointId, registry.position, delaySeconds)
      })
    }

    if (tasks.size === 0 || dt <= 0) return

    tasks.forEach((task) => {
      const previous = task.remaining
      task.remaining = Math.max(0, task.remaining - dt)
      emitCountdown(world, task)

      const currentSecondSlot = Math.ceil(task.remaining)
      if (task.lastLogSlot === null || currentSecondSlot < task.lastLogSlot) {
        // console.log('[重生] 倒计时更新', {
        //   unitId: task.unitId,
        //   剩余秒数: task.remaining.toFixed(1),
        //   spawnPointId: task.spawnPointId,
        // })
        task.lastLogSlot = currentSecondSlot
      }

      if (previous > 0 && task.remaining <= 0) {
        complete(world, task)
      }
    })
  }

  return { name: 'Respawn', update }
}
