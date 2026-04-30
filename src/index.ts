// Express app entry point

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { chatRouter } from "./routes/chat";
import { reportsRouter } from "./routes/reports";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.use("/api/chat", chatRouter);
app.use("/api/reports", reportsRouter);
app.use("/dev", express.static(path.resolve("data")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Knowledge Hub running on http://localhost:${PORT}`);
});
