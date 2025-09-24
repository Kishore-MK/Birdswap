import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const buyToken = searchParams.get('buyToken');
  const sellToken = searchParams.get('sellToken');
  const sellAmount = searchParams.get('sellAmount');

  if (!buyToken || !sellToken || !sellAmount) {
    return NextResponse.json({ error: 'Missing required query parameters' }, { status: 400 });
  }

  const qs = `buyToken=${buyToken}&sellToken=${sellToken}&sellAmount=${sellAmount}`;
  const quoteUrl = `https://api.0x.org/swap/v1/quote?${qs}`;
  
  try {
    const response = await fetch(quoteUrl, {
      headers: {
        '0x-api-key': process.env.ZERO_EX_API_KEY || '',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('0x API Error:', errorData);
      return NextResponse.json({ error: `Failed to fetch quote from 0x API: ${errorData.reason}` }, { status: response.status });
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching 0x quote:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
