import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiKey = process.env.DISBAND_INTERNAL_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server missing DISBAND_INTERNAL_API_KEY environment variable' },
        { status: 500 }
      );
    }

    const backendResponse = await fetch('https://encrypt.disband.dev/api/method/cypel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to proxy Cypel encoding request', details: error.message },
      { status: 500 }
    );
  }
}
