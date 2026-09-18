/** Dataset search tools: DSL/filter queries over domains and IPs, plus scrolling. */

import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { SecurityTrailsClient } from '../client.js';
import { READ_ONLY, safe } from '../result.js';
import { PageSchema } from '../schemas.js';

const REQUIRE_ONE = 'Provide either `filter` or `query`.';

export function registerSearchTools(server: McpServer, client: SecurityTrailsClient): void {
    server.registerTool(
        'securitytrails_search_domains',
        {
            title: 'Search domains',
            description:
                'Search the domain dataset by structured filter or DSL query. Supply `filter` for simple matches ' +
                '(keys include keyword, mx, ns, cname, ipv4, ipv6, apex_domain, whois_email) or `query` for the ' +
                'SecurityTrails DSL, e.g. "whois_email = \'admin@example.com\'". Exactly one of the two is required. ' +
                'For result sets beyond the first page, pass the response’s meta.scroll_id to securitytrails_scroll ' +
                'rather than paging — each page costs a query.',
            annotations: READ_ONLY,
            inputSchema: z
                .object({
                    filter: z
                        .record(z.string(), z.unknown())
                        .optional()
                        .describe('structured filter object, e.g. {"ipv4": "1.2.3.4"}'),
                    query: z.string().optional().describe('DSL query string, e.g. "ipv4 = \'1.2.3.4\'"'),
                    include_ips: z.boolean().default(false).describe('include resolved IPs for each domain'),
                    page: PageSchema
                })
                .refine(input => Boolean(input.filter) || Boolean(input.query), { message: REQUIRE_ONE })
        },
        safe(({ filter, query, include_ips, page }) =>
            client.request('/domains/list', {
                method: 'POST',
                query: { include_ips, page },
                body: { ...(filter ? { filter } : {}), ...(query ? { query } : {}) }
            })
        )
    );

    server.registerTool(
        'securitytrails_search_ips',
        {
            title: 'Search IPs',
            description:
                'Search the IP dataset by SecurityTrails DSL or structured filter, e.g. "ptr_part = \'example.com\'" ' +
                'or "open_port_80 = true". Exactly one of `query` or `filter` is required. Use securitytrails_scroll ' +
                'with the returned meta.scroll_id to page through large result sets.',
            annotations: READ_ONLY,
            inputSchema: z
                .object({
                    query: z.string().optional().describe('DSL query, e.g. "ptr_part = \'example.com\'"'),
                    filter: z.record(z.string(), z.unknown()).optional().describe('structured filter object'),
                    page: PageSchema
                })
                .refine(input => Boolean(input.filter) || Boolean(input.query), { message: REQUIRE_ONE })
        },
        safe(({ query, filter, page }) =>
            client.request('/ips/list', {
                method: 'POST',
                query: { page },
                body: { ...(query ? { query } : {}), ...(filter ? { filter } : {}) }
            })
        )
    );

    server.registerTool(
        'securitytrails_scroll',
        {
            title: 'Scroll search results',
            description:
                'Fetch the next batch of a large DSL search using the `meta.scroll_id` returned by a previous ' +
                'securitytrails_search_domains or securitytrails_search_ips response. Cheaper than re-issuing the ' +
                'search for each page.',
            annotations: READ_ONLY,
            inputSchema: z.object({
                scroll_id: z.string().min(1).describe('scroll id from a previous search response’s meta block')
            })
        },
        safe(({ scroll_id }) => client.request(`/scroll/${encodeURIComponent(scroll_id)}`))
    );
}
