import { Type } from "@google/genai";
import type { Schema } from "@google/genai";

export interface ColumnMapping {
  taskNameColumn: number;
  durationColumn: number;
  startDateColumn: number;
  endDateColumn: number;
  percentCompleteColumn: number;
  predecessorsColumn: number;
  wbsSectionColumn: number;
}

/** -1 in any *Column field means "no matching column found". */
export const columnMappingSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    taskNameColumn: { type: Type.INTEGER },
    durationColumn: { type: Type.INTEGER },
    startDateColumn: { type: Type.INTEGER },
    endDateColumn: { type: Type.INTEGER },
    percentCompleteColumn: { type: Type.INTEGER },
    predecessorsColumn: { type: Type.INTEGER },
    wbsSectionColumn: { type: Type.INTEGER },
  },
  required: [
    "taskNameColumn",
    "durationColumn",
    "startDateColumn",
    "endDateColumn",
    "percentCompleteColumn",
    "predecessorsColumn",
    "wbsSectionColumn",
  ],
};

export const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: "taskNameColumn", label: "Task name" },
  { key: "durationColumn", label: "Duration (days)" },
  { key: "startDateColumn", label: "Start date" },
  { key: "endDateColumn", label: "End date" },
  { key: "percentCompleteColumn", label: "% complete" },
  { key: "predecessorsColumn", label: "Predecessors" },
  { key: "wbsSectionColumn", label: "WBS section" },
];
