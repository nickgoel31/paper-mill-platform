// Force Node.js runtime for this route so bcryptjs crypto APIs are available
export const runtime = "nodejs";

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;