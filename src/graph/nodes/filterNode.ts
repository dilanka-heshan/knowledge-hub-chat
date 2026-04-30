// Filter node — extracts useful data, source labels, and visualization hint from raw results.

import { filterData } from "../../agent/filter";
import type { GraphStateType } from "../state";

export async function filterNode(state: GraphStateType) {
  const filteredData = filterData(state.rawResults, state.outputOptions);

  const sourceLabels = state.rawResults
    .filter(r => r.data !== null && !r.isLlmStep)
    .map(r => r.description);

  const vizStep = state.rawResults.find(r => r.visualizationHint);
  const visualizationHint = vizStep?.visualizationHint ?? "";

  return { filteredData, sourceLabels, visualizationHint };
}
