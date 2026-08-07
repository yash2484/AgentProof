import pytest
from demo_agent.scenarios import SCENARIOS, scenario_names


def test_scenario_set_is_large_enough_for_the_t_test():
    """At least min_sample_size (9) scenarios, or the detector's t-test path
    never runs against a baseline built from this agent."""
    assert len(SCENARIOS) >= 9
    # The two behavioural scenarios must survive any future edit: `error` makes
    # the retriever fail, `injection` serves a poisoned document.
    assert {"success", "error", "injection"} <= set(SCENARIOS)


def test_initial_state_carries_question_and_scenario():
    s = SCENARIOS["success"]
    st = s.initial_state()
    assert st["scenario"] == "success"
    assert st["question"] == s.question


def test_scenario_names_all_is_ordered_and_complete():
    names = scenario_names("all")
    assert names == list(SCENARIOS)  # deterministic order, every scenario
    assert names[:3] == ["success", "error", "injection"]


def test_scenario_names_single():
    assert scenario_names("injection") == ["injection"]


def test_scenario_names_invalid_raises():
    with pytest.raises(ValueError):
        scenario_names("nope")
