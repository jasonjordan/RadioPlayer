export async function onRequest(context) {
    const url = new URL(context.request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response('Missing url parameter', { status: 400 });
    }

    try {
        const response = await fetch(targetUrl);
        
        if (!response.ok) {
            return new Response(`Upstream error: ${response.status}`, { status: response.status });
        }

        // Clone the response to safely modify headers
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        
        return newResponse;
    } catch (err) {
        return new Response('Failed to fetch album art', { status: 500 });
    }
}
