import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOL_NAMES } from '../src/tools/index.js';
import { connectedClient } from './support.js';

describe('tool surface', () => {
    it('advertises exactly the documented tools', async () => {
        const { client, close } = await connectedClient([]);
        const { tools } = await client.listTools();
        assert.deepEqual(
            tools.map(tool => tool.name).sort(),
            [...TOOL_NAMES].sort(),
            'TOOL_NAMES and the registered tools have drifted apart'
        );
        await close();
    });

    it('marks every tool read-only and open-world', async () => {
        const { client, close } = await connectedClient([]);
        const { tools } = await client.listTools();
        for (const tool of tools) {
            assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} is not marked read-only`);
            assert.equal(tool.annotations?.destructiveHint, false, `${tool.name} is not marked non-destructive`);
            assert.equal(tool.annotations?.openWorldHint, true, `${tool.name} is not marked open-world`);
        }
        await close();
    });

    it('gives every tool a description', async () => {
        const { client, close } = await connectedClient([]);
        const { tools } = await client.listTools();
        for (const tool of tools) {
            assert.ok((tool.description?.length ?? 0) > 40, `${tool.name} needs a fuller description`);
        }
        await close();
    });
});

describe('securitytrails_usage', () => {
    it('derives remaining allowance and percentage used', async () => {
        const { client, close } = await connectedClient([
            { body: { allowed_monthly_usage: 20000, current_monthly_usage: 1745 } }
        ]);
        const result = await client.callTool({ name: 'securitytrails_usage', arguments: {} });
        assert.deepEqual(result.structuredContent, {
            allowed_monthly_usage: 20000,
            current_monthly_usage: 1745,
            remaining: 18255,
            percent_used: 8.7
        });
        await close();
    });

    it('does not divide by zero when the plan reports no allowance', async () => {
        const { client, close } = await connectedClient([{ body: {} }]);
        const result = await client.callTool({ name: 'securitytrails_usage', arguments: {} });
        assert.equal((result.structuredContent as { percent_used: number }).percent_used, 0);
        await close();
    });
});

describe('securitytrails_subdomains', () => {
    it('returns fully-qualified hostnames rather than bare labels', async () => {
        const { client, close } = await connectedClient([
            { body: { subdomains: ['www', 'api', 'mail'], subdomain_count: 3 } }
        ]);
        const result = await client.callTool({
            name: 'securitytrails_subdomains',
            arguments: { domain: 'example.com' }
        });
        assert.deepEqual(result.structuredContent, {
            apex: 'example.com',
            hostnames: ['www.example.com', 'api.example.com', 'mail.example.com'],
            returned: 3,
            total: 3,
            truncated: false
        });
        await close();
    });

    it('truncates to the limit and says so', async () => {
        const labels = Array.from({ length: 50 }, (_, index) => `host${index}`);
        const { client, close } = await connectedClient([
            { body: { subdomains: labels, subdomain_count: 50 } }
        ]);
        const result = await client.callTool({
            name: 'securitytrails_subdomains',
            arguments: { domain: 'example.com', limit: 10 }
        });
        const output = result.structuredContent as {
            hostnames: string[];
            returned: number;
            total: number;
            truncated: boolean;
            note: string;
        };
        assert.equal(output.returned, 10);
        assert.equal(output.total, 50);
        assert.equal(output.truncated, true);
        assert.match(output.note, /higher `limit`/);
        await close();
    });

    it('lowercases the apex it joins onto', async () => {
        const { client, close } = await connectedClient([{ body: { subdomains: ['www'], subdomain_count: 1 } }]);
        const result = await client.callTool({
            name: 'securitytrails_subdomains',
            arguments: { domain: 'EXAMPLE.com' }
        });
        assert.deepEqual((result.structuredContent as { hostnames: string[] }).hostnames, ['www.example.com']);
        await close();
    });
});

describe('input validation', () => {
    it('rejects a URL where a bare hostname is required', async () => {
        const { client, calls, close } = await connectedClient([]);
        const result = await client.callTool({
            name: 'securitytrails_domain_details',
            arguments: { domain: 'https://example.com/path' }
        });
        assert.equal(result.isError, true);
        assert.equal(calls.length, 0, 'invalid input must not spend API quota');
        await close();
    });

    it('rejects an IPv6 address on an IPv4-only endpoint', async () => {
        const { client, calls, close } = await connectedClient([]);
        const result = await client.callTool({
            name: 'securitytrails_ip_whois',
            arguments: { ip: '2001:4860:4860::8888' }
        });
        assert.equal(result.isError, true);
        assert.equal(calls.length, 0);
        await close();
    });

    it('rejects an out-of-range IPv4 octet', async () => {
        const { client, close } = await connectedClient([]);
        const result = await client.callTool({
            name: 'securitytrails_ip_neighbors',
            arguments: { ip: '999.1.1.1' }
        });
        assert.equal(result.isError, true);
        await close();
    });

    it('requires either a filter or a query when searching domains', async () => {
        const { client, calls, close } = await connectedClient([]);
        const result = await client.callTool({ name: 'securitytrails_search_domains', arguments: {} });
        assert.equal(result.isError, true);
        assert.equal(calls.length, 0);
        await close();
    });

    it('accepts a search that supplies only a DSL query', async () => {
        const { client, calls, close } = await connectedClient([{ body: { records: [] } }]);
        const result = await client.callTool({
            name: 'securitytrails_search_domains',
            arguments: { query: "ipv4 = '1.2.3.4'" }
        });
        assert.notEqual(result.isError, true);
        assert.equal(calls.length, 1);
        assert.deepEqual(JSON.parse(calls[0]!.body!), { query: "ipv4 = '1.2.3.4'" });
        await close();
    });
});

describe('error surfacing', () => {
    it('returns an API failure as a readable isError result, not a thrown fault', async () => {
        const { client, close } = await connectedClient([{ status: 404, body: { message: 'Not found' } }]);
        const result = await client.callTool({
            name: 'securitytrails_domain_details',
            arguments: { domain: 'does-not-exist.invalid' }
        });
        assert.equal(result.isError, true);
        const [block] = result.content as { type: string; text: string }[];
        assert.match(block!.text, /no records for this target/i);
        await close();
    });

    it('passes the configured record type through to the history path', async () => {
        const { client, calls, close } = await connectedClient([{ body: { records: [] } }]);
        await client.callTool({
            name: 'securitytrails_dns_history',
            arguments: { domain: 'example.com', type: 'a' }
        });
        assert.match(calls[0]!.url, /\/history\/example\.com\/dns\/a\?/);
        await close();
    });
});
