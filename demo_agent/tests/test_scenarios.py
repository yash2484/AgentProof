import pytest
from demo_agent.scenarios import SCENARIOS, scenario_names


def test_three_scenarios_present():
    assert set(SCENARIOS) == {"success", "error", "injection"}


def test_initial_state_carries_question_and_scenario():
    s = SCENARIOS["success"]
    st = s.initial_state()
    assert st["scenario"] == "success"
    assert st["question"] == s.question


def test_scenario_names_all_is_ordered():
    assert scenario_names("all") == ["success", "error", "injection"]


def test_scenario_names_single():
    assert scenario_names("injection") == ["injection"]


def test_scenario_names_invalid_raises():
    with pytest.raises(ValueError):
        scenario_names("nope")
