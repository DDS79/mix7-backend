export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  }
}
