/**
 * 计分系统扩展测试：障碍分（+2）与综合分广播
 */
import { describe, it, expect } from 'vitest'
import { createWorld } from '../../src/domain/core/world.ts'
import { createEventBus } from '../../src/domain/core/event-bus.ts'
import { scoreSystem } from '../../src/domain/systems/score-system.ts'

describe('ScoreSystem - obstacle scoring', () => {
  it('收到 combat/obstacle-destroyed 后：对应阵营障碍计数+1，综合分+2，并通过 score/updated 广播', () => {
    const bus = createEventBus()
    const world = createWorld({ bus, ports: {} })
    world.registerSystem(scoreSystem())

    const updates = []
    bus.on('score/updated', (e) => updates.push(e.payload))

    // 让系统完成订阅
    world.step(0)

    // 模拟：红队（teamB）摧毁一个障碍
    bus.emit({ type: 'combat/obstacle-destroyed', payload: { obstacleId: 'obstacle:0', killerTeamId: 'teamB', killerId: 'teamB:1' } })

    expect(updates.length).toBeGreaterThan(0)
    const last = updates[updates.length - 1] || {}
    // 明细：障碍原始计数
    expect(last.obstaclesA ?? 0).toBe(0)
    expect(last.obstaclesB ?? 0).toBe(1)
    // 综合分：teamB +2
    expect(last.teamA ?? 0).toBe(0)
    expect(last.teamB ?? 0).toBe(2)
  })
})

