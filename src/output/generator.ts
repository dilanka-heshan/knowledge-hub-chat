// Generates downloadable reports from ReportPayload (CSV and DOCX).

import type { ReportPayload, ReportFormat } from "../types";

export async function generateReport(payload: ReportPayload, format: ReportFormat): Promise<Buffer> {
  if (format === "csv")  return generateCsv(payload);
  if (format === "docx") return generateDocx(payload);
  throw new Error(`Unsupported format: ${format}`);
}

function generateCsv(payload: ReportPayload): Buffer {
  const lines: string[] = [
    `"Title","${esc(payload.title)}"`,
    `"Generated At","${payload.generatedAt}"`,
    `"Sources","${esc(payload.sourceLabels.join("; "))}"`,
    "",
  ];

  for (const section of payload.sections) {
    lines.push(`"Section","${esc(section.heading)}"`);
    lines.push(`"","${esc(section.content)}"`);

    if (section.data && section.data.length > 0) {
      const firstRow = section.data[0];
      if (firstRow) {
        const keys = Object.keys(firstRow);
        lines.push(keys.map(k => `"${esc(k)}"`).join(","));
        for (const row of section.data) {
          lines.push(keys.map(k => `"${esc(String(row[k] ?? ""))}"`).join(","));
        }
      }
    }
    lines.push("");
  }

  return Buffer.from(lines.join("\n"), "utf-8");
}

function generateDocx(payload: ReportPayload): Buffer {
  // Plain-text DOCX placeholder — replace with real docx library if formatted output is needed
  const parts = [
    payload.title,
    `Generated: ${payload.generatedAt}`,
    `Sources: ${payload.sourceLabels.join(", ")}`,
    "",
    ...payload.sections.map(s => `== ${s.heading} ==\n${s.content}`),
  ];

  if (payload.rawData && payload.rawData.length > 0) {
    parts.push("\n== Raw Data ==");
    parts.push(JSON.stringify(payload.rawData, null, 2));
  }

  return Buffer.from(parts.join("\n\n"), "utf-8");
}

function esc(value: string): string {
  return value.replace(/"/g, '""');
}
