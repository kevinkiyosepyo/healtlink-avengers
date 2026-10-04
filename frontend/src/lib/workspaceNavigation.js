const pages = {
  '#/case': 'case', '#/timeline': 'timeline', '#/preflight': 'preflight',
  '#/login': 'login', '#/university': 'university', '#/simulations': 'simulations', '#/research': 'research',
  '#/library': 'research', '#/history': 'research',
}

export function workspacePage(hash) {
  return pages[String(hash || '').split('?')[0]] || 'login'
}

export function canonicalWorkspaceHash(hash) {
  const route = String(hash || '').split('?')[0]
  if (route === '#/library') return '#/research?tab=sources'
  if (route === '#/history') return '#/research?tab=history'
  return String(hash || '')
}

export function legacyWorkspaceLocation(location) {
  const hash = canonicalWorkspaceHash(location.hash)
  const page = workspacePage(hash)
  const target = page !== 'login' || hash.split('?')[0] === '#/login' ? hash : '#/research'
  return `/${location.search || ''}${target}`
}
