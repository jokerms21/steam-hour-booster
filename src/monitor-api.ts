import type { Bot } from "./bot";

export function startMonitorApi(bots: Bot[], port: number): void {
	const server = Bun.serve({
		port,
		fetch(req) {
			const url = new URL(req.url);

			if (url.pathname === "/" || url.pathname === "/status") {
				const status = bots.map((bot) => bot.info);

				return Response.json(status, {
					headers: { "Content-Type": "application/json" },
				});
			}

			return new Response("Not Found", { status: 404 });
		},
	});

	console.info(`Monitor API running at http://localhost:${server.port}/`);
}
