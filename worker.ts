export default {
    async fetch(request: Request, env: any): Promise<Response> {
        try {
            // Try to fetch the static asset
            const response = await env.ASSETS.fetch(request);

            // If asset exists, return it
            if (response.status === 200) {
                return response;
            }

            // Otherwise, return index.html for SPA routing
            return env.ASSETS.fetch(new URL("/index.html", request.url));
        } catch {
            return new Response("Not found", { status: 404 });
        }
    },
};
