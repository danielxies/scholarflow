import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getSkillContent } from "@/lib/skills-loader";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ skillId: string }> }
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { skillId } = await params;
  const skill = getSkillContent(skillId);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json(skill);
}
