import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  getAllSkills,
  getSkillsByCategory,
  searchSkills,
} from "@/lib/skills-loader";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
