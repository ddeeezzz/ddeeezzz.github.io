/**
 * 测试：玩家被击杀后进入“销毁-等待重生-重生”机制
 * - 命中两次致死后，期望出现 respawn/scheduled、respawn/countdown、respawn/complete
 * - 玩家重生完成应广播 player/spawn，供移动系统复位玩家位置
 */
import { describe, it, expect } from 'vitest' // 引入：测试框架 API
import { createWorld } from '../../src/domain/core/world.ts' // 引入：World 工厂
import { createEventBus } from '../../src/domain/core/event-bus.ts' // 引入：事件总线工厂
import { teamManagerSystem } from '../../src/domain/systems/team-manager.ts' // 引入：队伍管理系统（提供 team/state 与登记）
import { respawnSystem } from '../../src/domain/systems/respawn-system.ts' // 引入：重生系统（被击败后安排重生）
import { combatSystem } from '../../src/domain/systems/combat.ts' // 引入：战斗系统（发射/命中/扣血/销毁）
import { createSimplePhysicsAdapter } from '../../src/adapters/simple/physics-adapter.ts' // 引入：简易物理适配器（用于命中检测）

function createNoopInput() { // 工具：提供静默输入端口
  return {
    getState() { return { axes: { x: 0, y: 0 }, pressed: new Set(), yawDelta: 0, pitchDelta: 0, wheelDelta: 0 } },
    resetFrameDeltas() {}
  }
}

describe('Player Respawn Flow', () => {
  it('玩家血量归零后应进入重生倒计时并在原出生点重生', () => {
    const bus = createEventBus()
    const input = createNoopInput()
    const physics = createSimplePhysicsAdapter(bus)
    const world = createWorld({ bus, ports: { input, physics } })

    world.registerSystem(teamManagerSystem())
    world.registerSystem(respawnSystem(0.2)) // 将重生延迟设为 0.2s 加快测试
    world.registerSystem(combatSystem())

    // 完成一次初始化订阅
    world.step(0)

    // 出生点：玩家在 (0,0)，敌人在 (0,2)
    const player = { id: 'player:1', x: 0, z: 0 }
    const enemy = { id: 'teamA:0', x: 0, z: 2 }
    bus.emit({ type: 'arena/spawn-points', payload: { A: [enemy], B: [player], player } })
    // 提供玩家位姿与 unit/transform，便于战斗系统/物理跟踪
    bus.emit({ type: 'entity/player/transform', payload: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } })
    bus.emit({ type: 'unit/transform', payload: { id: 'player:1', teamId: 'teamB', position: { x: 0, z: 0 } } })

    const events = []
    const record = (type) => bus.on(type, () => events.push(type))
    record('combat/enemy-removed')
    record('respawn/scheduled')
    record('respawn/countdown')
    record('respawn/complete')
    record('player/spawn')

    // 敌人开火两次，令玩家 HP 100 -> 50 -> 0
    bus.emit({ type: 'combat/fire', payload: { shooterId: 'teamA:0', teamId: 'teamA', origin: { x: 0, z: 2 } } })
    for (let i = 0; i < 3; i++) world.step(0.1)
    bus.emit({ type: 'combat/fire', payload: { shooterId: 'teamA:0', teamId: 'teamA', origin: { x: 0, z: 2 } } })
    for (let i = 0; i < 3; i++) world.step(0.1)

    // 现在应已触发销毁与重生排队
    expect(events).toContain('combat/enemy-removed')
    expect(events).toContain('respawn/scheduled')
    expect(events).toContain('respawn/countdown')

    // 推进时间超过 0.2 秒，等待重生完成
    world.step(0.25)
    expect(events).toContain('respawn/complete')
    expect(events).toContain('player/spawn')
  })
})
