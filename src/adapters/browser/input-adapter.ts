/**
 * 阶段 4：浏览器输入适配器
 * - 监听键盘/鼠标/滚轮事件，聚合为 InputPort 状态
 * - 每帧重置 yaw/pitch/wheel 的增量，pressed 集合保留
 * - 扩展：记录鼠标按键（MouseLeft/MouseRight/MouseMiddle）
 */
// 引入输入端口类型：定义输入状态与接口契约
import type { InputPort, InputState, KeyCode } from '@ports/input' // 引入：输入端口/状态类型

/**
 * 创建浏览器输入适配器
 * 参数：无
 * 返回：InputPort 实现（供领域世界读取输入状态）
 */
export function createBrowserInputAdapter(): InputPort { // 导出：浏览器输入适配器
  const pressed = new Set<KeyCode>()
  let yawDelta = 0
  let pitchDelta = 0
  let wheelDelta = 0
  let lastClick: { xNdc: number; yNdc: number; button: number } | undefined
  let lastX: number | null = null
  let lastY: number | null = null

  // 键盘：按下/抬起
  function onKeyDown(e: KeyboardEvent) { pressed.add(e.code) }
  function onKeyUp(e: KeyboardEvent) { pressed.delete(e.code) }

  // 鼠标移动：累计本帧 yaw/pitch 增量（上移为正 pitch）
  function onMouseMove(e: MouseEvent) {
    let dx = (e as any).movementX ?? 0
    let dy = (e as any).movementY ?? 0
    if (!dx && e.clientX != null) {
      if (lastX != null) dx = e.clientX - lastX
      lastX = e.clientX
    }
    if (!dy && e.clientY != null) {
      if (lastY != null) dy = e.clientY - lastY
      lastY = e.clientY
    }
    yawDelta += dx || 0
    pitchDelta += -(dy || 0)
  }

  // 滚轮：累计缩放增量（符号在相机系统中统一处理）
  function onWheel(e: WheelEvent) { wheelDelta += e.deltaY || 0 }

  // 鼠标按键：语义化记录到 pressed 集合
  function onMouseDown(e: MouseEvent) {
    const code = e.button === 0 ? 'MouseLeft' : e.button === 1 ? 'MouseMiddle' : e.button === 2 ? 'MouseRight' : `Mouse${e.button}`
    pressed.add(code as KeyCode)
    if (e.button === 0 || e.button === 2) {
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      const xNdc = (e.clientX / w) * 2 - 1
      const yNdc = -((e.clientY / h) * 2 - 1)
      lastClick = { xNdc, yNdc, button: e.button }
      if (e.button === 0) {
        console.log(`[输入] 左键单击：client=(${e.clientX},${e.clientY}) → NDC=(${xNdc.toFixed(3)},${yNdc.toFixed(3)})`)
      } else {
        console.log(`[输入] 右键单击：client=(${e.clientX},${e.clientY}) → NDC=(${xNdc.toFixed(3)},${yNdc.toFixed(3)})`)
      }
    }
  }
  function onMouseUp(e: MouseEvent) {
    const code = e.button === 0 ? 'MouseLeft' : e.button === 1 ? 'MouseMiddle' : e.button === 2 ? 'MouseRight' : `Mouse${e.button}`
    pressed.delete(code as KeyCode)
  }

  // 监听 DOM 事件
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('wheel', onWheel, { passive: true })
  // 屏蔽浏览器右键菜单，避免干扰视角旋转/点击移动
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    // console.log('[输入] 已屏蔽浏览器右键菜单（contextmenu）')
  })

  // 键盘聚合为移动轴（x:右正，y:前正）
  function axesFromPressed() {
    const left = pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0
    const right = pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0
    const forward = pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0
    const back = pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0
    return { x: right - left, y: forward - back }
  }

  const api: InputPort = {
    /**
     * 获取当前输入状态（快照）
     * 返回：包含移动轴、鼠标增量与按键集合的浅拷贝
     */
    getState(): InputState {
      const axes = axesFromPressed()
      return { axes, yawDelta, pitchDelta, wheelDelta, pressed: new Set(pressed), lastClick }
    },
    /**
     * 重置本帧增量（yaw/pitch/wheel），不影响 pressed 集合
     */
    resetFrameDeltas(): void {
      yawDelta = 0
      pitchDelta = 0
      wheelDelta = 0
      // if (lastClick) console.log('[输入] 清除本帧 lastClick 标记')
      lastClick = undefined
    }
  }

  return api
}
