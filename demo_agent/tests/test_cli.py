import demo_agent.cli as cli


def test_parser_defaults():
    args = cli.build_parser().parse_args(["run"])
    assert args.scenario == "all"
    assert args.mode == "replay"
    assert args.export is False
    assert args.server_url == "http://localhost:8000"


def test_local_run_prints_summary(capsys):
    rc = cli.main(["run", "--scenario", "success", "--mode", "replay"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "success" in out
    assert "[ok]" in out or "OK" in out


def test_local_run_error_scenario_reports_error(capsys):
    rc = cli.main(["run", "--scenario", "error", "--mode", "replay"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "error" in out.lower()


def test_export_path_invokes_run_and_export(monkeypatch, capsys):
    called = {}

    def fake_run_and_export(keys, *, backend, server_url, project):
        called["keys"] = keys
        return ["t1", "t2", "t3"]

    monkeypatch.setattr(cli, "run_and_export", fake_run_and_export)
    rc = cli.main(["run", "--scenario", "all", "--export"])
    assert rc == 0
    assert called["keys"] == ["success", "error", "injection"]
    assert "3" in capsys.readouterr().out
