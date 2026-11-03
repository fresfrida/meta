"""Second Eyes backend: one frame in, one structured obstacle answer out."""

import base64
import binascii
import logging

from fastapi import FastAPI, HTTPException

from fastapi import WebSocket

from .ask import Ask, EmptyAnswer, LiveAsk, MockAsk
from .budget import Budget, cost_usd
from .config import Settings, load_settings
from .listen import AsrConnect, default_asr_connect, run_listen
from .schemas import AnalyzeRequest, AnalyzeResponse, AskRequest, AskResponse, ErrorDetail, HealthResponse, resolve_side
from .vision import LiveVision, MockVision, Vision, VisionError

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
) -> FastAPI:
    settings = settings or load_settings()
    live = settings.vision_mode == "live"
    vision = vision or (LiveVision(settings) if live else MockVision(settings.mock_hold_calls))
    ask_live = settings.ask_mode == "live"
    asker = asker or (LiveAsk(settings) if ask_live else MockAsk())
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
            raise _error(exc.status, exc.code, exc.message)

        cost = None
        if live and result.input_tokens is not None and result.output_tokens is not None:
            cost = cost_usd(settings.prices, result.input_tokens, result.cached_tokens or 0, result.output_tokens)
            budget.add(cost)

        side, side_source = resolve_side(result.answer)
        return AnalyzeResponse(
            **{**result.answer.model_dump(), "side": side},
            side_source=side_source,
            source=settings.vision_mode,
            model_ms=result.model_ms,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            cost_usd=cost,
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
