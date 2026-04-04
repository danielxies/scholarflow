export function extractJsonPayload(raw: string): string {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  return raw.trim();
}
