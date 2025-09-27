/**
 * 集成测试：玩家可被敌方投射物命中
 * - 前置：物理适配器应注册玩家碰撞体；移动系统需广播 unit/transform 或保持出生点。
 * - 流程：让 teamA:0 朝玩家位置开火一次，期望玩家 HP 从 100 → 50。
 */
import { describe, it, expect } from 'vitest'
import { createWorld } from '../../src/domain/core/world.ts' // 引入：世界工厂
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线
import { teamManagerSystem } from '../../src/domain/systems/team-manager.ts' // 引入：队伍管理系统（提供 team/state）
import { combatSystem } from '../../src/domain/systems/combat.ts' // 引入：战斗系统（被测）
import { createSimplePhysicsAdapter } from '../../src/adapters/simple/physics-adapter.ts' // 引入：简易物理适配器

function createNoopInput() {
  return {
    getState() { return { axes: { x: 0, y: 0 }, pressed: new Set(), yawDelta: 0, pitchDelta: 0, wheelDelta: 0 } },
    resetFrameDeltas() {}
  }
}

function createCombatRender() {
  // 渲染桩：仅提供 pick 接口与实体记录（便于排查），不影响逻辑
  const removed = []
  const applied = new Map()
  return {
    ensureEntity() {},
    applyEntity(id, data) { const prev = applied.get(id) || {}; applied.set(id, { ...prev, ...data }) },
    removeEntity(id) { removed.push(id); applied.delete(id) },
    render() {}, resize() {}, requestFrame() {}, applyCamera() {}, dispose() {},
    pick() { return null },
    removed, applied
  }
}

describe('Player can be hit by enemy projectile', () => {
  it('teamA 向玩家开火后，玩家 HP 下降 50', () => {
    const bus = createEventBus()
    const input = createNoopInput()
    const render = createCombatRender()
    const physics = createSimplePhysicsAdapter(bus)
    const world = createWorld({ bus, ports: { input, render, physics } })

    world.registerSystem(teamManagerSystem())
    world.registerSystem(combatSystem())

    // 触发系统订阅初始化
    world.step(0)

    // 出生点：玩家与敌人正对，距离 2m
    const player = { id: 'player:1', x: 0, z: 0 }
    const enemy = { id: 'teamA:0', x: 0, z: 2 }
    bus.emit({ type: 'arena/spawn-points', payload: { A: [enemy], B: [player], player } })
    // 玩家初始朝向与位置（供战斗回退方向与其他系统参考）
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } })
    // 同步玩家 unit/transform（若移动系统未运行时也能更新物理/自瞄目标库）
    bus.emit({ type: 'unit/transform', payload: { id: 'player:1', teamId: 'teamB', position: { x: 0, z: 0 } } })

    const updates = []
    bus.on('team/stats-update', (e) => updates.push(...(e.payload || [])))

    // 让敌方从自身位置开火（方向交给自动瞄准解析）
    bus.emit({ type: 'combat/fire', payload: { shooterId: 'teamA:0', teamId: 'teamA', origin: { x: 0, z: 2 } } })

    // 推进若干帧让投射物命中（速度 10m/s，2m 内 1-2 帧足够）
    for (let i = 0; i < 3; i++) world.step(0.1)

    // 断言：玩家收到一次 -50 的 setHp
    const playerHp50 = updates.find((u) => u?.unitId === 'player:1' && u?.teamId === 'teamB' && u?.setHp === 50)
    expect(playerHp50).toBeTruthy()
  })
})

