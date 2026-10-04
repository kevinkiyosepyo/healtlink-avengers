import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalWorkspaceHash, legacyWorkspaceLocation, workspacePage } from '../src/lib/workspaceNavigation.js'

test('existing library and history bookmarks open the corresponding internal tool', () => {
  assert.equal(canonicalWorkspaceHash('#/library'), '#/research?tab=sources')
  assert.equal(canonicalWorkspaceHash('#/history'), '#/research?tab=history')
  assert.equal(workspacePage(canonicalWorkspaceHash('#/history')), 'research')
  assert.equal(canonicalWorkspaceHash('#/simulations'), '#/simulations')
  assert.equal(canonicalWorkspaceHash('#/history-unknown'), '#/history-unknown')
})

test('legacy entry keeps supported pages and auth query parameters in the same app', () => {
  assert.equal(legacyWorkspaceLocation({ hash: '#/case', search: '' }), '/#/case')
  assert.equal(legacyWorkspaceLocation({ hash: '#/history', search: '' }), '/#/research?tab=history')
  assert.equal(legacyWorkspaceLocation({ hash: '#/login', search: '?error=AccessDenied' }), '/?error=AccessDenied#/login')
  assert.equal(legacyWorkspaceLocation({ hash: '', search: '' }), '/#/research')
  assert.equal(legacyWorkspaceLocation({ hash: '#/build', search: '' }), '/#/research')
  assert.equal(workspacePage('#/research?tab=evidence'), 'research')
  assert.equal(workspacePage('#/unknown'), 'login')
})
