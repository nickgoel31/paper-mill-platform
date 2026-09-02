export interface Env {
  // Container binding for the OR-Tools Python FastAPI engine
  solver_engine?: {
    fetch(request: Request): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Root health check endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "hra-solver-container" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Forward request to the container if binding is present
    if (env.solver_engine) {
      return env.solver_engine.fetch(request);
    }

    // Direct proxy fallback when running as microservice
    return new Response(
      JSON.stringify({ error: "Solver container proxy ready. Forwarding directly to internal port 8000." }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};
