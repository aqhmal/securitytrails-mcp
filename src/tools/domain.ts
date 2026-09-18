/** Domain-oriented tools: records, subdomains, WHOIS, certificates, history. */

import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { SecurityTrailsClient } from '../client.js';
import { READ_ONLY, safe, safeStructured } from '../result.js';
import { DomainSchema, PageSchema, normalizeHost } from '../schemas.js';

/** Default cap on returned subdomains; a large apex can hold tens of thousands. */
const SUBDOMAIN_LIMIT_DEFAULT = 500;
const SUBDOMAIN_LIMIT_MAX = 10_000;

interface SubdomainsResponse {
    subdomains?: string[];
    subdomain_count?: number;
}

export function registerDomainTools(server: McpServer, client: SecurityTrailsClient): void {
    server.registerTool(
        'securitytrails_domain_details',
        {
            title: 'Domain details',
            description:
                'Fetch the current DNS records (A, AAAA, MX, NS, SOA, TXT), hostname counts and registrar metadata ' +
                'for one domain. The best first call when profiling an unfamiliar domain.',
            annotations: READ_ONLY,
            inputSchema: z.object({
                domain: DomainSchema.describe('apex domain or hostname, e.g. example.com')
            })
        },
        safe(({ domain }) => client.request(`/domain/${normalizeHost(domain)}`))
    );

    server.registerTool(
        'securitytrails_subdomains',
        {
            title: 'Enumerate subdomains',
            description:
                'List known subdomains of a domain. Returns fully-qualified hostnames (the labels are already joined ' +
                'to the apex) ready to feed into resolution or scanning. Large apexes are truncated to `limit`; the ' +
                'result reports the true total so you can raise the limit deliberately. Costs one API query regardless ' +
                'of how many hostnames come back.',
            annotations: READ_ONLY,
            inputSchema: z.object({
                domain: DomainSchema.describe('apex domain, e.g. example.com'),
                children_only: z
                    .boolean()
                    .default(false)
                    .describe('only direct children (one label deep) rather than the full tree'),
                include_inactive: z
                    .boolean()
                    .default(true)
                    .describe('include subdomains with no current DNS resolution'),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(SUBDOMAIN_LIMIT_MAX)
                    .default(SUBDOMAIN_LIMIT_DEFAULT)
                    .describe(`maximum hostnames to return (default ${SUBDOMAIN_LIMIT_DEFAULT})`)
            }),
            outputSchema: z.object({
                apex: z.string(),
                hostnames: z.array(z.string()).describe('fully-qualified hostnames'),
                returned: z.number(),
                total: z.number().describe('total subdomains SecurityTrails holds for this apex'),
                truncated: z.boolean(),
                note: z.string().optional()
            })
        },
        safeStructured(async ({ domain, children_only, include_inactive, limit }) => {
            const apex = domain.trim().toLowerCase();
            const data = await client.request<SubdomainsResponse>(`/domain/${normalizeHost(domain)}/subdomains`, {
                query: { children_only, include_inactive }
            });

            const labels = data.subdomains ?? [];
            const total = data.subdomain_count ?? labels.length;
            const kept = labels.slice(0, limit);
            const truncated = labels.length > kept.length;

            return {
                apex,
                hostnames: kept.map(label => `${label}.${apex}`),
                returned: kept.length,
                total,
                truncated,
                ...(truncated
                    ? { note: `Showing ${kept.length} of ${labels.length} hostnames. Re-run with a higher \`limit\` to see more.` }
                    : {})
            };
        })
    );

    server.registerTool(
        'securitytrails_associated',
        {
            title: 'Associated domains',
            description:
                'Find other domains associated with this one through shared registrant details or infrastructure. ' +
                'Useful for expanding scope from a single known domain to an organisation’s wider estate.',
            annotations: READ_ONLY,
            inputSchema: z.object({
                domain: DomainSchema.describe('apex domain'),
                page: PageSchema
            })
        },
        safe(({ domain, page }) => client.request(`/domain/${normalizeHost(domain)}/associated`, { query: { page } }))
    );

    server.registerTool(
        'securitytrails_dns_history',
        {
            title: 'Historical DNS records',
            description:
                'Retrieve historical values of one DNS record type for a domain, with the date range each value was ' +
                'observed. The primary tool for spotting infrastructure migrations and origin IPs that predate a CDN.',
            annotations: READ_ONLY,
            inputSchema: z.object({
                domain: DomainSchema.describe('apex domain or hostname'),
                type: z
                    .enum(['a', 'aaaa', 'mx', 'ns', 'soa', 'txt'])
                    .describe('DNS record type to retrieve history for'),
                page: PageSchema
            })
        },
        safe(({ domain, type, page }) =>
            client.request(`/history/${normalizeHost(domain)}/dns/${type}`, { query: { page } })
        )
    );

    server.registerTool(
        'securitytrails_whois_current',
        {
            title: 'Current WHOIS',
            description:
                'Fetch the current WHOIS record for a domain: registrar, registrant contacts where not redacted, ' +
                'nameservers, and creation/expiry dates.',
            annotations: READ_ONLY,
            inputSchema: z.object({
                domain: DomainSchema.describe('apex domain')
            })
        },
        safe(({ domain }) => client.request(`/domain/${normalizeHost(domain)}/whois`))
    );

    server.registerTool(
        'securitytrails_whois_history',
        {
            title: 'Historical WHOIS',
            description:
                'Retrieve past WHOIS records for a domain. Historical records often expose registrant details that ' +
                'have since been redacted behind privacy services.',
            annotations: READ_ONLY,
            inputSchema: z.object({
                domain: DomainSchema.describe('apex domain')
            })
        },
        safe(({ domain }) => client.request(`/history/${normalizeHost(domain)}/whois`))
    );

    server.registerTool(
        'securitytrails_ssl',
        {
            title: 'SSL/TLS certificates',
            description:
                'List SSL/TLS certificates issued for a hostname. Subject alternative names in the results frequently ' +
                'reveal hostnames that subdomain enumeration alone misses.',
            annotations: READ_ONLY,
            inputSchema: z.object({
                domain: DomainSchema.describe('domain or subdomain'),
                include_subdomains: z
                    .boolean()
                    .default(false)
                    .describe('also return certificates issued for subdomains of this host'),
                status: z
                    .enum(['valid', 'all', 'expired'])
                    .default('valid')
                    .describe('certificate validity filter; use "all" when hunting historical hostnames'),
                page: PageSchema
            })
        },
        safe(({ domain, include_subdomains, status, page }) =>
            client.request(`/domain/${normalizeHost(domain)}/ssl`, {
                query: { include_subdomains, status, page }
            })
        )
    );

    server.registerTool(
        'securitytrails_tags',
        {
            title: 'Domain tags',
            description: 'Return SecurityTrails’ classification tags for a domain.',
            annotations: READ_ONLY,
            inputSchema: z.object({
                domain: DomainSchema.describe('apex domain or hostname')
            })
        },
        safe(({ domain }) => client.request(`/domain/${normalizeHost(domain)}/tags`))
    );
}
