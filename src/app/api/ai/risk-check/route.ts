import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateStructured, Type } from "@/lib/ai/gemini";
import type { Schema } from "@google/genai";

interface AiRiskFinding {
  taskName: string;
  severity: "high" | "medium" | "low";
  message: string;
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    risks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          taskName: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["high", "medium", "low"] },
          message: { type: Type.STRING },
        },
        required: ["taskName", "severity", "message"],
      },
    },
  },
  required: ["risks"],
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { tasks, dependencies } = await req.json() as {
    tasks: { name: string; durationDays: number }[];
    dependencies: { predecessorName: string; successorName: string }[];
  };

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json({ risks: [] });
  }

  const taskList = tasks.map((t) => `- ${t.name} (${t.durationDays}d)`).join("\n");
  const depList = dependencies.length > 0
    ? dependencies.map((d) => `- ${d.predecessorName} -> ${d.successorName}`).join("\n")
    : "(none)";

  const prompt = `You are reviewing a construction project schedule for scheduling logic risks. \
Here is the task list:
${taskList}

Here are the existing dependencies between tasks:
${depList}

Based on domain knowledge of typical construction sequencing, identify at most 5 likely issues: \
missing dependencies that should probably exist given these task names (e.g. a task that clearly \
must follow another but has no link), or durations that look unrealistic for the described work. \
Only flag things you're reasonably confident about — do not invent issues. If there's nothing \
notable, return an empty risks array. Reference tasks by their exact name as given above.`;

  try {
    const result = await generateStructured<{ risks: AiRiskFinding[] }>(prompt, responseSchema);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI risk check failed" },
      { status: 500 },
    );
  }
}
