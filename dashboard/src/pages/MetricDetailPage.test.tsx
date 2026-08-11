import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { MetricDetailPage, renderEmphasis } from "./MetricDetailPage";
import type { MetricDetail } from "../types";

const detail: MetricDetail = {
  metric_name: "faithfulness",
  metric_type: "llm_judge",
  group: "quality",
  ci_block: true,
  project: "demo",
  days: 0,
  health: {
    mean_score: 0.856,
    std: 0.142,
    pass_rate: 0.826,
    threshold: 0.7,
    count: 92,
    failed: 16,
    degraded: 2,
    has_variance: true,
  },
  buckets: [
    { bucket: 0.3, count: 2 },
    { bucket: 0.9, count: 74 },
  ],
  runs: [
    { run_at: "2026-03-02T00:00:00.000Z", mean_score: 0.941, count: 34, failed: 1 },
    { run_at: "2026-08-09T00:00:00.000Z", mean_score: 0.786, count: 33, failed: 9 },
  ],
  worst: [
    {
      trace_id: "tr-lowest",
      span_id: "sp-1",
      score: 0.35,
      passed: false,
      evaluated_at: "2026-08-09T00:00:00.000Z",
      explanation: "faithfulness: min of 1 judged span = 0.350",
      reasoning: [
        { span_id: "sp-1", score: 0.35, reasoning: "The claim is absent from the context." },
      ],
    },
  ],
};

let searchParams = new URLSearchParams();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useParams: () => ({ metric: "faithfulness" }),
    useSearchParams: () => [searchParams, vi.fn()],
  };
});

const useMetricDetail = vi.fn();
vi.mock("../hooks/queries", () => ({
  useMetricDetail: (...args: unknown[]) => useMetricDetail(...args),
}));

beforeEach(() => {
  searchParams = new URLSearchParams();
  useMetricDetail.mockReturnValue({
    data: detail,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe("renderEmphasis", () => {
  it("renders the judge's bold markers as emphasis, not as asterisks", () => {
    const parts = renderEmphasis("The **orchestration claim** is unsupported.");

    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("The ");
    expect(parts[2]).toBe(" is unsupported.");
  });

  it("leaves plain prose alone", () => {
    expect(renderEmphasis("No markup here.")).toEqual(["No markup here."]);
  });

  it("keeps every fragment as text, so a model cannot inject markup", () => {
    const parts = renderEmphasis("<script>alert(1)</script> and **bold**");

    expect(parts[0]).toBe("<script>alert(1)</script> and ");
  });
});

describe("MetricDetailPage", () => {
  it("explains what the metric measures before showing any number", () => {
    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("metric-measures")).toHaveTextContent(
      /supported by the context/i,
    );
  });

  it("states the actual mechanism, so the number can be argued with", () => {
    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("metric-computed")).toHaveTextContent(/worst span|min/i);
  });

  it("names the failure the metric catches", () => {
    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("metric-matters")).toHaveTextContent(/fabricat/i);
  });

  it("carries the distribution, not only the mean", () => {
    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("metric-distribution")).toBeInTheDocument();
  });

  it("shows the judge's own reasoning, which lives nowhere else in the product", () => {
    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("worst-row-tr-lowest")).toHaveTextContent(
      "The claim is absent from the context.",
    );
  });

  it("links each worst row back into its trace", () => {
    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("worst-link-tr-lowest")).toHaveAttribute(
      "href",
      "/traces/tr-lowest",
    );
  });

  it("says whether the metric blocks CI, since that is what a failure costs", () => {
    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("metric-ci-block")).toHaveTextContent(/blocks CI/i);
  });

  it("reports a missing metric as missing rather than as an empty page", () => {
    useMetricDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("404"),
      refetch: vi.fn(),
    });

    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("metric-detail-error")).toBeInTheDocument();
  });

  it("marks a judged metric's numbers with the judge swing", () => {
    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("metric-detail")).toHaveTextContent("±0.2");
  });

  // -------------------------------------------------------------------------
  // Scope — the bug the live render found
  // -------------------------------------------------------------------------
  //
  // ProjectContext is in-memory. A link opened in a fresh tab lost the project
  // and fell back to every project, pooling the generated corpus into a real
  // one's figures: a tile reading "2 of 27" opened a page reading 321.

  it("takes its scope from the URL, not from in-memory context", () => {
    searchParams = new URLSearchParams("project=demo-research-agent&days=90");

    renderWithProviders(<MetricDetailPage />);

    expect(useMetricDetail).toHaveBeenCalledWith(
      "faithfulness",
      "demo-research-agent",
      90,
    );
  });

  it("states the scope on the page, so the figures cannot be misread", () => {
    searchParams = new URLSearchParams("project=demo-research-agent&days=90");

    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("metric-scope")).toHaveTextContent(
      "demo-research-agent",
    );
    expect(screen.getByTestId("metric-scope")).toHaveTextContent("last 90 days");
  });

  it("says an unscoped view covers measured projects only", () => {
    // This used to warn that "all projects" pooled a generated corpus, which
    // was true and is now false: the server excludes generated corpora from an
    // unscoped query, so the pooled figure cannot be produced at all. Copy
    // that describes a fixed defect is its own kind of lie.
    renderWithProviders(<MetricDetailPage />, { project: null });

    const scope = screen.getByTestId("metric-scope");
    expect(scope).toHaveTextContent(/all measured projects/i);
    expect(scope).not.toHaveTextContent(/generated/i);
  });

  it("marks a generated project on the detail page too", () => {
    searchParams = new URLSearchParams("project=synthetic-showcase&days=0");

    renderWithProviders(<MetricDetailPage />);

    expect(screen.getByTestId("synthetic-badge")).toBeInTheDocument();
    expect(screen.getByTestId("metric-scope")).toHaveTextContent("all history");
  });

  it("counts degraded measurements separately from failures", () => {
    renderWithProviders(<MetricDetailPage />);

    const health = screen.getByTestId("metric-health-figures");
    expect(health).toHaveTextContent("16");
    expect(health).toHaveTextContent("2");
  });
});
