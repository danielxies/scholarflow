import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

import { getSkillContent } from "@/lib/skills-loader";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ skillId: string }> }
) {
  const userId = await getSessionUserId();


  const { skillId } = await params;
  const skill = getSkillContent(skillId);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json(skill);
}
