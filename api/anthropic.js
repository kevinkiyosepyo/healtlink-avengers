import { nodeHandler } from "../server/node.js";
import { handleApiRequest } from "../server/handlers.js";

export const config = { maxDuration: 60 };
export default nodeHandler(handleApiRequest);
