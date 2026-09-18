/** Reusable input schemas and normalisers shared by the tool modules. */

import * as z from 'zod/v4';

/**
 * A bare hostname. Deliberately strict: a scheme, port or path here would be
 * silently percent-encoded into the request path and return a confusing 404.
 */
export const DomainSchema = z
    .string()
    .min(1)
    .max(253)
    .regex(
        /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/,
        'must be a bare hostname such as example.com — no scheme, port, path or wildcard'
    );

const IPV4 = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/** SecurityTrails' IP endpoints are IPv4-only; reject IPv6 up front rather than 404. */
export const IPv4Schema = z
    .string()
    .regex(IPV4, 'must be an IPv4 address such as 8.8.8.8 (SecurityTrails IP endpoints do not accept IPv6)');

export const PageSchema = z.number().int().min(1).max(10_000).default(1).describe('1-indexed page number');

/** Lowercase and percent-encode a hostname or IP for safe interpolation into a path. */
export function normalizeHost(value: string): string {
    return encodeURIComponent(value.trim().toLowerCase());
}
