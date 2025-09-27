/**
 * 回合系统基础验证：10s 结束后根据比分广播结果
 */
import { describe, it, expect } from 'vitest'
import { createWorld } from '../../src/domain/core/world.ts'
import { createEventBus } from '../../src/domain/core/event-bus.ts'
import { roundSystem } from '../../src/domain/systems/round-system.ts'

describe('RoundSystem', () => {
  it('10s 结束后根据比分判定胜负并广播', () => {
    const bus = createEventBus()
    const world = createWorld({ bus, ports: {} })
    world.registerSystem(roundSystem({ durationSeconds: 10 }))

    const results = []
    bus.on('round/ended', (e) => results.push(e.payload))

    // 模拟比分：teamB 领先
    world.step(0) // 让系统完成订阅
    bus.emit({ type: 'score/updated', payload: { teamA: 1, teamB: 3 } })

    // 推进 10.1s
    world.step(10.1)

    expect(results).toHaveLength(1)
    expect(results[0].winnerTeam).toBe('teamB')
    expect(results[0].teamA).toBe(1)
    expect(results[0].teamB).toBe(3)
  })
})
