/**
 * 系统：队伍管理
 * - 维护敌我双方单位目录
 * - 管理血量、击杀数、被击杀数等统计
 * - 在重置、重生、击杀等事件中保持数据同步
 */
import type { System, World } from '@domain/core/world' // 引入：系统与世界类型

interface TeamUnit { // 数据：带有统计的单位信息
  id: string
  teamId: string
  x: number
  z: number
  hp: number
  kills: number
  deaths: number
}

interface TeamSnapshotPayload { // 广播：队伍快照负载
  teams: Record<string, { count: number; units: TeamUnit[] }>
}

interface StatsProfile { // 缓存：单位统计档案
  teamId: string
  hp: number
  kills: number
  deaths: number
}

interface StatsUpdate { // 事件：统计更新条目
  unitId?: string
  teamId?: string
  deltaKills?: number
  deltaDeaths?: number
  setHp?: number
}

const TEAM_IDS = ['teamA', 'teamB'] as const
const DEFAULT_HP = 100

/**
 * 创建队伍管理系统
 * 返回：System —— 注册后监听相关领域事件
 */
export function teamManagerSystem(): System { // 导出：队伍管理系统供装配阶段使用
  console.log('[队伍] 队伍管理系统已初始化')

  const teamUnits = new Map<string, Map<string, TeamUnit>>()
  const unitProfiles = new Map<string, StatsProfile>()
  TEAM_IDS.forEach((team) => teamUnits.set(team, new Map()))

  const getOrCreateProfile = (teamId: string, unitId: string) => {
    let profile = unitProfiles.get(unitId)
    if (!profile) {
      profile = { teamId, hp: DEFAULT_HP, kills: 0, deaths: 0 }
      unitProfiles.set(unitId, profile)
    } else {
      profile.teamId = teamId
    }
    return profile
  }

  const registerUnit = (teamId: string, unit: { id?: string; x: number; z: number }, opts?: { resetHp?: boolean }) => {
    if (!unit?.id) return
    const bucket = teamUnits.get(teamId)
    if (!bucket) return
    const profile = getOrCreateProfile(teamId, unit.id)
    if (opts?.resetHp || profile.hp <= 0) profile.hp = DEFAULT_HP
    const record: TeamUnit = {
      id: unit.id,
      teamId,
      x: unit.x,
      z: unit.z,
      hp: profile.hp,
      kills: profile.kills,
      deaths: profile.deaths
    }
    bucket.set(record.id, record)
    // console.log('[队伍] 单位登记成功', record)
    return record
  }

  const removeUnit = (teamId: string, unitId?: string) => {
    if (!unitId) return
    const bucket = teamUnits.get(teamId)
    if (!bucket) return
    if (bucket.delete(unitId)) {
      const profile = unitProfiles.get(unitId)
      if (profile) profile.hp = 0
      // console.log('[队伍] 单位已移除', { teamId, unitId })
    }
  }

  const emitSnapshot = (world: World) => {
    const payload: TeamSnapshotPayload = { teams: {} }
    TEAM_IDS.forEach((team) => {
      const list = Array.from(teamUnits.get(team)?.values() ?? [])
      payload.teams[team] = { count: list.length, units: list }
    })
    world.bus.emit({ type: 'team/state', payload })
    // console.log('[队伍] 已广播队伍快照', payload)
  }

  const emitUnitEvent = (world: World, type: 'team/unit-registered' | 'team/unit-removed', detail: TeamUnit) => {
    world.bus.emit({ type, payload: detail })
  }

  const resetAll = () => {
    TEAM_IDS.forEach((team) => teamUnits.get(team)?.clear())
    // console.log('[队伍] 队伍缓存已清空')
  }

  const extractUnits = (teamId: string, list?: { id?: string; x: number; z: number }[]) => {
    if (!list) return []
    return list
      .map((item) => registerUnit(teamId, item, { resetHp: true }))
      .filter((item): item is TeamUnit => !!item)
  }

  const applyStatsUpdates = (world: World, updates?: StatsUpdate[]) => {
    if (!updates?.length) return
    let changed = false
    updates.forEach((update) => {
      if (!update?.unitId) return
      const teamId = update.teamId ?? unitProfiles.get(update.unitId)?.teamId
      if (!teamId) return
      const profile = getOrCreateProfile(teamId, update.unitId)
      if (typeof update.deltaKills === 'number' && update.deltaKills !== 0) {
        profile.kills += update.deltaKills
        changed = true
      }
      if (typeof update.deltaDeaths === 'number' && update.deltaDeaths !== 0) {
        profile.deaths += update.deltaDeaths
        changed = true
      }
      if (typeof update.setHp === 'number') {
        profile.hp = update.setHp
        changed = true
      }
      const record = teamUnits.get(teamId)?.get(update.unitId)
      if (record) {
        record.kills = profile.kills
        record.deaths = profile.deaths
        record.hp = profile.hp
      }
    })
    if (changed) emitSnapshot(world)
  }

  const update: System['update'] = (dt, world: World) => {
    if ((update as { subscribed?: boolean }).subscribed) return
    (update as { subscribed?: boolean }).subscribed = true

    world.bus.on('arena/reset', () => {
      console.log('[队伍] 收到场景重置，准备清空队伍数据')
      resetAll()
      emitSnapshot(world)
    })

    world.bus.on('arena/spawn-points', (e) => {
      const payload = e.payload as {
        A?: { id?: string; x: number; z: number }[]
        B?: { id?: string; x: number; z: number }[]
      }
      resetAll()
      const enemies = extractUnits('teamA', payload?.A)
      const allies = extractUnits('teamB', payload?.B)
      enemies.forEach((unit) => emitUnitEvent(world, 'team/unit-registered', unit))
      allies.forEach((unit) => emitUnitEvent(world, 'team/unit-registered', unit))
      emitSnapshot(world)
    })

    world.bus.on('entity/destroyed', (e) => {
      const payload = e.payload as { id?: string }
      if (!payload?.id) return

      const profile = unitProfiles.get(payload.id)
      if (!profile) return // Not a unit we are tracking

      // console.log(`[队伍] 监听到实体销毁事件: ${payload.id}`)

      const { teamId } = profile
      removeUnit(teamId, payload.id)

      // The 'team/unit-removed' event doesn't seem to need accurate position.
      // It's mostly for logging in the respawn system.
      const removed: TeamUnit = {
        id: payload.id,
        teamId: teamId,
        x: 0,
        z: 0,
        hp: profile.hp,
        kills: profile.kills,
        deaths: profile.deaths
      }
      emitUnitEvent(world, 'team/unit-removed', removed)
      emitSnapshot(world)
    })

    world.bus.on('team/remove-unit', (e) => {
      const payload = e.payload as { teamId?: string; unitId?: string }
      if (!payload?.teamId || !payload.unitId) return
      removeUnit(payload.teamId, payload.unitId)
      const profile = unitProfiles.get(payload.unitId)
      const removed: TeamUnit = {
        id: payload.unitId,
        teamId: payload.teamId,
        x: 0,
        z: 0,
        hp: profile?.hp ?? 0,
        kills: profile?.kills ?? 0,
        deaths: profile?.deaths ?? 0
      }
      emitUnitEvent(world, 'team/unit-removed', removed)
      emitSnapshot(world)
    })

    world.bus.on('respawn/complete', (e) => {
      const payload = e.payload as { unitId?: string; teamId?: string; position?: { x: number; z: number } }
      if (!payload?.unitId || !payload.teamId || !payload.position) return
      const record = registerUnit(payload.teamId, { id: payload.unitId, x: payload.position.x, z: payload.position.z }, { resetHp: true })
      if (record) {
        emitUnitEvent(world, 'team/unit-registered', record)
        emitSnapshot(world)
      }
    })

    world.bus.on('team/stats-update', (e) => {
      const updates = e.payload as StatsUpdate[] | undefined
      applyStatsUpdates(world, updates)
    })
  }

  return { name: 'TeamManager', update }
}
