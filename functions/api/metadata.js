export async function onRequest(context) {
    const targetUrl = 'https://hq3.yesstreaming.net/api/client/22/station/11/now-playing';

    try {
        const response = await fetch(targetUrl);
        
        // If the upstream server fails (e.g. 504 Gateway Timeout), we still want to return a JSON response
        // so our frontend can handle it cleanly instead of throwing a generic HTML error page.
        if (!response.ok) {
            return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
                status: response.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            });
        }

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to fetch metadata' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            }
        });
    }
}
