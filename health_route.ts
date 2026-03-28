import { NextResponse } from './next_server_compat';

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      service: 'mix7-backend-api',
      status: 'healthy',
    },
  });
}
