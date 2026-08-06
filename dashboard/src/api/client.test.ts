import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listTraces, runEval, deleteTrace, getEvalSummary, ApiError } from "./client";

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch({ traces: [], total: 0, limit: 50, offset: 0 }));
});
afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("builds a query string from filters", async () => {
    await listTraces({ project: "demo", status: "error", limit: 10 });
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/traces?");
    expect(url).toContain("project=demo");
    expect(url).toContain("status=error");
    expect(url).toContain("limit=10");
  });

  it("omits undefined params", async () => {
    await listTraces({ project: "demo" });
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain("status=");
  });

  it("POSTs run-eval with trace_id", async () => {
    vi.stubGlobal("fetch", mockFetch({ results: [] }));
    await runEval("tr-1");
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/evals/run");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ trace_id: "tr-1" });
  });

  it("DELETE resolves on 204", async () => {
    vi.stubGlobal("fetch", mockFetch(null, true, 204));
    await expect(deleteTrace("tr-1")).resolves.toBeUndefined();
  });

  it("throws ApiError on non-ok", async () => {
    vi.stubGlobal("fetch", mockFetch({ detail: "boom" }, false, 500));
    await expect(listTraces()).rejects.toBeInstanceOf(ApiError);
  });

  it("GETs the eval summary with the project filter", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        project: "demo",
        trace_count: 3,
        overall_pass_rate: 0.5,
        p99_latency_ms: 1200,
        metrics: [],
      }),
    );
    const summary = await getEvalSummary({ project: "demo" });
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/evals/summary?");
    expect(url).toContain("project=demo");
    expect(summary.trace_count).toBe(3);
  });

  it("omits the project param when asking for all projects", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        project: null,
        trace_count: 0,
        overall_pass_rate: null,
        p99_latency_ms: null,
        metrics: [],
      }),
    );
    await getEvalSummary({});
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain("project=");
  });
});
