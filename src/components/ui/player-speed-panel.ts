/**
 * UI：玩家速度面板（右上角滑块）
 * - 目的：暴露“玩家速度（m/s）”控制，实时调整移动系统的最大速度。
 * - 位置：右上角，紧贴灵敏度面板；样式保持一致的毛玻璃与圆角。
 */

// 引入：无外部类型依赖，仅通过回调与装配层交互

export interface PlayerSpeedPanelOptions { // 导出：面板构造选项
  min: number
  max: number
  initial: number
  step?: number
  onChange: (maxSpeed: number) => void
}

/**
 * 创建玩家速度面板
 * 参数：
 * - root: HTMLElement — 宿主容器（通常为应用根节点）
 * - opts: PlayerSpeedPanelOptions — 控件参数与回调
 * 返回：{ dispose, setSpeedValue }
 */
export function createPlayerSpeedPanel(root: HTMLElement, opts: PlayerSpeedPanelOptions) { // 导出：在装配阶段创建
  console.log('[UI] 玩家速度面板初始化')

  // 容器
  const panel = document.createElement('div')
  panel.style.position = 'fixed'
  panel.style.top = '92px' // 位于灵敏度面板下方，避免重叠
  panel.style.right = '12px'
  panel.style.zIndex = '9999'
  panel.style.padding = '8px 10px'
  panel.style.background = 'rgba(0,0,0,0.55)'
  panel.style.color = '#fff'
  panel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  panel.style.fontSize = '12px'
  panel.style.borderRadius = '8px'
  panel.style.backdropFilter = 'blur(4px)'
  panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)'

  // 阻止影响视角的事件透传
  const block = (ev: Event) => { ev.stopPropagation(); if (ev.type === 'wheel') ev.preventDefault() }
  ;['mousemove', 'mousedown', 'mouseup', 'wheel'].forEach((evt) => panel.addEventListener(evt, block))

  // 标题
  const title = document.createElement('div')
  title.textContent = '玩家速度（m/s）'
  title.style.fontWeight = '600'
  title.style.marginBottom = '6px'
  panel.appendChild(title)

  // 行：标签 + 滑块 + 数值
  const row = document.createElement('div')
  row.style.display = 'grid'
  row.style.gridTemplateColumns = 'auto 110px 60px'
  row.style.alignItems = 'center'
  row.style.gap = '8px'
  row.style.margin = '4px 0'

  const label = document.createElement('label')
  label.textContent = '最大速度'
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(opts.min)
  input.max = String(opts.max)
  input.step = String(opts.step ?? 0.5)
  input.value = String(opts.initial)
  const valueBox = document.createElement('div')
  valueBox.textContent = `${Number(opts.initial).toFixed(1)} m/s`
  valueBox.style.textAlign = 'right'

  row.appendChild(label)
  row.appendChild(input)
  row.appendChild(valueBox)
  panel.appendChild(row)

  input.addEventListener('input', () => {
    const v = Number(input.value)
    valueBox.textContent = `${v.toFixed(1)} m/s`
    try {
      opts.onChange(v)
      console.log('[UI] 玩家速度更新', { maxSpeed: v.toFixed(2) })
    } catch (e) {
      console.error('[UI] 玩家速度回调异常', e)
    }
  })

  root.appendChild(panel)

  function setSpeedValue(v: number) { // 导出：外部可同步速度显示（如从配置重载）
    input.value = String(v)
    valueBox.textContent = `${Number(v).toFixed(1)} m/s`
  }
  function dispose() { // 导出：销毁面板并释放引用
    panel.remove()
  }

  return { dispose, setSpeedValue }
}

