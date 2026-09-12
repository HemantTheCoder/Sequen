import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateStructured, Type } from "@/lib/ai/gemini";
import type { Schema } from "@google/genai";

interface EstimateRequestRow {
  rowIndex: number;
  taskName: string;
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    estimates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rowIndex: { type: Type.INTEGER },
          durationDays: { type: Type.INTEGER },
        },
        required: ["rowIndex", "durationDays"],
      },
    },
  },
  required: ["estimates"],
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { rows } = await req.json() as { rows: EstimateRequestRow[] };
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ estimates: [] });
  }

  const list = rows.map((r) => `${r.rowIndex}: ${r.taskName}`).join("\n");
  const prompt = `These construction task names have no duration in the source spreadsheet. \
Estimate a realistic duration in whole working days for each, based on typical construction \
task scope implied by the name. Return one estimate per rowIndex given:
${list}`;

  try {
    const result = await generateStructured<{ estimates: { rowIndex: number; durationDays: number }[] }>(
      prompt,
      responseSchema,
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI duration estimation failed" },
      { status: 500 },
    );
  }
}
