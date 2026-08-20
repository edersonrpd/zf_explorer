import type { VercelRequest, VercelResponse } from "@vercel/node";
import { callZfApi, decodePayload } from "./_core";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { payload } = req.body ?? {};
    if (!payload || typeof payload !== "string") {
      return res.status(400).json({ error: "Missing payload" });
    }

    const request = decodePayload(payload);
    const { status, body } = await callZfApi(request);

    console.log(`[ZF VERCEL] ${request.operation} -> HTTP ${status}`);
    return res.status(status).json(body);
  } catch (error: any) {
    console.error("[ZF VERCEL ERROR]:", error?.message);
    return res.status(502).json({ error: `Proxy não conseguiu falar com a API da ZF: ${error?.message}` });
  }
}
