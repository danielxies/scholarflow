import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { OpenAlexError, searchWorks } from "@/lib/openalex";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 },
      );
    }

    const limit = parseInt(searchParams.get("limit") ?? "10", 10);
    const yearStart = searchParams.get("yearStart");
    const yearEnd = searchParams.get("yearEnd");

    let yearRange: string | undefined;
    if (yearStart || yearEnd) {
      yearRange = `${yearStart ?? ""}-${yearEnd ?? ""}`;
    }

    const papers = await searchWorks(query, { limit, yearRange });

    return NextResponse.json({ papers });
  } catch (error) {
    console.error("Paper search error:", error);

    if (error instanceof OpenAlexError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "Failed to search papers" },
      { status: 500 },
    );
  }
}
