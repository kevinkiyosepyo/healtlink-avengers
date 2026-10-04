import { createPublicInstitutionPreviewHandler } from "../server/publicInstitution.js";
import { nodeHandler } from "../server/node.js";

export const config = { maxDuration: 30 };
export default nodeHandler(createPublicInstitutionPreviewHandler());
