import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

import {
  getAllSkills,
  getSkillsByCategory,
  searchSkills,
} from "@/lib/skills-loader";

export async function GET(request: Request) {
  const userId = await getSessionUserId();


  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const grouped = searchParams.get("grouped");

  if (query) {
    const results = searchSkills(query);
    return NextResponse.json(results);
  }

  if (grouped === "true") {
    const results = getSkillsByCategory();
    return NextResponse.json(results);
  }

  const results = getAllSkills();
  return NextResponse.json(results);
}
