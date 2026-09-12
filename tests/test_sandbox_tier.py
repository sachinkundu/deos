import pytest

from deos.ingress import event_start_slow_ok


@pytest.mark.parametrize("labels", [None, {}, [], [None], [{"name": "Slow-Ok"}], [{"name": "slow-ok "}], [{"name": " slow-ok"}]])
def test_no_exact_positive_evidence(labels: object):
    assert event_start_slow_ok({"labels": labels}) is None


def test_exact_provider_label():
    assert event_start_slow_ok({"labels": [{"id": "label", "name": "slow-ok"}]}) is True
