# Shared KevBot API client

This private local package provides the HTTP transport, request bounds, JSON and
byte parsing, cancellation, and common error model used by the browser and bot.
It has no runtime dependency and uses the standard `fetch` API available in
modern browsers and Node 22.

Authentication stays in each consumer. The browser owns session-cookie refresh
and its user access token. The bot owns service authentication and the bounded
cache of delegated actor tokens. Both inject authorization into this client;
the package does not read environment variables or know about bot secrets.

The client never retries automatically. A consumer may refresh credentials and
replay once only after an explicit `401`, which the API returns before running
the operation. Network, timeout, server, and malformed-response failures are
never retried. A mutation that may have reached the API is marked with
`outcomeUnknown`; playback events remain safe to retry only when the caller
reuses the same event UUID.

The exported response and request types are maintained with the API's OpenAPI
contract in `api/src/docs/openapi.yml`. When changing an API response or request,
update these types in the same change and keep consumer parsers/tests aligned.
The package boundary is local to this repository; it is not published to npm or
GitHub Packages.
