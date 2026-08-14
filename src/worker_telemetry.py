"""Workers Logs adapter for structured Python workflow observations."""

from __future__ import annotations

from typing import Any

from deos.telemetry import Observation


def emit_observation(observation: Observation) -> None:
    """Send a real JavaScript object so Workers Logs indexes its fields."""
    from js import Object, console  # type: ignore[import-not-found]
    from pyodide.ffi import to_js  # type: ignore[import-not-found]

    js_observation: Any = to_js(observation, dict_converter=Object.fromEntries)
    if observation["deos.workflow.outcome"] == "failed":
        console.error(js_observation)
    else:
        console.log(js_observation)
