# securitytrails-mcp

[![npm](https://img.shields.io/npm/v/securitytrails-mcp.svg)](https://www.npmjs.com/package/securitytrails-mcp)
[![CI](https://github.com/aqhmal/securitytrails-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/aqhmal/securitytrails-mcp/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/securitytrails-mcp.svg)](./LICENSE)

An [MCP](https://modelcontextprotocol.io) server that gives an LLM agent the
[SecurityTrails](https://securitytrails.com) API: DNS history, subdomain enumeration, WHOIS
(current and historical), SSL certificates, and IPv4 intelligence — 17 read-only tools.

Built for reconnaissance work where the interesting question is usually *"what did this look like
before the CDN went up?"* rather than *"what does it resolve to now?"*.

## Quickstart

You need a SecurityTrails API key — the free tier is enough to try it.
Get one at [securitytrails.com/app/account/credentials](https://securitytrails.com/app/account/credentials).

### Claude Code

```sh
claude mcp add securitytrails --env SECURITYTRAILS_API_KEY=your_key -- npx -y securitytrails-mcp
```

### Claude Desktop, Cursor, VS Code, and other MCP hosts

Add the server to your host's MCP config:

```json
{
  "mcpServers": {
    "securitytrails": {
      "command": "npx",
      "args": ["-y", "securitytrails-mcp"],
      "env": {
        "SECURITYTRAILS_API_KEY": "your_key"
      }
    }
  }
}
```

Config file locations: Claude Desktop uses `claude_desktop_config.json`
(`~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows);
Cursor uses `~/.cursor/mcp.json`; VS Code uses `.vscode/mcp.json` in the workspace.

## Tools

Every tool is read-only and costs **one SecurityTrails API query per call** unless noted.

| Tool | What it does |
| --- | --- |
| `securitytrails_ping` | Check the API key is accepted |
| `securitytrails_usage` | Month-to-date consumption, allowance, and remaining quota |
| `securitytrails_domain_details` | Current DNS records, hostname counts, registrar metadata |
| `securitytrails_subdomains` | Known subdomains, returned as fully-qualified hostnames |
| `securitytrails_associated` | Domains sharing registrant details or infrastructure |
| `securitytrails_dns_history` | Historical A/AAAA/MX/NS/SOA/TXT records with observation dates |
| `securitytrails_whois_current` | Current WHOIS record |
| `securitytrails_whois_history` | Past WHOIS records — often pre-redaction |
| `securitytrails_ssl` | Certificates issued for a hostname, including SAN entries |
| `securitytrails_tags` | SecurityTrails classification tags |
| `securitytrails_ip_neighbors` | Adjacent IPv4 addresses and their hostname counts |
| `securitytrails_ip_whois` | Network block registration, owner, abuse contacts |
| `securitytrails_ip_useragents` | User agents observed originating from an IPv4 address |
| `securitytrails_company_associated_ips` | IP ranges attributed to a domain's owning organisation |
| `securitytrails_search_domains` | Search the domain dataset by filter object or DSL query |
| `securitytrails_search_ips` | Search the IP dataset by filter object or DSL query |
| `securitytrails_scroll` | Page a large search result via its `meta.scroll_id` |

### Notes on quota

SecurityTrails bills per API query, and plans are metered monthly. Two things are worth knowing
before pointing an agent at a large target:

- `securitytrails_subdomains` costs **one** query no matter how many hostnames come back. It is
  the cheapest way to enumerate a large apex.
- `securitytrails_search_domains` and `securitytrails_search_ips` cost **one query per page**. For
  large result sets use `securitytrails_scroll` with the returned `meta.scroll_id` instead of
  incrementing `page`.

Large subdomain results are capped at `limit` (default 500) so a single call cannot flood the
model's context. The response always reports the true `total` and sets `truncated`, so the agent
can decide to ask for more rather than silently receiving a partial answer.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECURITYTRAILS_API_KEY` | *(required)* | Your API key |
| `SECURITYTRAILS_TIMEOUT_MS` | `30000` | Per-attempt request timeout |
| `SECURITYTRAILS_MAX_RETRIES` | `2` | Retries on 429/5xx/network errors, with exponential backoff |

If the key is missing the server still starts and still lists its tools, so the host shows the
server as healthy; each tool call then returns an error naming the variable to set. This is
deliberate — a server that exits on startup shows up in most hosts as an unexplained crash.

## Development

```sh
git clone https://github.com/aqhmal/securitytrails-mcp.git
cd securitytrails-mcp
npm install
npm test          # 28 tests, no API key needed — HTTP layer is stubbed
npm run build
npm run inspect   # build, then open the MCP Inspector against the server
```

The test suite drives a real MCP `Client` against the server in-process over a stubbed
transport, so tool schemas, validation and error handling are exercised through the actual
protocol rather than by calling handlers directly.

## Security

This is a reconnaissance tool. Only use it against infrastructure you are authorised to
investigate. Please don't put your API key in a committed config file — every host above reads
it from the environment for a reason.

To report a vulnerability in this server, see [SECURITY.md](./SECURITY.md).

## License

MIT © [aqhmal](https://github.com/aqhmal)

Not affiliated with or endorsed by SecurityTrails / Recorded Future.
