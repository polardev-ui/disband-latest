import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiKey = process.env.DISBAND_INTERNAL_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'server missing internal api key environment variable, unspecified' },
        { status: 500 }
      );
    }

    const backendResponse = await fetch('https://encrypt.disband.dev/api/method/vixen', {
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
      { error: 'failed to proxy vixen request', details: error.message },
      { status: 500 }
    );
  }
}
