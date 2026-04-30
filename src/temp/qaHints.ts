// QA hints — reference patterns passed to the agent loop as guidance.
// These are NOT hardcoded execution steps — just suggestions the LLM can follow or ignore.
// TEMPORARY: Replace with Dev 1 integration when ready.

export interface QaHint {
  question: string;
  hint: string;
}

export const QA_HINTS: QaHint[] = [

  // ── Greetings ─────────────────────────────────────────────────────────────
  { question: "hi",              hint: "This is a greeting. Respond warmly as Atlato-One. Do not call any tools." },
  { question: "hello",           hint: "This is a greeting. Respond warmly as Atlato-One. Do not call any tools." },
  { question: "who are you",     hint: "Introduce yourself as Atlato-One, Atlato's AI business assistant. Do not call any tools." },
  { question: "what can you do", hint: "Describe your capabilities as Atlato-One — fleet, medical data, agriculture, weather, maintenance. Do not call any tools." },
  { question: "how are you",     hint: "Respond conversationally. Do not call any tools." },

  // ── Fleet & Vehicle ────────────────────────────────────────────────────────
  { question: "what is the current speed of all vehicles", hint: "Call get_fleet_status. Focus on speed data for each vehicle." },
  { question: "show fleet status",            hint: "Call get_fleet_status for a full overview of all vehicles." },
  { question: "show fuel levels of all vehicles", hint: "Call get_fleet_status. Focus on fuel levels." },
  { question: "which vehicles are idle",      hint: "Call get_fleet_status. Filter and list vehicles with idle status." },
  { question: "show vehicle locations",       hint: "Call get_fleet_status. Focus on location data." },
  { question: "generate fleet report",        hint: "Call get_fleet_status for complete fleet data and provide a comprehensive report." },
  { question: "generate a vehicle report with charts", hint: "Call get_fleet_status for all vehicle data. Report should include speed, fuel, and status." },

  // ── Maintenance ────────────────────────────────────────────────────────────
  { question: "show maintenance history",        hint: "Call get_maintenance_records to fetch all maintenance history." },
  { question: "show vehicle maintenance records", hint: "Call get_maintenance_records for detailed maintenance records." },
  { question: "which vehicles need maintenance", hint: "Call get_maintenance_records. Identify overdue or due-soon vehicles." },
  { question: "maintenance status",              hint: "Call get_maintenance_records for a maintenance overview." },
  { question: "show maintenance due vehicles",   hint: "Call get_maintenance_records. List vehicles due for maintenance." },

  // ── Weather ────────────────────────────────────────────────────────────────
  { question: "what is the weather in colombo",         hint: "Call get_weather with city=colombo." },
  { question: "is it going to rain today in colombo",   hint: "Call get_weather with city=colombo. Focus on rain probability and forecast." },
  { question: "what is today's date",                   hint: "Call get_current_date." },
  { question: "what is the weather in kandy",           hint: "Call get_weather with city=kandy." },

  // ── Conversation History ───────────────────────────────────────────────────
  { question: "summarize our previous discussion",      hint: "Call get_conversation_history and summarize key topics discussed." },
  { question: "what was the last question i asked",     hint: "Call get_conversation_history and identify the most recent user message." },
  { question: "what were the key points we discussed",  hint: "Call get_conversation_history and list key topics and decisions." },
  { question: "what did we talk about yesterday",       hint: "Call get_conversation_history and summarize the session." },

  // ── Agriculture ────────────────────────────────────────────────────────────
  { question: "show crop monitoring data",    hint: "Call get_agriculture_data for crop health and soil data." },
  { question: "what is the soil moisture level", hint: "Call get_agriculture_data. Focus on soil moisture readings per zone." },
  { question: "which crops need attention",   hint: "Call get_agriculture_data. Identify zones with alerts or dry conditions." },
  { question: "generate agriculture report",  hint: "Call get_agriculture_data for all crop and zone data and provide a full report." },

  // ── Medical / BigQuery ─────────────────────────────────────────────────────
  { question: "give me a summary of all patients", hint: "Call query_bigquery: summarize all patients — total count, gender breakdown, blood type distribution, top 3 insurance providers." },
  { question: "patient overview",               hint: "Call query_bigquery: patient summary — total count, gender, blood type, insurance providers." },
  { question: "show all patients",              hint: "Call query_bigquery: list ALL patient records — patient_id, first_name, last_name, gender, age, blood_type, insurance_provider. No row limit." },
  { question: "show patient list",              hint: "Call query_bigquery: list ALL patient records. No row limit." },
  { question: "show patient age distribution",  hint: "Call query_bigquery: patient count grouped by age decade (0-9, 10-19, etc.)." },
  { question: "show department activity",       hint: "Call query_bigquery: total encounters per department, encounter types, and highest average charges." },
  { question: "what are the top diagnoses",     hint: "Call query_bigquery: top 10 most common diagnoses with ICD-10 codes and severity breakdown." },
  { question: "check lab results schema",       hint: "Call query_bigquery: inspect the lab_results table columns and data types." },
  { question: "show abnormal lab results",      hint: "Call query_bigquery: tests with the most abnormal results — test name, total count, abnormal count, percentage." },
  { question: "show vital signs statistics",    hint: "Call query_bigquery: average vitals (BP, heart rate, SpO2, BMI, temperature) and counts of hypertension, tachycardia, and low oxygen." },
  { question: "show most prescribed medications", hint: "Call query_bigquery: top 10 medications with route, frequency, and active vs inactive count." },
  { question: "show financial summary",         hint: "Call query_bigquery: billing analysis — total charges, average per encounter type, insurance coverage, patient out-of-pocket." },
  { question: "find diabetes patients with abnormal hba1c", hint: "Call query_bigquery: join patients + diagnoses (E11.9 Type 2 Diabetes) + lab_results (abnormal HbA1c). Show patient_id, encounter count, average HbA1c. Limit 20." },
  { question: "show recent encounters",         hint: "Call query_bigquery: 50 most recent encounters ordered by admission_date descending." },
  { question: "show high risk patients",        hint: "Call query_bigquery: patients with 3+ diagnoses AND hypertension (systolic > 140) or low oxygen (spo2 < 94)." },
  { question: "show patient medications",       hint: "Call query_bigquery: active medication prescriptions — patient_id, medication_name, route, frequency, start_date. Limit 100." },
  { question: "show bigquery datasets",         hint: "Call query_bigquery to list available datasets in the project." },
  { question: "list bigquery tables",           hint: "Call query_bigquery to list available tables." },
];

// Returns the best matching hint for a query, or null if no good match found.
export function findHint(question: string): string | null {
  const q = question.toLowerCase().trim().replace(/[?!.,]/g, "");

  // Exact match
  const exact = QA_HINTS.find(h => h.question.toLowerCase() === q);
  if (exact) return exact.hint;

  // Keyword overlap — find hint with most word overlap
  const qWords = new Set(q.split(" ").filter(w => w.length > 2));
  let best: QaHint | null = null;
  let bestScore = 0;

  for (const hint of QA_HINTS) {
    const pWords = hint.question.toLowerCase().split(" ");
    const score = pWords.filter(w => qWords.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = hint;
    }
  }

  return best !== null && bestScore >= 2 ? best.hint : null;
}
