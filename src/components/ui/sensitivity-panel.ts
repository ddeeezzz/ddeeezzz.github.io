/**
 * 可视化 UI：鼠标灵敏度调节面板（缩放/旋转）
 * - 以倍数形式调节：默认 1.0 倍，可在 [0.5, 2.0] 之间调整
 * - 影响相机配置：zoomSpeed、yawSpeed、pitchSpeed（实时生效）
 */
// 引入相机配置类型：用于限定传入配置对象的结构
import type { CameraConfig } from '@domain/systems/camera-follow' // 引入：相机配置类型

interface ZoomControlOptions { // 定义镜头距离控制参数
  min: number
  max: number
  initial: number
  step?: number
  onChange(distance: number): void
}

/**
 * 创建灵敏度调节面板并挂载到指定根节点
 * 参数：
 * - root: HTMLElement 挂载容器
 * - opts: { camConfig: CameraConfig } 运行时相机配置引用（系统每帧读取，修改后即时生效）
 * 返回：销毁函数，用于移除面板与事件监听
 */
export function createSensitivityPanel(
  root: HTMLElement,
  opts: { camConfig: CameraConfig; marker?: { rippleAmp: number; fadeDuration: number; color: string; onChange?: (m: { rippleAmp: number; fadeDuration: number; color: string }) => void }; onReset?: () => void; zoomControl?: ZoomControlOptions }
) {
  // 中文日志：创建面板
  console.log('[UI] 创建鼠标灵敏度调节面板')

  // 保留初始速度作为基准，滑块以倍数缩放
  const baseYaw = opts.camConfig.yawSpeed
  const basePitch = opts.camConfig.pitchSpeed
  const baseZoom = opts.camConfig.zoomSpeed

  // 面板容器
  const panel = document.createElement('div')
  panel.style.position = 'fixed'
  panel.style.top = '12px'
  panel.style.right = '12px'
  panel.style.zIndex = '9999'
  panel.style.padding = '10px 12px'
  panel.style.background = 'rgba(0,0,0,0.55)'
  panel.style.color = '#fff'
  panel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  panel.style.fontSize = '12px'
  panel.style.borderRadius = '8px'
  panel.style.backdropFilter = 'blur(4px)'
  panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)'
  // 禁止面板区域的鼠标事件影响视角旋转
  const blockViewportEvent = (ev: Event) => {
    ev.stopPropagation()
    if (ev.type === 'wheel') ev.preventDefault()
  }
  ;['mousemove', 'mousedown', 'mouseup', 'wheel'].forEach((evt) => panel.addEventListener(evt, blockViewportEvent))

  // 标题
  const title = document.createElement('div')
  title.textContent = '设置面板（相机/标记）'
  title.style.fontWeight = '600'
  title.style.marginBottom = '6px'
  panel.appendChild(title)

  // 工具方法：创建一行带滑块与读数
  function createSliderRow(labelText: string, min = 0.5, max = 2.0, step = 0.05, initial = 1.0) {
    const row = document.createElement('div')
    row.style.display = 'grid'
    row.style.gridTemplateColumns = 'auto 110px 42px'
    row.style.alignItems = 'center'
    row.style.gap = '8px'
    row.style.margin = '6px 0'

    const label = document.createElement('label')
    label.textContent = labelText

    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(initial)

    const valueBox = document.createElement('div')
    valueBox.textContent = `x${Number(initial).toFixed(2)}`
    valueBox.style.textAlign = 'right'

    row.appendChild(label)
    row.appendChild(input)
    row.appendChild(valueBox)

    return { row, input, valueBox }
  }

  // 旋转灵敏度（鼠标移动视角）
  const rotate = createSliderRow('旋转灵敏度', 0.5, 2.0, 0.05, 1.0)
  // 缩放灵敏度（滚轮缩放快慢）
  const zoom = createSliderRow('缩放灵敏度', 0.5, 2.0, 0.05, 1.0)

  panel.appendChild(rotate.row)
  panel.appendChild(zoom.row)

  let zoomLevelInput: HTMLInputElement | null = null
  let zoomLevelValueBox: HTMLDivElement | null = null

  if (opts.zoomControl) {
    const zoomCtrl = opts.zoomControl
    const zoomRow = document.createElement('div')
    zoomRow.style.display = 'grid'
    zoomRow.style.gridTemplateColumns = 'auto 110px 60px'
    zoomRow.style.alignItems = 'center'
    zoomRow.style.gap = '8px'
    zoomRow.style.margin = '6px 0'

    const zoomLabel = document.createElement('label')
    zoomLabel.textContent = '镜头距离'
    const zoomInput = document.createElement('input')
    zoomInput.type = 'range'
    zoomInput.min = String(zoomCtrl.min)
    zoomInput.max = String(zoomCtrl.max)
    zoomInput.step = String(zoomCtrl.step ?? 0.1)
    zoomInput.value = String(zoomCtrl.initial)

    const zoomValue = document.createElement('div')
    zoomValue.style.textAlign = 'right'
    zoomValue.textContent = Number(zoomCtrl.initial).toFixed(2)

    zoomRow.appendChild(zoomLabel)
    zoomRow.appendChild(zoomInput)
    zoomRow.appendChild(zoomValue)
    panel.appendChild(zoomRow)

    zoomInput.addEventListener('input', () => {
      const dist = Number(zoomInput.value)
      zoomValue.textContent = dist.toFixed(2)
      zoomCtrl.onChange(dist)
      console.log('[UI] 手动调节镜头距离', { distance: dist.toFixed(2) })
    })

    zoomLevelInput = zoomInput
    zoomLevelValueBox = zoomValue
  }

  const setZoomValue = (distance: number) => {
    if (!opts.zoomControl || !zoomLevelInput || !zoomLevelValueBox) return
    const clamped = Math.min(opts.zoomControl.max, Math.max(opts.zoomControl.min, distance))
    zoomLevelInput.value = String(clamped)
    zoomLevelValueBox.textContent = clamped.toFixed(2)
  }


  // 说明文字：提示 MOBA 常见俯仰范围
  const hint = document.createElement('div')
  hint.textContent = '提示：当前俯仰范围限制为 [0.1, 0.8]（可在配置中调整）'
  hint.style.color = '#ddd'
  hint.style.marginTop = '6px'
  panel.appendChild(hint)

  // 分隔线
  const hr = document.createElement('div')
  hr.style.height = '1px'
  hr.style.background = 'rgba(255,255,255,0.15)'
  hr.style.margin = '8px 0'
  panel.appendChild(hr)

  // 地面标记设置
  const markerTitle = document.createElement('div')
  markerTitle.textContent = '地面标记（涟漪/渐隐）'
  markerTitle.style.fontWeight = '600'
  markerTitle.style.marginBottom = '6px'
  panel.appendChild(markerTitle)

  const ripple = createSliderRow('涟漪幅度', 0.0, 0.5, 0.01, opts.marker?.rippleAmp ?? 0.15)
  const fade = createSliderRow('渐隐时长(s)', 0.3, 3.0, 0.1, opts.marker?.fadeDuration ?? 1.5)
  const colorRow = document.createElement('div')
  colorRow.style.display = 'grid'
  colorRow.style.gridTemplateColumns = 'auto auto'
  colorRow.style.alignItems = 'center'
  colorRow.style.gap = '8px'
  colorRow.style.margin = '6px 0'
  const colorLabel = document.createElement('label')
  colorLabel.textContent = '标记颜色'
  const colorInput = document.createElement('input')
  colorInput.type = 'color'
  colorInput.value = opts.marker?.color ?? '#ffcc00'
  colorRow.appendChild(colorLabel)
  colorRow.appendChild(colorInput)

  panel.appendChild(ripple.row)
  panel.appendChild(fade.row)
  panel.appendChild(colorRow)

  // 竞技场可视化开关
  const toggles = document.createElement('div')
  toggles.style.display = 'grid'
  toggles.style.gridTemplateColumns = 'auto auto auto'
  toggles.style.gap = '8px'
  toggles.style.alignItems = 'center'
  toggles.style.margin = '6px 0'
  function makeToggle(label: string, init = true) {
    const wrap = document.createElement('label')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = init
    wrap.appendChild(cb)
    const span = document.createElement('span')
    span.textContent = ' ' + label
    wrap.appendChild(span)
    return { wrap, cb }
  }
  const tObs = makeToggle('显示障碍物', true)
  const tSpw = makeToggle('显示出生点占位', true)
  const tCir = makeToggle('显示出生圈', true)
  toggles.appendChild(tObs.wrap)
  toggles.appendChild(tSpw.wrap)
  toggles.appendChild(tCir.wrap)
  panel.appendChild(toggles)

  function emitArenaConfig() {
    const cfg = { showObstacles: tObs.cb.checked, showSpawnPlaceholders: tSpw.cb.checked, showSpawnCircles: tCir.cb.checked }
    // 通过自定义事件向外通知（由 setup.ts 转发到 bus）
    document.dispatchEvent(new CustomEvent('ui:arena-config', { detail: cfg }))
    console.log('[UI] 竞技场显示设置：', cfg)
  }
  ;[tObs.cb, tSpw.cb, tCir.cb].forEach((cb) => cb.addEventListener('change', emitArenaConfig))

  // 重置/相机按钮区
  const actionRow = document.createElement('div')
  actionRow.style.display = 'flex'
  actionRow.style.justifyContent = 'flex-start'
  actionRow.style.gap = '8px'
  actionRow.style.marginTop = '6px'
  function makeBtn(label: string, onClick: () => void) {
    const btn = document.createElement('button')
    btn.textContent = label
    btn.style.cursor = 'pointer'
    btn.style.background = '#444'
    btn.style.color = '#fff'
    btn.style.border = '1px solid #666'
    btn.style.borderRadius = '4px'
    btn.style.padding = '4px 8px'
    btn.addEventListener('click', onClick)
    return btn
  }
  const resetBtn = makeBtn('重置场景', () => {
    console.log('[UI] 触发重置场景')
    opts.onReset?.()
  })
  actionRow.appendChild(resetBtn)
  panel.appendChild(actionRow)

  function emitMarkerChange() {
    const m = {
      rippleAmp: Number(ripple.input.value),
      fadeDuration: Number(fade.input.value),
      color: String(colorInput.value)
    }
    opts.marker?.onChange?.(m)
    console.log(`[UI] 调整缩放灵敏度 x${m.toFixed(2)}，zoomSpeed=${opts.camConfig.zoomSpeed.toFixed(5)}`)
  }

  ripple.input.addEventListener('input', () => {
    ripple.valueBox.textContent = `x${Number(ripple.input.value).toFixed(2)}`
    emitMarkerChange()
  })
  fade.input.addEventListener('input', () => {
    fade.valueBox.textContent = `x${Number(fade.input.value).toFixed(2)}`
    emitMarkerChange()
  })
  colorInput.addEventListener('input', emitMarkerChange)

  // 同步函数：根据倍数更新配置
  function applyRotateMultiplier(m: number) {
    opts.camConfig.yawSpeed = baseYaw * m
    opts.camConfig.pitchSpeed = basePitch * m
    // console.log(`[UI] 旋转灵敏度倍数：x${m.toFixed(2)}（yawSpeed=${opts.camConfig.yawSpeed.toFixed(5)}，pitchSpeed=${opts.camConfig.pitchSpeed.toFixed(5)}）`)
  }
  function applyZoomMultiplier(m: number) {
    opts.camConfig.zoomSpeed = baseZoom * m
    // console.log(`[UI] 调整缩放灵敏度 x${m.toFixed(2)}，zoomSpeed=${opts.camConfig.zoomSpeed.toFixed(5)}`)
  }

  // 绑定事件：输入变更 → 更新数值与相机配置
  rotate.input.addEventListener('input', () => {
    const m = Number(rotate.input.value)
    rotate.valueBox.textContent = `x${m.toFixed(2)}`
    applyRotateMultiplier(m)
  })
  zoom.input.addEventListener('input', () => {
    const m = Number(zoom.input.value)
    zoom.valueBox.textContent = `x${m.toFixed(2)}`
    applyZoomMultiplier(m)
  })

  // 初始应用一次，确保面板与配置一致
  applyRotateMultiplier(Number(rotate.input.value))
  applyZoomMultiplier(Number(zoom.input.value))

  root.appendChild(panel)

  if (opts.zoomControl) {
    setZoomValue(opts.zoomControl.initial)
  }

  const dispose = () => {
    console.log('[UI] 关闭灵敏度面板')
    panel.remove()
    zoomLevelInput = null
    zoomLevelValueBox = null
  }

  return { dispose, setZoomValue }
}









