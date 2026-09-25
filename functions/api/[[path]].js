export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = new URL(url.pathname + url.search, 'https://rethink-realtime-worker.buleegasy-6c8.workers.dev');
  
  const reqHeaders = new Headers(context.request.headers);
  reqHeaders.delete('host');

  let body = undefined;
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    try {
      body = await context.request.arrayBuffer();
    } catch {}
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      method: context.request.method,
      headers: reqHeaders,
      body,
      redirect: 'follow',
    });

    const respHeaders = new Headers(response.headers);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Worker proxy failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
