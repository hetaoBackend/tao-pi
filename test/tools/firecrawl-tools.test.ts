import { describe, expect, it } from "vitest";
import { createFirecrawlTools } from "../../src/tools/firecrawl-tools.js";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function firstText(result: Awaited<ReturnType<NonNullable<ReturnType<typeof createFirecrawlTools>[number]["execute"]>>>): string {
  const content = result.content[0];
  if (content?.type !== "text") {
    throw new Error("Expected first content block to be text");
  }

  return content.text;
}

function createMockFetch(body: unknown, status = 200): {
  calls: FetchCall[];
  fetch: typeof fetch;
} {
  const calls: FetchCall[] = [];

  return {
    calls,
    fetch: (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  };
}

describe("createFirecrawlTools", () => {
  it("creates web_search and web_fetch tools", () => {
    expect(createFirecrawlTools({ apiKey: "fc-test" }).map((tool) => tool.name)).toEqual([
      "web_search",
      "web_fetch",
    ]);
  });

  it("searches the web through Firecrawl v2 search", async () => {
    const mock = createMockFetch({
      success: true,
      data: {
        web: [
          {
            title: "Firecrawl Docs",
            description: "Search and scrape docs",
            url: "https://docs.firecrawl.dev",
          },
          {
            title: "Firecrawl",
            description: "The web data API",
            url: "https://www.firecrawl.dev",
          },
        ],
      },
      creditsUsed: 1,
    });
    const searchTool = createFirecrawlTools({
      apiKey: "fc-test",
      baseUrl: "https://firecrawl.example",
      fetch: mock.fetch,
    }).find((tool) => tool.name === "web_search");

    const result = await searchTool?.execute("call-1", {
      query: "firecrawl",
      limit: 2,
      include_domains: ["docs.firecrawl.dev"],
      fetch_content: true,
    });

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.url).toBe("https://firecrawl.example/v2/search");
    expect(mock.calls[0]?.init?.method).toBe("POST");
    expect(mock.calls[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer fc-test",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(mock.calls[0]?.init?.body))).toEqual({
      query: "firecrawl",
      limit: 2,
      sources: ["web"],
      ignoreInvalidURLs: true,
      includeDomains: ["docs.firecrawl.dev"],
      scrapeOptions: { formats: [{ type: "markdown" }], onlyMainContent: true },
    });
    expect(result ? firstText(result) : "").toContain('Search results for "firecrawl"');
    expect(result ? firstText(result) : "").toContain("1. Firecrawl Docs");
    expect(result ? firstText(result) : "").toContain("https://docs.firecrawl.dev");
    expect(result?.details).toMatchObject({
      query: "firecrawl",
      creditsUsed: 1,
    });
    expect(result?.details.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Firecrawl Docs", url: "https://docs.firecrawl.dev" })]),
    );
  });

  it("fetches a URL through Firecrawl v2 scrape", async () => {
    const mock = createMockFetch({
      success: true,
      data: {
        markdown: "# Example\n\nHello web.",
        metadata: {
          title: "Example",
          description: "Example site",
          sourceURL: "https://example.com",
          statusCode: 200,
        },
      },
      creditsUsed: 1,
    });
    const fetchTool = createFirecrawlTools({
      apiKey: "fc-test",
      baseUrl: "https://firecrawl.example/",
      fetch: mock.fetch,
    }).find((tool) => tool.name === "web_fetch");

    const result = await fetchTool?.execute("call-1", {
      url: "https://example.com",
      only_main_content: false,
      timeout_ms: 30000,
    });

    expect(mock.calls[0]?.url).toBe("https://firecrawl.example/v2/scrape");
    expect(JSON.parse(String(mock.calls[0]?.init?.body))).toEqual({
      url: "https://example.com",
      formats: ["markdown"],
      onlyMainContent: false,
      timeout: 30000,
    });
    expect(result ? firstText(result) : "").toContain("Title: Example");
    expect(result ? firstText(result) : "").toContain("# Example");
    expect(result?.details).toMatchObject({
      url: "https://example.com",
      title: "Example",
      statusCode: 200,
      creditsUsed: 1,
    });
  });

  it("throws a clear error when the Firecrawl API key is missing", async () => {
    const searchTool = createFirecrawlTools({ apiKey: undefined }).find((tool) => tool.name === "web_search");

    await expect(searchTool?.execute("call-1", { query: "anything" })).rejects.toThrow(
      "FIRECRAWL_API_KEY is required",
    );
  });

  it("rejects mutually exclusive search domain filters before calling Firecrawl", async () => {
    const mock = createMockFetch({ success: true, data: { web: [] } });
    const searchTool = createFirecrawlTools({ apiKey: "fc-test", fetch: mock.fetch }).find(
      (tool) => tool.name === "web_search",
    );

    await expect(
      searchTool?.execute("call-1", {
        query: "anything",
        include_domains: ["docs.firecrawl.dev"],
        exclude_domains: ["example.com"],
      }),
    ).rejects.toThrow("include_domains and exclude_domains cannot be used together");
    expect(mock.calls).toHaveLength(0);
  });

  it("surfaces Firecrawl error responses", async () => {
    const mock = createMockFetch({ success: false, error: "rate limit exceeded" }, 429);
    const fetchTool = createFirecrawlTools({ apiKey: "fc-test", fetch: mock.fetch }).find(
      (tool) => tool.name === "web_fetch",
    );

    await expect(fetchTool?.execute("call-1", { url: "https://example.com" })).rejects.toThrow(
      "Firecrawl request failed (429): rate limit exceeded",
    );
  });
});
