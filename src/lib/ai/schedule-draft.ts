import { Type } from "@google/genai";
import type { Schema } from "@google/genai";
import type { DependencyType } from "@/lib/cpm/types";

export interface AiDependencyDraft {
  /** `key` of the predecessor task within this same draft. */
  dependsOnKey: string;
  type: DependencyType;
  lagDays: number;
}

export interface AiTaskDraft {
  /** Short stable identifier unique within the draft, used to wire up dependencies before real IDs exist. */
  key: string;
  name: string;
  durationDays: number;
  isMilestone: boolean;
  /** True when the AI had to guess this duration rather than derive it from explicit input. */
  isEstimated: boolean;
  dependencies: AiDependencyDraft[];
}

export interface AiWbsSectionDraft {
  name: string;
  tasks: AiTaskDraft[];
}

export interface AiScheduleDraft {
  wbs: AiWbsSectionDraft[];
}

const dependencySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    dependsOnKey: { type: Type.STRING },
    type: { type: Type.STRING, enum: ["FS", "SS", "FF", "SF"] },
    lagDays: { type: Type.INTEGER },
  },
  required: ["dependsOnKey", "type", "lagDays"],
};

const taskSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    key: { type: Type.STRING },
    name: { type: Type.STRING },
    durationDays: { type: Type.INTEGER },
    isMilestone: { type: Type.BOOLEAN },
    isEstimated: { type: Type.BOOLEAN },
    dependencies: { type: Type.ARRAY, items: dependencySchema },
  },
  required: ["key", "name", "durationDays", "isMilestone", "isEstimated", "dependencies"],
};

const wbsSectionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    tasks: { type: Type.ARRAY, items: taskSchema },
  },
  required: ["name", "tasks"],
};

export const scheduleDraftSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    wbs: { type: Type.ARRAY, items: wbsSectionSchema },
  },
  required: ["wbs"],
};
