$path = 'src/adapters/three/render-adapter.ts'
$content = Get-Content -Raw -Encoding utf8 $path
$start = $content.IndexOf("opts.bus.on('arena/obstacles'")
if ($start -ge 0) {
  $end = $content.IndexOf("const renderer = new THREE.WebGLRenderer", $start)
  if ($end -gt $start) {
    $content = $content.Remove($start, $end - $start)
  }
}
# 确保条件包含 obstacle，并替换中文注释
$content = $content.Replace("// 中文日志：为单位创建血条","// 中文日志：为实体创建血条")
$content = $content.Replace("// 若为单位（玩家/友军/敌人），则为其挂载血条","// 若为单位/障碍，则为其挂载血条")
$content = $content.Replace("if (kind === 'player' || kind === 'teamA' || kind === 'teamB')","if (kind === 'player' || kind === 'teamA' || kind === 'teamB' || kind === 'obstacle')")
Set-Content -Value $content -Encoding utf8 $path
