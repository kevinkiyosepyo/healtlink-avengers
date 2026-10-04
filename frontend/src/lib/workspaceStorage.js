// Anonymous demo storage keeps its original key. Signed-in accounts each have
// a separate browser workspace; this does not upload or sync data to a server.
export function workspaceStorageKey(baseKey, accountId = null) {
  if (accountId === null || accountId === undefined || accountId === '') return baseKey
  // Encoding the whole ID keeps separators inside an account ID unambiguous.
  return `${baseKey}.account.${encodeURIComponent(String(accountId))}`
}
