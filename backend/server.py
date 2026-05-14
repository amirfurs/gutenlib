from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import httpx

app = FastAPI()

NEXT_SERVER = "http://127.0.0.1:3000"

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy(request: Request, path: str):
    """Proxy all /api/* requests to the Next.js server."""
    url = f"{NEXT_SERVER}/api/{path}"
    
    headers = dict(request.headers)
    headers.pop("host", None)
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.request(
            method=request.method,
            url=url,
            headers=headers,
            content=await request.body(),
            params=dict(request.query_params),
        )
    
    return StreamingResponse(
        iter([resp.content]),
        status_code=resp.status_code,
        headers=dict(resp.headers),
    )
