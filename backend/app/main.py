"""Second Eyes backend: one frame in, one structured obstacle answer out."""

import base64
import binascii
import time

from fastapi import FastAPI, HTTPException

from .config import load_settings
from .schemas import AnalyzeRequest, AnalyzeResponse, HealthResponse
from .vision import LiveModeUnavailable, MockVision

LIVE_UNAVAILABLE_DETAIL = (
    "VISION_MODE=live is not available yet (Phase B not built). "
    "Unset VISION_MODE or set it to mock."
)


def create_app() -> FastAPI:
    settings = load_settings()
    mock = MockVision()
    app = FastAPI(title="Second Eyes")

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok", vision_mode=settings.vision_mode)

    @app.post("/api/analyze", response_model=AnalyzeResponse)
    def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
        try:
            base64.b64decode(req.image_b64, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=422, detail="image_b64 is not valid base64")

        try:
            if settings.vision_mode != "mock":
                raise LiveModeUnavailable(LIVE_UNAVAILABLE_DETAIL)
            started = time.perf_counter()
            answer = mock.analyze(req.image_b64)
            model_ms = (time.perf_counter() - started) * 1000
        except LiveModeUnavailable as exc:
            raise HTTPException(status_code=501, detail=str(exc))

        return AnalyzeResponse(**answer.model_dump(), source=settings.vision_mode, model_ms=model_ms)

    return app


app = create_app()
