
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        service: "sec-cell",
        runtime: "celld",
        timestamp: new Date().toISOString(),
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    // 所有 /api/agent/* 转发到 AgentOS
    if (url.pathname.startsWith("/api/agent")) {
      const actorId = url.searchParams.get("id") || "default";
      const targetUrl = `http://127.0.0.1:9878${url.pathname}?id=${actorId}`;
      
      try {
        const body = ["POST", "PUT", "PATCH"].includes(request.method) 
          ? await request.clone().text() 
          : undefined;
        
        const resp = await fetch(targetUrl, {
          method: request.method,
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(30000),
        });
        
        return new Response(await resp.text(), {
          status: resp.status,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (e) {
        return new Response(JSON.stringify({ 
          error: "AgentOS unavailable",
          detail: e instanceof Error ? e.message : String(e),
        }), {
          status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }
    
    return new Response(JSON.stringify({
      service: "sec-cell",
      endpoints: ["/health", "/api/agent/*"],
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  },
};
