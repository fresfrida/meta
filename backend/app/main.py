"""Second Eyes backend: one frame in, one structured obstacle answer out."""

import base64
import binascii
import logging

from fastapi import FastAPI, HTTPException

from fastapi import WebSocket

from .ask import Ask, EmptyAnswer, LiveAsk, MockAsk
from .budget import Budget, cost_usd
from .config import SAM_PRICE_PER_IMAGE, Settings, load_settings
from .detect import DetectFailed, Detector, LiveDetect, MockDetect
from .listen import AsrConnect, default_asr_connect, run_listen
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    AskRequest,
    AskResponse,
    DetectRequest,
    DetectResponse,
    ErrorDetail,
    HealthResponse,
    resolve_side,
    side_of_box,
)
from .vision import LiveVision, MockVision, Vision, VisionError, default_client_factory

log = logging.getLogger(__name__)


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail=ErrorDetail(code=code, message=message).model_dump())


def _valid_b64(image_b64: str) -> None:
    try:
        base64.b64decode(image_b64, validate=True)
    except (binascii.Error, ValueError):
        raise _error(422, "invalid_image", "image_b64 is not valid base64")


def create_app(
    settings: Settings | None = None,
    vision: Vision | None = None,
    budget: Budget | None = None,
    asker: Ask | None = None,
    asr_connect: AsrConnect | None = None,
    detector: Detector | None = None,
) -> FastAPI:
    settings = settings or load_settings()
    live = settings.vision_mode == "live"
    ask_live = settings.ask_mode == "live"
    detect_live = settings.detect_mode == "live"
    # One keep-alive Muse client shared by vision and Ask (built only when one of them is live).
    muse = default_client_factory(settings) if (live or ask_live) and settings.key_present else None
    vision = vision or (
        LiveVision(settings, client_factory=lambda s: muse)
        if live
        else MockVision(settings.mock_hold_calls, settings.mock_vision_delay_ms)
    )
    asker = asker or (LiveAsk(settings, client_factory=lambda s: muse) if ask_live else MockAsk())
    detector = detector or (
        LiveDetect(settings) if detect_live else MockDetect(settings.mock_hold_calls, settings.mock_detect_delay_ms)
    )
    asr_connect = asr_connect or default_asr_connect
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
        _valid_b64(req.image_b64)

        if live and budget.reached():
            raise _error(402, "budget_reached", f"live budget of ${settings.budget_usd:g} reached")

        try:
            result = vision.analyze(req.image_b64)
        except VisionError as exc:
            log.warning("live call failed: %s (%s)", exc.code, exc.message)
            if live and exc.usage and exc.usage.input_tokens is not None and exc.usage.output_tokens is not None:
                budget.add(cost_usd(settings.prices, exc.usage.input_tokens, exc.usage.cached_tokens or 0, exc.usage.output_tokens))
            raise _error(exc.status, exc.code, exc.message)

        cost = None
        if live and result.input_tokens is not None and result.output_tokens is not None:
            cost = cost_usd(settings.prices, result.input_tokens, result.cached_tokens or 0, result.output_tokens)
            budget.add(cost)

        side, side_source = resolve_side(result.answer)
        if live:
            # Brief 16b, for the next walk: Muse's own side next to the side its box gives (fields only; no image or
            # text). The app speaks the box side.
            a = result.answer
            log.info(
                "muse answer: hazard=%s model_side=%s box_side=%s distance_m=%s",
                a.hazard,
                a.side,
                side_of_box(a.box) if a.box else None,
                a.distance_m,
            )
        return AnalyzeResponse(
            **{**result.answer.model_dump(), "side": side},
            side_source=side_source,
            source=settings.vision_mode,
            model_ms=result.model_ms,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            cost_usd=cost,
        )

    @app.post("/api/detect", response_model=DetectResponse)
    def detect(req: DetectRequest) -> DetectResponse:
        """Fast warning: SAM 3.1 steps and kerb boxes -> kept hits (detect_rule.py), nearest first."""
        _valid_b64(req.image_b64)
        if detect_live and budget.reached():
            raise _error(402, "budget_reached", f"live budget of ${settings.budget_usd:g} reached")

        def billed(images: int) -> float | None:
            if not detect_live:
                return None
            cost = images * SAM_PRICE_PER_IMAGE
            budget.add(cost)
            return cost

        try:
            result = detector.detect(req.image_b64)
        except DetectFailed as exc:
            billed(exc.images_billed)
            log.warning("detect failed: %s (%s)", exc.code, exc.message)
            raise _error(exc.status, exc.code, exc.message)
        except VisionError as exc:
            raise _error(exc.status, exc.code, exc.message)
        return DetectResponse(
            hits=result.hits,
            found=result.found,
            beside=result.beside,
            source=settings.detect_mode,
            sam_ms=result.sam_ms,
            cost_usd=billed(result.images_billed),
        )

    @app.post("/api/ask", response_model=AskResponse)
    def ask(req: AskRequest) -> AskResponse:
        _valid_b64(req.image_b64)
        if ask_live and budget.reached():
            raise _error(402, "budget_reached", f"live budget of ${settings.budget_usd:g} reached")

        def billed(input_tokens: int | None, cached: int | None, output_tokens: int | None) -> float | None:
            if not ask_live or input_tokens is None or output_tokens is None:
                return None
            cost = cost_usd(settings.prices, input_tokens, cached or 0, output_tokens)
            budget.add(cost)
            return cost

        try:
            result = asker.ask(req.question, req.image_b64, req.last_warning, req.language)
        except EmptyAnswer as exc:
            billed(exc.result.input_tokens, exc.result.cached_tokens, exc.result.output_tokens)
            raise _error(502, "empty_answer", "the model returned no answer")
        except VisionError as exc:
            log.warning("ask failed: %s (%s)", exc.code, exc.message)
            if exc.usage:
                billed(exc.usage.input_tokens, exc.usage.cached_tokens, exc.usage.output_tokens)
            raise _error(exc.status, exc.code, exc.message)

        return AskResponse(
            question=req.question,
            answer=result.answer,
            source=settings.ask_mode,
            model_ms=result.model_ms,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            cost_usd=billed(result.input_tokens, result.cached_tokens, result.output_tokens),
        )

    @app.websocket("/api/listen")
    async def listen(ws: WebSocket) -> None:
        await run_listen(ws, settings, budget, asr_connect)

    return app


app = create_app()
