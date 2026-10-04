import { mountWorkspace } from './bootstrap.js'
import { legacyWorkspaceLocation } from './lib/workspaceNavigation.js'

// Existing bookmarks use the same app and saved workspace.
window.history.replaceState(window.history.state, '', legacyWorkspaceLocation(window.location))
mountWorkspace()
