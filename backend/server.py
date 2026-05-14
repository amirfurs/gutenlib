from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import httpx

app = FastAPI()

NEXT_SERVER = "http://127.0.0.1:3000"

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy(request: Request, path: str):
    """Proxy all requests to the Next.js server.
    
    The ingress routes /api/* to this backend, so we need to forward
    the path directly (not add /api/ prefix since it's already in the path).
    """
    # The path already includes 'api/' since ingress strips nothing
    # Forward directly to Next.js
    url = f"{NEXT_SERVER}/{path}"
    
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
