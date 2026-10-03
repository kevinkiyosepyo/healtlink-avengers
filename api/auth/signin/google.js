import { handleApiRequest } from "../../../server/handlers.js";
import { nodeHandler } from "../../../server/node.js";

// Explicit nested route: Vercel's standalone API routing does not use
// Next.js catch-all semantics for api/auth/[...auth].js.
export default nodeHandler(handleApiRequest);
