import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateStructured } from "@/lib/ai/gemini";
import { columnMappingSchema, type ColumnMapping } from "@/lib/ai/column-mapping";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { headers, sampleRows } = await req.json() as { headers: string[]; sampleRows: string[][] };
  if (!Array.isArray(headers) || headers.length === 0) {
    return NextResponse.json({ error: "No columns to map" }, { status: 400 });
  }

  const headerList = headers.map((h, i) => `${i}: "${h}"`).join("\n");
  const sampleText = sampleRows
    .slice(0, 5)
    .map((row) => row.map((c, i) => `${headers[i] ?? i}=${c}`).join(" | "))
    .join("\n");

  const prompt = `A user uploaded a spreadsheet of construction project tasks with these columns \
(0-indexed):
${headerList}

Sample rows:
${sampleText}

Map each column index (0-indexed) to the schedule field it most likely represents, even if the \
header text is abbreviated, misspelled, or in a different convention (e.g. "Task", "Activity", \
"Description" all mean task name; "Dur", "Days", "Length" mean duration; "Pred", "Predecessor", \
"Depends On" mean predecessors). Use -1 for any field with no matching column. A column should be \
used for at most one field.`;

  try {
    const mapping = await generateStructured<ColumnMapping>(prompt, columnMappingSchema);
    return NextResponse.json({ mapping });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI column mapping failed" },
      { status: 500 },
    );
  }
}
