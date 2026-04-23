
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Google OAuth Configuration
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback"
  );

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // --- GOOGLE OAUTH ROUTES ---

  app.get("/api/auth/google/url", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.file"],
      prompt: "consent"
    });
    res.json({ url });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      
      // Send success message to parent window and close popup
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_AUTH_SUCCESS', 
                  tokens: ${JSON.stringify(tokens)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Autenticação bem-sucedida. Esta janela fechará automaticamente.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Erro no callback do Google:", error);
      res.status(500).send("Erro na autenticação com o Google.");
    }
  });

  // --- GOOGLE DOCS EXPORT ROUTE ---

  app.post("/api/export/google-docs", async (req, res) => {
    const { report, tokens, title } = req.body;
    
    if (!tokens || !report) {
      return res.status(400).json({ error: "Tokens e relatório são obrigatórios." });
    }

    try {
      const auth = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      auth.setCredentials(tokens);

      const docs = google.docs({ version: "v1", auth });
      
      // 1. Create a new document
      const createRes = await docs.documents.create({
        requestBody: {
          title: title || `Relatório de Auditoria - ${new Date().toLocaleDateString('pt-BR')}`
        }
      });

      const documentId = createRes.data.documentId;

      // 2. Insert content
      // Simple conversion of Markdown-ish to Docs requests
      // We'll just insert the whole text for now, but we could do more complex parsing
      await docs.documents.batchUpdate({
        documentId: documentId!,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: report
              }
            }
          ]
        }
      });

      res.json({ 
        success: true, 
        documentId, 
        url: `https://docs.google.com/document/d/${documentId}/edit` 
      });
    } catch (error: any) {
      console.error("Erro ao exportar para Google Docs:", error);
      res.status(500).json({ error: "Erro ao criar documento no Google Docs." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
