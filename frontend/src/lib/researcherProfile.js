import { workspaceStorageKey } from './workspaceStorage.js'

// A starter catalogue for institution selection, not a directory of IRB members.
export const UNIVERSITIES = [
  { id: 'uc-berkeley', name: 'University of California, Berkeley', aliases: ['UC Berkeley', 'Berkeley', 'Cal'] },
  { id: 'uc-davis', name: 'University of California, Davis', aliases: ['UC Davis', 'UCD'] },
  { id: 'uc-irvine', name: 'University of California, Irvine', aliases: ['UC Irvine', 'UCI'] },
  { id: 'uc-los-angeles', name: 'University of California, Los Angeles', aliases: ['UCLA', 'UC Los Angeles'] },
  { id: 'uc-merced', name: 'University of California, Merced', aliases: ['UC Merced', 'UCM'] },
  { id: 'uc-riverside', name: 'University of California, Riverside', aliases: ['UC Riverside', 'UCR'] },
  { id: 'uc-san-diego', name: 'University of California, San Diego', aliases: ['UC San Diego', 'UCSD'] },
  { id: 'uc-san-francisco', name: 'University of California, San Francisco', aliases: ['UC San Francisco', 'UCSF'] },
  { id: 'uc-santa-barbara', name: 'University of California, Santa Barbara', aliases: ['UC Santa Barbara', 'UCSB'] },
  { id: 'uc-santa-cruz', name: 'University of California, Santa Cruz', aliases: ['UC Santa Cruz', 'UCSC'] },
  { id: 'stanford', name: 'Stanford University', aliases: ['Stanford'] },
  { id: 'harvard', name: 'Harvard University', aliases: ['Harvard'] },
  { id: 'mit', name: 'Massachusetts Institute of Technology', aliases: ['MIT'] },
  { id: 'johns-hopkins', name: 'Johns Hopkins University', aliases: ['Johns Hopkins', 'JHU'] },
  { id: 'pennsylvania', name: 'University of Pennsylvania', aliases: ['Penn', 'UPenn'] },
  { id: 'yale', name: 'Yale University', aliases: ['Yale'] },
  { id: 'columbia', name: 'Columbia University', aliases: ['Columbia'] },
  { id: 'princeton', name: 'Princeton University', aliases: ['Princeton'] },
  { id: 'nyu', name: 'New York University', aliases: ['NYU'] },
  { id: 'duke', name: 'Duke University', aliases: ['Duke'] },
  { id: 'michigan', name: 'University of Michigan', aliases: ['Michigan', 'UMich', 'U-M'] },
  { id: 'washington', name: 'University of Washington', aliases: ['UW', 'Washington'] },
  { id: 'wisconsin-madison', name: 'University of Wisconsin–Madison', aliases: ['UW Madison', 'Wisconsin', 'UW–Madison'] },
  { id: 'texas-austin', name: 'University of Texas at Austin', aliases: ['UT Austin', 'Texas'] },
  { id: 'northwestern', name: 'Northwestern University', aliases: ['Northwestern'] },
  { id: 'chicago', name: 'University of Chicago', aliases: ['UChicago', 'Chicago'] },
  { id: 'southern-california', name: 'University of Southern California', aliases: ['USC', 'Southern California'] },
  { id: 'oxford', name: 'University of Oxford', aliases: ['Oxford'] },
  { id: 'cambridge', name: 'University of Cambridge', aliases: ['Cambridge'] },
  { id: 'imperial', name: 'Imperial College London', aliases: ['Imperial', 'ICL'] },
  { id: 'ucl', name: 'University College London', aliases: ['UCL'] },
  { id: 'toronto', name: 'University of Toronto', aliases: ['Toronto', 'U of T'] },
  { id: 'mcgill', name: 'McGill University', aliases: ['McGill'] },
  { id: 'melbourne', name: 'University of Melbourne', aliases: ['Melbourne', 'UniMelb'] },
  { id: 'nus', name: 'National University of Singapore', aliases: ['NUS'] },
]

const universitiesById = new Map(UNIVERSITIES.map(({ id, name }) => [id, { id, name }]))
const PROFILE_STORAGE_KEY = 'microfish.researcher-profile.v1'
const INVALID_PROFILE_WARNING = 'Your saved university selection could not be restored. Please choose your university again.'
const STORAGE_READ_WARNING = 'Your saved university selection could not be read in this browser. Please choose your university again.'
const STORAGE_WRITE_WARNING = 'Your university selection could not be saved in this browser. It is only kept for this visit.'

export function normalizeUniversity(value) {
  if (Array.isArray(value)) return null
  const id = typeof value === 'string' ? value : value?.id
  if (typeof id !== 'string') return null
  const known = universitiesById.get(id)
  if (known) return { ...known }
  if (id === 'independent') return { id, name: 'Independent researcher' }
  if (id !== 'other' || typeof value?.name !== 'string') return null
  // Reject control characters before normalizing whitespace so hidden characters
  // cannot be persisted in a user-provided institution name.
  if (/\p{Cc}/u.test(value.name)) return null
  const name = value.name.trim().replace(/\s+/gu, ' ')
  if (!name || Array.from(name).length > 120) return null
  return { id, name }
}

export function universityStorageKey(accountId) {
  if (typeof accountId !== 'string' || !accountId.trim()) return null
  return workspaceStorageKey(PROFILE_STORAGE_KEY, accountId)
}

export function readResearcherUniversity(storage, accountId) {
  const key = universityStorageKey(accountId)
  if (!key) return { university: null, error: '' }
  let saved
  try {
    saved = storage.getItem(key)
  } catch {
    return { university: null, error: STORAGE_READ_WARNING }
  }
  if (saved === null) return { university: null, error: '' }
  try {
    const profile = JSON.parse(saved)
    if (!profile || profile.version !== 1) {
      return { university: null, error: INVALID_PROFILE_WARNING }
    }
    const university = normalizeUniversity(profile.university)
    return university
      ? { university, error: '' }
      : { university: null, error: INVALID_PROFILE_WARNING }
  } catch {
    return { university: null, error: INVALID_PROFILE_WARNING }
  }
}

export function saveResearcherUniversity(storage, accountId, value) {
  const key = universityStorageKey(accountId)
  if (!key) return { university: null, error: 'Sign in to save your university selection.' }
  const university = normalizeUniversity(value)
  if (!university) return { university: null, error: 'Choose a university or enter an institution name of up to 120 characters.' }
  try {
    storage.setItem(key, JSON.stringify({ version: 1, university }))
    return { university, error: '' }
  } catch {
    return { university, error: STORAGE_WRITE_WARNING }
  }
}
