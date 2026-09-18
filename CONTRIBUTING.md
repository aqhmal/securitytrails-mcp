# Contributing

Thanks for taking a look. Issues and pull requests are welcome.

## Getting set up

```sh
npm install
npm test
npm run build
```

`npm test` needs no API key — the HTTP layer is stubbed. Please keep it that way, so that
contributors without a paid SecurityTrails plan can still run the full suite.

## Adding a tool

1. Add the handler to the relevant module in `src/tools/` (`account`, `domain`, `ip`, `search`).
2. Register the name in `TOOL_NAMES` in `src/tools/index.ts` — a test asserts the list and the
   registered tools stay in sync.
3. Wrap the handler in `safe()`, or `safeStructured()` if it declares an `outputSchema`, so API
   errors come back as readable `isError` results instead of protocol faults.
4. Reuse `DomainSchema` / `IPv4Schema` / `PageSchema` from `src/schemas.ts` rather than writing a
   loose `z.string()`. Rejecting bad input locally costs the user nothing; a bad request costs
   them a query from their monthly allowance.
5. Add the tool to the table in `README.md`.

## Tool descriptions

The description is the only documentation the model gets. Say precisely what the tool returns and
what it does not — an overstated description is worse than a terse one, because the model will
call the tool expecting data that never arrives.

## Style

TypeScript, 4-space indent, no semicolon-free style. Run `npm run typecheck` before pushing; CI
runs the build, the type check and the tests on Node 20, 22 and 24.
