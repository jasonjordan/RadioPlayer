export async function onRequest(context) {
    const npUrl = 'https://hq3.yesstreaming.net/api/client/22/station/11/now-playing';
    const lpUrl = 'https://hq3.yesstreaming.net/api/client/22/station/11/last-played?count=4';

    try {
        const [npRes, lpRes] = await Promise.all([
            fetch(npUrl),
            fetch(lpUrl)
        ]);
        
        // If the upstream server fails (e.g. 504 Gateway Timeout), we still want to return a JSON response
        // so our frontend can handle it cleanly instead of throwing a generic HTML error page.
        if (!npRes.ok) {
            return new Response(JSON.stringify({ error: `Upstream error: ${npRes.status}` }), {
                status: npRes.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            });
        }

        const data = await npRes.json();
        
        // Merge the history data if available
        if (lpRes.ok) {
            const lpData = await lpRes.json();
            if (lpData.tracks) {
                data.history = lpData.tracks;
            }
        }

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
