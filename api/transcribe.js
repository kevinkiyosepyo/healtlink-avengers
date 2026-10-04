import { handleApiRequest } from '../server/handlers.js'
// A Web handler preserves the WAV byte stream without Node body helpers.
export default { fetch: handleApiRequest }
