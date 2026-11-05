import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Anonymous accounts are temporarily disabled." },
    { status: 403 },
  );
}