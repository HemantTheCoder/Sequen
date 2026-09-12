import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateStructured } from "@/lib/ai/gemini";
import { scheduleDraftSchema, type AiScheduleDraft } from "@/lib/ai/schedule-draft";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { description } = await req.json();
  if (!description || typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "A project description is required" }, { status: 400 });
  }

  const prompt = `You are a construction/civil-engineering project scheduler. Draft a work breakdown \
structure and task schedule for the following project:

"""
${description}
"""

Rules:
- Break the project into 3-8 logical WBS sections (e.g. mobilization, foundation, structure, MEP, finishing, handover), in construction sequence.
- Each section should have 2-8 tasks with realistic durations in whole working days for the described scope.
- Every task must have a short unique "key" (e.g. "t1", "t2") used only to reference it in dependencies - never reuse a key.
- Add dependencies that reflect real construction logic (a task normally can't start before its logical predecessor finishes). Most should be Finish-to-Start (FS) with 0 lag; use SS/FF/SF and lag days only when genuinely appropriate (e.g. curing time, overlapping trades).
- The very first task(s) should have no dependencies.
- Mark isMilestone true only for zero-duration checkpoint tasks (e.g. "Foundation approved"), and give them durationDays 0.
- Set isEstimated true on every task, since all durations here are AI estimates rather than user-supplied data.
- Keep task and section names concise and specific to this project, not generic placeholders.`;

  try {
    const draft = await generateStructured<AiScheduleDraft>(prompt, scheduleDraftSchema);
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI generation failed" },
      { status: 500 },
    );
  }
}
