import { NextResponse } from "next/server";
import { getStatusSnapshot } from "@/lib/status-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getStatusSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
