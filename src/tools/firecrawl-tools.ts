import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

const DEFAULT_FIRECRAWL_BASE_URL = "https://api.firecrawl.dev";
const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 10;

const webSearchParameters = Type.Object({
  query: Type.String({ description: "Search query. Supports operators like site:, filetype:, intitle:, and quoted text." }),
  limit: Type.Optional(
    Type.Integer({
      description: "Maximum number of web results to return. Defaults to 5.",
      minimum: 1,
      maximum: MAX_SEARCH_LIMIT,
    }),
  ),
  include_domains: Type.Optional(
    Type.Array(Type.String(), { description: "Optional hostnames to restrict results to, without protocol." }),
  ),
  exclude_domains: Type.Optional(
    Type.Array(Type.String(), { description: "Optional hostnames to exclude, without protocol." }),
  ),
  country: Type.Optional(Type.String({ description: "Optional ISO country code for localized results, e.g. US, CN, JP." })),
  fetch_content: Type.Optional(
    Type.Boolean({
      description: "When true, ask Firecrawl to scrape markdown content for each search result.",
      default: false,
    }),
  ),
});

const webFetchParameters = Type.Object({
  url: Type.String({ description: "Absolute URL to fetch and convert to markdown." }),
  only_main_content: Type.Optional(
    Type.Boolean({
      description: "Return main page content only. Defaults to true.",
      default: true,
    }),
  ),
  timeout_ms: Type.Optional(
    Type.Integer({
      description: "Optional Firecrawl timeout in milliseconds.",
      minimum: 1000,
      maximum: 120000,
    }),
  ),
  max_age_ms: Type.Optional(
    Type.Integer({
      description: "Optional cache max age in milliseconds. Firecrawl may return cached content younger than this.",
      minimum: 0,
    }),
  ),
});

export interface FirecrawlToolsOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface WebSearchDetails {
  query: string;
  results: WebSearchResult[];
  creditsUsed?: number;
  warning?: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  description?: string;
  markdown?: string;
}

export interface WebFetchDetails {
  url: string;
  title?: string;
  description?: string;
  statusCode?: number;
  creditsUsed?: number;
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: {
    web?: Array<{
      title?: string;
      description?: string;
      url?: string;
      markdown?: string;
    }>;
  };
  warning?: string;
  creditsUsed?: number;
  error?: string;
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
      url?: string;
      statusCode?: number;
    };
  };
  creditsUsed?: number;
  error?: string;
}

export function createFirecrawlTools(options: FirecrawlToolsOptions): AgentTool[] {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_FIRECRAWL_BASE_URL);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  const searchTool: AgentTool<typeof webSearchParameters, WebSearchDetails> = {
    name: "web_search",
    label: "Web Search",
    description:
      "Search the live web using Firecrawl. Use this when the answer may need current information or source URLs.",
    parameters: webSearchParameters,
    async execute(_toolCallId, params, signal) {
      const query = params.query.trim();
      if (!query) {
        throw new Error("Search query is required");
      }
      if (params.include_domains?.length && params.exclude_domains?.length) {
        throw new Error("include_domains and exclude_domains cannot be used together");
      }

      const body: Record<string, unknown> = {
        query,
        limit: clampLimit(params.limit),
        sources: ["web"],
        ignoreInvalidURLs: true,
      };

      if (params.include_domains?.length) {
        body.includeDomains = params.include_domains;
      }
      if (params.exclude_domains?.length) {
        body.excludeDomains = params.exclude_domains;
      }
      if (params.country) {
        body.country = params.country;
      }
      if (params.fetch_content) {
        body.scrapeOptions = { formats: [{ type: "markdown" }], onlyMainContent: true };
      }

      const response = await postFirecrawl<FirecrawlSearchResponse>({
        apiKey: options.apiKey,
        fetchImpl,
        signal,
        url: `${baseUrl}/v2/search`,
        body,
      });
      const results = normalizeSearchResults(response.data?.web ?? []);

      return {
        content: [{ type: "text", text: formatSearchResults(query, results, response.warning) }],
        details: {
          query,
          results,
          creditsUsed: response.creditsUsed,
          warning: response.warning,
        },
      };
    },
  };

  const fetchTool: AgentTool<typeof webFetchParameters, WebFetchDetails> = {
    name: "web_fetch",
    label: "Web Fetch",
    description: "Fetch a URL with Firecrawl and return clean markdown plus page metadata.",
    parameters: webFetchParameters,
    async execute(_toolCallId, params, signal) {
      const url = params.url.trim();
      if (!url) {
        throw new Error("URL is required");
      }

      const body: Record<string, unknown> = {
        url,
        formats: ["markdown"],
        onlyMainContent: params.only_main_content ?? true,
      };

      if (params.timeout_ms !== undefined) {
        body.timeout = params.timeout_ms;
      }
      if (params.max_age_ms !== undefined) {
        body.maxAge = params.max_age_ms;
      }

      const response = await postFirecrawl<FirecrawlScrapeResponse>({
        apiKey: options.apiKey,
        fetchImpl,
        signal,
        url: `${baseUrl}/v2/scrape`,
        body,
      });
      const metadata = response.data?.metadata ?? {};
      const markdown = response.data?.markdown ?? "";

      return {
        content: [{ type: "text", text: formatFetchedPage(url, markdown, metadata) }],
        details: {
          url: metadata.sourceURL ?? metadata.url ?? url,
          title: metadata.title,
          description: metadata.description,
          statusCode: metadata.statusCode,
          creditsUsed: response.creditsUsed,
        },
      };
    },
  };

  return [searchTool, fetchTool];
}

async function postFirecrawl<T>(params: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  url: string;
  body: Record<string, unknown>;
}): Promise<T> {
  if (!params.apiKey) {
    throw new Error("FIRECRAWL_API_KEY is required to use web_search and web_fetch");
  }
  if (!params.fetchImpl) {
    throw new Error("No fetch implementation is available");
  }

  const response = await params.fetchImpl(params.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.body),
    signal: params.signal,
  });
  const payload = await readJson(response);
  const error = readFirecrawlError(payload);

  if (!response.ok || (isObject(payload) && payload.success === false)) {
    throw new Error(`Firecrawl request failed (${response.status}): ${error ?? response.statusText}`);
  }

  return payload as T;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function readFirecrawlError(payload: unknown): string | undefined {
  if (!isObject(payload)) {
    return undefined;
  }

  return typeof payload.error === "string" ? payload.error : undefined;
}

function normalizeSearchResults(results: NonNullable<FirecrawlSearchResponse["data"]>["web"]): WebSearchResult[] {
  return (results ?? [])
    .filter((result) => result.url)
    .map((result) => ({
      title: result.title || result.url || "Untitled",
      url: result.url ?? "",
      description: result.description,
      markdown: result.markdown,
    }));
}

function formatSearchResults(query: string, results: WebSearchResult[], warning: string | undefined): string {
  const lines = [`Search results for "${query}":`];

  if (results.length === 0) {
    lines.push("No results found.");
  }

  results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   URL: ${result.url}`);
    if (result.description) {
      lines.push(`   Description: ${result.description}`);
    }
    if (result.markdown) {
      lines.push(`   Content: ${truncate(result.markdown, 1200)}`);
    }
  });

  if (warning) {
    lines.push(`Warning: ${warning}`);
  }

  return lines.join("\n");
}

function formatFetchedPage(
  requestedUrl: string,
  markdown: string,
  metadata: NonNullable<FirecrawlScrapeResponse["data"]>["metadata"],
): string {
  const title = metadata?.title ?? "Untitled";
  const sourceUrl = metadata?.sourceURL ?? metadata?.url ?? requestedUrl;
  const lines = [`Title: ${title}`, `URL: ${sourceUrl}`];

  if (metadata?.description) {
    lines.push(`Description: ${metadata.description}`);
  }

  lines.push("", markdown || "(No markdown content returned.)");
  return lines.join("\n");
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_SEARCH_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
