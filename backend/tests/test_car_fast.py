"""Brief 29: the fast car warning. SAM "car" -> the existing vehicle kind, the kerb in-path and distance rules,
behind CAR_FAST (env) with a per-request override (the phone's ?car=0 / ?car=1)."""

import httpx
import pytest

from app.config import CAR_CONCEPT, SAM_CONCEPTS, SAM_PRICE_PER_IMAGE, sam_concepts
from app.detect_rule import BESIDE, RawHit, keep

from .conftest import IMG
from .test_detect import FakeSam, live_detect_app, sam_stream

CAR_BOXES = {
    "stairs": "",
    "curb": "",
    "door": "",
    # a car close in front, in the walking path (portrait 360 x 640, box bottom 560 -> about 2.6 m)
    "car": "<0f>0<|box;x1=60;y1=380;x2=300;y2=559;w=360;h=640;c=0.93|>\n",
}


def car_sam():
    return FakeSam(lambda concept: httpx.Response(200, content=sam_stream(CAR_BOXES[concept])))


def test_mapping_car_is_the_existing_vehicle_kind():
    assert CAR_CONCEPT == {"vehicle": "car"}
    assert sam_concepts(False) == SAM_CONCEPTS
    assert sam_concepts(True) == {**SAM_CONCEPTS, "vehicle": "car"}
    assert SAM_CONCEPTS == {"steps": "stairs", "curb": "curb", "door": "door"}  # unchanged


def test_switch_off_by_default_no_car_request(make_settings):
    fake = car_sam()
    client, settings = live_detect_app(make_settings, fake)
    assert settings.car_fast is False
    body = client.post("/api/detect", json={"image_b64": IMG}).json()
    assert "car" not in [b["input"][0]["content"][0]["text"] for _, b in fake.requests]
    assert body["hits"] == [] and body["cost_usd"] == pytest.approx(len(SAM_CONCEPTS) * SAM_PRICE_PER_IMAGE)


def test_switch_on_by_env_warns_vehicle_with_metres_and_bills_one_more_image(make_settings):
    fake = car_sam()
    client, settings = live_detect_app(make_settings, fake, CAR_FAST="1")
    assert settings.car_fast is True
    body = client.post("/api/detect", json={"image_b64": IMG}).json()
    assert [(h["kind"], h["side"], h["distance"], h["distance_m"]) for h in body["hits"]] == [("vehicle", "ahead", "far", 3)]
    assert body["cost_usd"] == pytest.approx((len(SAM_CONCEPTS) + 1) * SAM_PRICE_PER_IMAGE)


@pytest.mark.parametrize(("env", "override", "asked"), [("0", True, True), ("1", False, False), ("0", None, False), ("1", None, True)])
def test_the_phone_can_override_the_switch(make_settings, env, override, asked):
    fake = car_sam()
    client, _ = live_detect_app(make_settings, fake, CAR_FAST=env)
    payload = {"image_b64": IMG} if override is None else {"image_b64": IMG, "car": override}
    assert client.post("/api/detect", json=payload).status_code == 200
    assert ("car" in [b["input"][0]["content"][0]["text"] for _, b in fake.requests]) is asked


def test_parked_car_beside_the_path_stays_quiet():
    # Brief 28 car-park photo: the nearest parked car at the right edge, box bottom 435 of 640 (portrait 480 x 640),
    # about 5.4 m and 1.6-3.3 m to the right: beside the walking path (+-0.75 m) -> counted, not warned.
    assert keep(RawHit("vehicle", 336, 151, 479, 435, 480, 640, 0.95)) == BESIDE


def test_car_close_in_front_warns_and_touching_the_bottom_is_very_close():
    hit = keep(RawHit("vehicle", 60, 380, 300, 559, 360, 640, 0.93))
    assert hit.kind == "vehicle" and hit.distance_m == 3
    near = keep(RawHit("vehicle", 40, 300, 320, 639, 360, 640, 0.9))
    assert near.kind == "vehicle" and near.distance == "near" and near.distance_m is None


def test_far_cars_above_the_horizon_are_dropped():
    assert keep(RawHit("vehicle", 278, 210, 319, 245, 640, 480, 0.91)) is None  # Brief 28 Kosice, far away
