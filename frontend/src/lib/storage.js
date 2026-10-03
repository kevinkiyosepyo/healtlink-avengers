// localStorage can throw (private mode, quota, blocked site data). Callers get
// a fallback instead of an exception; persistence is best-effort by design.
export function readJson(key, fallback) {
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Returns false when the value could not be saved. */
export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
