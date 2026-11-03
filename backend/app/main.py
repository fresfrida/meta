"""Second Eyes backend: one frame in, one structured obstacle answer out."""

import base64
import binascii
import logging

from fastapi import FastAPI, HTTPException

from .budget import Budget, cost_usd
from .config import Settings, load_settings
from .schemas import AnalyzeRequest, AnalyzeResponse, ErrorDetail, HealthResponse
from .vision import LiveVision, MockVision, Vision, VisionError

log = logging.getLogger(__name__)


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail=ErrorDetail(code=code, message=message).model_dump())


def create_app(settings: Settings | None = None, vision: Vision | None = None, budget: Budget | None = None) -> FastAPI:
    settings = settings or load_settings()
    live = settings.vision_mode == "live"
    vision = vision or (LiveVision(settings) if live else MockVision(settings.mock_hold_calls))
    budget = budget or Budget(settings.spend_file, settings.budget_usd)
    app = FastAPI(title="Second Eyes")
    log.info("starting with %r", settings)

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            vision_mode=settings.vision_mode,
            model=settings.vision_model if live else None,
            key_present=settings.key_present,
            spent_usd=round(budget.spent_usd, 6),
            budget_usd=settings.budget_usd,
        )

    @app.post("/api/analyze", response_model=AnalyzeResponse)
    def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
        try:
            base64.b64decode(req.image_b64, validate=True)
        except (binascii.Error, ValueError):
            raise _error(422, "invalid_image", "image_b64 is not valid base64")

        if live and budget.reached():
            raise _error(402, "budget_reached", f"live budget of ${settings.budget_usd:g} reached")

        try:
            result = vision.analyze(req.image_b64)
        except VisionError as exc:
            log.warning("live call failed: %s (%s)", exc.code, exc.message)
            raise _error(exc.status, exc.code, exc.message)

        cost = None
        if live and result.input_tokens is not None and result.output_tokens is not None:
            cost = cost_usd(settings.prices, result.input_tokens, result.cached_tokens or 0, result.output_tokens)
            budget.add(cost)

        return AnalyzeResponse(
            **result.answer.model_dump(),
            source=settings.vision_mode,
            model_ms=result.model_ms,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            cost_usd=cost,
        )

    return app


app = create_app()
