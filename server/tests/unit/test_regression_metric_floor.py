"""A metric may set its own practical-significance floor.

Noise is a property of the metric. Measured across two evaluations of a
byte-identical corpus, faithfulness moved with a per-scenario sd of 0.034 and
relevance with 0.144. One global floor cannot sit above the second without
being far above anything worth catching in the first.
"""

from __future__ import annotations

from agentproof_server.eval_engine.config_parser import load_config


def test_metric_floor_defaults_to_unset(tmp_path):
    cfg = tmp_path / "c.yaml"
    cfg.write_text(
        "project: p\nmetrics:\n"
        "  - name: faithfulness\n    type: llm_judge\n    applies_to: llm_call\n"
        "    rubric: r\n",
        encoding="utf-8",
    )
    assert load_config(str(cfg)).metrics[0].min_mean_drop is None


def test_metric_floor_is_parsed_when_declared(tmp_path):
    cfg = tmp_path / "c.yaml"
    cfg.write_text(
        "project: p\nmetrics:\n"
        "  - name: relevance\n    type: llm_judge\n    applies_to: llm_call\n"
        "    rubric: r\n    min_mean_drop: 0.15\n",
        encoding="utf-8",
    )
    assert load_config(str(cfg)).metrics[0].min_mean_drop == 0.15


def test_the_shipped_judged_config_floors_relevance_above_its_noise():
    """Guards the measurement, not the number.

    Three sigma of spurious relevance movement is 0.120. If someone lowers this
    floor toward the global 0.05, the metric starts reporting regressions the
    judge invented, and this fails first.
    """
    metrics = {m.name: m for m in load_config("../fixtures/regression_config_judged.yaml").metrics}
    assert metrics["relevance"].min_mean_drop is not None
    assert metrics["relevance"].min_mean_drop >= 0.12, (
        "relevance's floor must stay above the 0.120 three-sigma noise measured "
        "between two evaluations of an identical corpus"
    )
    # faithfulness is quiet enough (sd 0.034) to run on the global floor.
    assert metrics["faithfulness"].min_mean_drop is None
