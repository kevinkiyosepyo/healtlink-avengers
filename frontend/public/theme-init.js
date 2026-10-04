// Runs before the application bundle so a saved dark theme never paints white.
// Keep this key and palette in sync with useWorkspaceTheme.js.
;(function () {
  var theme = 'light'
  try {
    if (JSON.parse(localStorage.getItem('microfish:workspace-theme')) === 'dark') theme = 'dark'
  } catch (_) {}
  var root = document.documentElement
  var background = theme === 'dark' ? '#12110f' : '#ffffff'
  root.dataset.theme = theme
  root.style.colorScheme = theme
  root.style.backgroundColor = background
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', background)
})()
