// POST /api/reports/download — generate and stream a report file

import { Router } from "express";
import type { ReportPayload, ReportFormat } from "../types";
import { generateReport } from "../output/generator";

export const reportsRouter = Router();

reportsRouter.post("/download", async (req, res) => {
  try {
    const { payload, format = "csv" } = req.body as { payload: ReportPayload; format?: ReportFormat };

    const buffer = await generateReport(payload, format);

    const contentType = format === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "text/csv";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="report.${format}"`);
    res.send(buffer);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Report generation failed";
    res.status(500).json({ error: message });
  }
});
