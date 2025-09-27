/**
 * 自动开火：离开射程时的追逐规则
 * - 队列非空：不追逐离开的锁定目标，切到队列头。
 * - 队列为空：清空锁定，交由行走系统回退寻路（最近障碍/敌/出生圈）。
 */
import { describe, it, expect } from 'vitest' // 引入：测试框架 API
import { createWorld } from '../../src/domain/core/world.ts' // 引入：世界工厂，用于装配系统
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线，驱动系统事件交互

describe('AutoFire leave-range behavior', () => {
  it('目标离开射程且队列非空 → 切换到队列头', async () => {
    const bus = createEventBus()
    const world = createWorld({ bus, ports: {} })
    // 复位主实例标志，确保本测试实例生效
    try { delete (globalThis).__autoFirePrimaryTaken } catch {}
    const { autoFireSystem } = await import('../../src/domain/systems/auto-fire.ts')
    world.registerSystem(autoFireSystem())

    const locks = []
    bus.on('ai/locked-target', (e) => locks.push(e.payload))

    world.step(0)

    // A 方：1 名射手；B 方：2 名敌人，均在 4m 内（3.0m 与 3.5m）
    bus.emit({ type: 'arena/spawn-points', payload: {
      A: [{ id: 'teamA:0', x: 0, z: 0 }],
      B: [{ id: 'player:1', x: 3.0, z: 0 }, { id: 'teamB:1', x: 3.5, z: 0 }]
    } })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 3.0, y: 0, z: 0 } } })

    // 等待一次冷却，确保已锁定并开火（便于确认初始锁对象）
    world.step(1.1)
    // 将队首（玩家）移出射程（10m）
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 10, y: 0, z: 0 } } })

    // 推进一小段时间触发范围更新与锁切换
    world.step(0.1)

    // 仅取 shooter=teamA:0 的最后一条锁定事件
    const last = [...locks].reverse().find((p) => p?.shooterId === 'teamA:0')
    expect(last).toBeTruthy()
    // 期望切换到队列头（仍在 4m 内的 teamB:1）
    expect(last.lock?.kind).toBe('enemy')
    expect(last.lock?.id).toBe('teamB:1')
  })

  it('目标离开射程且队列为空 → 清空锁定', async () => {
    const bus = createEventBus()
    const world = createWorld({ bus, ports: {} })
    try { delete (globalThis).__autoFirePrimaryTaken } catch {}
    const { autoFireSystem } = await import('../../src/domain/systems/auto-fire.ts')
    world.registerSystem(autoFireSystem())

    const locks = []
    bus.on('ai/locked-target', (e) => locks.push(e.payload))

    world.step(0)
    // A 方：1 名射手；B 方：仅玩家一人且在 3m（队列只有他）
    bus.emit({ type: 'arena/spawn-points', payload: {
      A: [{ id: 'teamA:0', x: 0, z: 0 }],
      B: [{ id: 'player:1', x: 3.0, z: 0 }]
    } })
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 3.0, y: 0, z: 0 } } })

    // 冷却触发一次，确保已锁定
    world.step(1.1)
    // 将玩家移出射程（10m）并推进一段时间（超过冷却），触发清锁逻辑
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 10, y: 0, z: 0 } } })
    world.step(1.1)

    // 在事件序列中应出现一次“清空锁定”的事件（随后可能再次因规则锁向最近敌人）
    const hasCleared = locks.some((p) => p?.shooterId === 'teamA:0' && p.lock == null)
    expect(hasCleared).toBe(true)
  })
})
