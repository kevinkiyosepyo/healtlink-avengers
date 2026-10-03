import { handleApiRequest } from "../server/handlers.js";
import { nodeHandler } from "../server/node.js";
export const config = { maxDuration: 60 };
export default nodeHandler(handleApiRequest);
