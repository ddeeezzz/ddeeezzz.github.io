/**
 * 单元测试：HpController
 * - 校验 team/state 同步缓存与 damage 两次从 100→50→0 的写入行为。
 */
import { describe, it, expect } from 'vitest'
import { createEventBus } from '../../src/domain/core/event-bus.ts'
import { HpController } from '../../src/domain/services/hp-controller.ts'

describe('HpController', () => {
  it('两次扣血从100→50→0，并通过 team/stats-update 广播', () => {
    const bus = createEventBus()
    const updates = []
    bus.on('team/stats-update', (e) => updates.push(e.payload))

    // 初始化：通过 team/state 快照同步 HP
    bus.emit({
      type: 'team/state',
      payload: { teams: { teamA: { count: 1, units: [{ id: 'teamA:0', hp: 100 }] } } }
    })

    const hp = new HpController(bus, { defaultHp: 100 })

    const after1 = hp.damage('teamA', 'teamA:0', 50)
    expect(after1).toBe(50)
    const after2 = hp.damage('teamA', 'teamA:0', 50)
    expect(after2).toBe(0)

    // 校验写入事件
    const flat = updates.flat()
    const set50 = flat.find((u) => u?.unitId === 'teamA:0' && u?.setHp === 50)
    const set0 = flat.find((u) => u?.unitId === 'teamA:0' && u?.setHp === 0)
    expect(set50).toBeTruthy()
    expect(set0).toBeTruthy()
  })
})

