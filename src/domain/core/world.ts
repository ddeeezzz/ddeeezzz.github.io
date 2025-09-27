/**
 * TODO（阶段 1：世界与调度）
 * - 定义 World 接口：实体管理、系统注册、事件派发、步进。
 * - 暂以最小实现占位，后续接入 ECS 查询器与固定步逻辑。
 */
// 引入事件总线类型：用于世界内事件派发
import type { DomainEventBus } from './event-bus'
// 引入输入端口类型：用于端口集合的扩展
import type { InputPort } from '@ports/input'
import type { RngPort } from '@ports/rng'
import type { PhysicsPort } from '@ports/physics' // 引入：物理端口类型

/** 实体标识类型（后续可改为品牌化类型） */
export type EntityId = number // 导出：实体标识类型

/**
 * 系统接口：纯函数化更新，避免隐藏副作用。
 * - name：系统名称，便于调试与日志。
 * - update(dt, world)：推进系统一帧逻辑。
 */
export interface System { // 导出：系统接口
  name: string
  update: (dt: number, world: World) => void
}

/**
 * 端口集合：用于注入外部适配器。
 * - 后续扩展：Input/Time/Rng/Physics 等。
 */
export interface Ports { // 导出：端口集合接口
  render?: unknown
  input?: InputPort
  rng?: RngPort
  physics?: PhysicsPort
}

/**
 * 世界接口：
 * - bus：领域事件总线。
 * - ports：外设端口（渲染/输入/时间等）。
 * - registerSystem：注册系统并按序执行。
 * - step：推进一帧（固定步长逻辑待接入）。
 */
export interface World { // 导出：世界接口
  bus: DomainEventBus
  ports: Ports
  registerSystem: (sys: System) => void
  step: (dt: number) => void
  destroyEntity: (id: string) => void // 新增：销毁实体
}

/**
 * 创建世界：收集系统并按注册顺序执行。
 * 参数：bus —— 事件总线；ports —— 外设端口集合。
 * 返回：World 实例。
 */
export function createWorld(opts: { bus: DomainEventBus; ports: Ports }): World { // 导出：创建世界工厂函数
  console.log('[世界] 创建 World 实例')
  const systems: System[] = []
  const world: World = {
    bus: opts.bus,
    ports: opts.ports,
    registerSystem: (sys) => {
      console.log(`[世界] 注册系统: ${sys.name}`)
      systems.push(sys)
    },
    step: (dt) => {
      for (const s of systems) s.update(dt, world)
    },
    destroyEntity: (id: string) => {
      // console.log(`[世界] 请求销毁实体: ${id}`)
      opts.bus.emit({ type: 'entity/destroyed', payload: { id } })
    }
  }
  return world
}

