"""Live speed test (Brief 4b): where does the model time go, and which lever cuts it.

Makes real Meta Model API calls. Run only when a brief allows it, with VISION_MODE=live set as an env var:

    VISION_MODE=live backend/.venv/bin/python backend/scripts/speed_test.py \
        --variant A --images a.jpg b.jpg --calls 3 --log speed.jsonl

Every call is streamed (time to first content token), costed through the Budget (spend.json stays honest) and
appended to --log. The script refuses to go past MAX_CALLS lines in that log, errors included. The key is never
printed. The app's defaults are not changed by anything here.
"""

import argparse
import base64
import json
import struct
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.budget import Budget, cost_usd  # noqa: E402
from app.config import VISION_PROMPT, load_settings  # noqa: E402
from app.schemas import resolve_side, vision_answer_json_schema  # noqa: E402
from app.vision import default_client_factory, parse_answer  # noqa: E402

MAX_CALLS = 20
MAX_COST_PER_FRAME = 0.005
OUTPUT_CAP = 150
PROMPT_LINE = "Answer straight away; do not think at length."

# Frame size is chosen by the image files passed in (D/E use the 320 px copies); `frame` is a label only.
VARIANTS = {
    "A": {"cap": None, "line": False, "frame": "640"},
    "B": {"cap": OUTPUT_CAP, "line": False, "frame": "640"},
    "C": {"cap": None, "line": True, "frame": "640"},
    "D": {"cap": None, "line": False, "frame": "320"},
}


ESTIMATE_INPUT_TOKENS = 600  # above every input seen (563 at 640 px, 573 with the prompt line)
ESTIMATE_OUTPUT_TOKENS = 600  # above every uncapped output seen (156-484)


def estimated_cost(settings, cap: int | None) -> float:
    """Upper-bound cost for a call that returned no usage: no cache, full output cap."""
    return cost_usd(settings.prices, ESTIMATE_INPUT_TOKENS, 0, cap or ESTIMATE_OUTPUT_TOKENS)


def jpeg_size(data: bytes) -> tuple[int, int]:
    """Width, height from the first SOF marker."""
    i = 2
    while i < len(data):
        marker, length = data[i + 1], struct.unpack(">H", data[i + 2 : i + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", data[i + 5 : i + 9])
            return w, h
        i += 2 + length
    return 0, 0


def one_call(client, settings, image: Path, cap: int | None, line: bool, stream: bool) -> dict:
    data = image.read_bytes()
    prompt = f"{VISION_PROMPT} {PROMPT_LINE}" if line else VISION_PROMPT
    kwargs = {
        "model": settings.vision_model,
        "reasoning_effort": settings.reasoning_effort,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64.b64encode(data).decode()}"}},
                ],
            }
        ],
        "response_format": {"type": "json_schema", "json_schema": {"name": "vision_answer", "schema": vision_answer_json_schema()}},
    }
    if cap:
        kwargs["max_completion_tokens"] = cap

    started = time.perf_counter()
    first_chunk_ms = first_content_ms = None
    content, finish_reason, usage = "", None, None
    if stream:
        for chunk in client.chat.completions.create(**kwargs, stream=True, stream_options={"include_usage": True}):
            now = (time.perf_counter() - started) * 1000
            first_chunk_ms = first_chunk_ms or now
            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    first_content_ms = first_content_ms or now
                    content += delta.content
                finish_reason = chunk.choices[0].finish_reason or finish_reason
            if chunk.usage:
                usage = chunk.usage
    else:
        response = client.chat.completions.create(**kwargs)
        content = response.choices[0].message.content or ""
        finish_reason = response.choices[0].finish_reason
        usage = response.usage
    total_ms = (time.perf_counter() - started) * 1000

    answer, reason = parse_answer(content)
    side, side_source = resolve_side(answer)
    cached = getattr(getattr(usage, "prompt_tokens_details", None), "cached_tokens", 0) or 0 if usage else 0
    reasoning = getattr(getattr(usage, "completion_tokens_details", None), "reasoning_tokens", None) if usage else None
    return {
        "image": image.name,
        "frame_px": jpeg_size(data),
        "jpeg_bytes": len(data),
        "streamed": stream,
        "model_ms": round(total_ms),
        "first_chunk_ms": first_chunk_ms and round(first_chunk_ms),
        "ttft_ms": first_content_ms and round(first_content_ms),
        "input_tokens": usage.prompt_tokens if usage else None,
        "cached_tokens": cached,
        "output_tokens": usage.completion_tokens if usage else None,
        "reasoning_tokens": reasoning,
        "finish_reason": finish_reason,
        "parsed": reason is None,
        "parse_problem": reason,
        "hazard": answer.hazard,
        "side": side,
        "side_source": side_source,
        "distance": answer.distance,
        "box": answer.box,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", required=True, help="A-D, or E with --cap/--line set explicitly")
    ap.add_argument("--images", nargs="+", required=True, type=Path, help="used in turn")
    ap.add_argument("--calls", type=int, default=3)
    ap.add_argument("--log", required=True, type=Path)
    ap.add_argument("--cap", type=int, default=None, help="override: max_completion_tokens")
    ap.add_argument("--line", action="store_true", help="override: add the prompt line")
    ap.add_argument("--no-stream", action="store_true")
    args = ap.parse_args()

    v = VARIANTS.get(args.variant, {"cap": None, "line": False, "frame": "?"})
    cap = args.cap if args.cap is not None else v["cap"]
    line = args.line or v["line"]

    settings = load_settings()
    if settings.vision_mode != "live" or not settings.key_present:
        print("needs VISION_MODE=live and MODEL_API_KEY in backend/.env")
        return 2
    budget = Budget(settings.spend_file, settings.budget_usd)
    client = default_client_factory(settings)
    key = settings.model_api_key or ""

    for n in range(args.calls):
        done = len(args.log.read_text().splitlines()) if args.log.exists() else 0
        if done >= MAX_CALLS:
            print(f"STOP: {MAX_CALLS} calls already logged")
            return 1
        if budget.reached():
            print("STOP: budget reached")
            return 1
        image = args.images[n % len(args.images)]
        row = {"call": done + 1, "variant": args.variant, "cap": cap, "line": line}
        try:
            row |= one_call(client, settings, image, cap, line, stream=not args.no_stream)
        except Exception as exc:  # report and stop; never print the key
            body = getattr(exc, "body", None)
            row |= {"image": image.name, "error": type(exc).__name__, "status": getattr(exc, "status_code", None),
                    "detail": json.dumps(body).replace(key, "<KEY>") if body else str(exc).replace(key, "<KEY>")}
            with args.log.open("a") as f:
                f.write(json.dumps(row) + "\n")
            print(json.dumps(row))
            return 1
        if row["input_tokens"] is not None and row["output_tokens"] is not None:
            row["cost_usd"] = cost_usd(settings.prices, row["input_tokens"], row["cached_tokens"], row["output_tokens"])
        else:
            # The API sent no usage (seen when the output cap cut the answer). Count an upper bound instead.
            row["cost_usd"] = estimated_cost(settings, cap)
            row["cost_estimated"] = True
        budget.add(row["cost_usd"])
        with args.log.open("a") as f:
            f.write(json.dumps(row) + "\n")
        print(json.dumps(row), flush=True)
        if (row.get("cost_usd") or 0) > MAX_COST_PER_FRAME:
            print(f"STOP: frame cost above ${MAX_COST_PER_FRAME}")
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
