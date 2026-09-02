import { Container, getContainer } from "@cloudflare/containers";

export class SolverContainer extends Container {
  defaultPort = 8000;
  sleepAfter = "30s";

  override onStart() {
    console.log("[SolverContainer] FastAPI OR-Tools cutting stock engine running on port 8000");
  }
}

export interface Env {
  SOLVER_CONTAINER: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Root healthcheck
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", service: "hra-solver-container", engine: "OR-Tools" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Proxy request to the container instance
    if (env.SOLVER_CONTAINER) {
      const container = getContainer(env.SOLVER_CONTAINER, "hra-solver-instance");
      return container.fetch(request);
    }

    return new Response(
      JSON.stringify({ error: "Container binding SOLVER_CONTAINER not found." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  },
};
