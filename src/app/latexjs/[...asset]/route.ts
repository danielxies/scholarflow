import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const LATEXJS_DIST_DIR = path.resolve(
  process.cwd(),
  "node_modules",
  "latex.js",
  "dist"
);

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveAssetPath(asset: string[]): string | null {
  const normalizedPath = path.posix.normalize(asset.join("/"));

  if (
    normalizedPath.length === 0 ||
    normalizedPath === "." ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("\0")
  ) {
    return null;
  }

  const resolvedPath = path.resolve(LATEXJS_DIST_DIR, normalizedPath);
  if (
    resolvedPath !== LATEXJS_DIST_DIR &&
    !resolvedPath.startsWith(`${LATEXJS_DIST_DIR}${path.sep}`)
  ) {
    return null;
  }

  return resolvedPath;
}

function getContentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string[] }> }
) {
  const { asset } = await params;
  const resolvedPath = resolveAssetPath(asset);

  if (!resolvedPath) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const file = await fs.readFile(resolvedPath);
    return new NextResponse(file, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": getContentType(resolvedPath),
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return new NextResponse("Not found", { status: 404 });
    }

    console.error("latex.js asset error: ", error);
    return new NextResponse("Failed to load asset", { status: 500 });
  }
}
