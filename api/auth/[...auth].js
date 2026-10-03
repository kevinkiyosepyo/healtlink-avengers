import { handleApiRequest } from "../../server/handlers.js";
import { nodeHandler } from "../../server/node.js";
export default nodeHandler(handleApiRequest);
