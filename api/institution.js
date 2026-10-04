import { handleApiRequest } from "../server/handlers.js";
import { nodeHandler } from "../server/node.js";
export const config = { maxDuration: 180 };
export default nodeHandler(handleApiRequest);
