/**
 * 测试：红队（teamB，排除玩家）重生行为
 * - 重生完成后应重建可视化实体（ensureEntity/applyEntity 被调用）
 * - 自动开火系统应在红队单位重生后恢复射击能力
 */
import { createWorld } from '../../src/domain/core/world.ts' // 导入：世界工厂
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 导入：事件总线
import { combatSystem } from '../../src/domain/systems/combat.ts' // 导入：战斗系统
import { autoFireSystem } from '../../src/domain/systems/auto-fire.ts' // 导入：自动开火系统

describe('Red Team Respawn', () => {
  it('红队单位重生后应重建可视化', () => {
    const bus = createEventBus()
    const ensureCalls = []
    const applyCalls = []
    const render = {
      ensureEntity: (id, kind) => { ensureCalls.push({ id, kind }) },
      applyEntity: (id, tf) => { applyCalls.push({ id, tf }) }
    }
    const world = createWorld({ bus, ports: { render } })
    world.registerSystem(combatSystem())
    // 触发一次更新以完成惰性订阅
    world.step(0)

    // 模拟：红队单位（非玩家）复活
    const unitId = 'teamB:1'
    const position = { x: 3, z: -2 }
    bus.emit({ type: 'respawn/complete', payload: { unitId, teamId: 'teamB', position } })

    // 可视化应被重建
    const ensured = ensureCalls.find((c) => c.id === unitId && c.kind === 'teamB')
    expect(ensured).toBeTruthy()
    const applied = applyCalls.find((c) => c.id === unitId)
    expect(applied).toBeTruthy()
  })

  it('红队单位重生后自动开火应恢复', () => {
    const bus = createEventBus()
    let fireCount = 0
    bus.on('combat/fire', () => { fireCount++ })
    // 确保本测试持有自动开火主实例（避免受其他用例影响）
    try { delete (globalThis).__autoFirePrimaryTaken } catch {}
    const world = createWorld({ bus, ports: {} })
    world.registerSystem(autoFireSystem())
    // 完成订阅
    world.step(0)

    // 模拟：红队 AI 重生
    const unitId = 'teamB:2'
    bus.emit({ type: 'respawn/complete', payload: { unitId, teamId: 'teamB', position: { x: 0, z: 0 } } })

    // 推进时间超过 1s，期待自动开火触发一次
    world.step(1.05)
    expect(fireCount).toBeGreaterThanOrEqual(1)
  })
})
