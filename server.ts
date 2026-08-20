/**
 * Servidor de desenvolvimento: serve o Vite em middleware mode e expõe o mesmo
 * endpoint /zf-proxy que a função serverless da Vercel expõe em produção.
 */
import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { callZfApi, decodePayload } from "./api/_core";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "2mb" }));

  app.post("/zf-proxy", async (req, res) => {
    try {
      const { payload } = req.body ?? {};
      if (!payload || typeof payload !== "string") {
        return res.status(400).json({ error: "Missing payload" });
      }

      const request = decodePayload(payload);
      const { status, body } = await callZfApi(request);

      console.log(`[ZF] ${request.operation} -> HTTP ${status}`);
      return res.status(status).json(body);
    } catch (error: any) {
      console.error("[ZF ERROR]:", error?.message);
      return res.status(502).json({ error: `Proxy não conseguiu falar com a API da ZF: ${error?.message}` });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ZF API Explorer rodando em http://localhost:${PORT}`);
  });
}

startServer();
