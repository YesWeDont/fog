# scifin
Copycat of HTTP `CONNECT` proxy
## Motivation
Normal CONNECT proxies utilise the `Host` header, which makes it hard to host on foreign hosting services.
Instead, information is now provided through the `Target` header and the `POST` method alongside the HTTP Chunked transfer-encoding. However, this is non-specification compliant, since the server sends a responce back before the client's request finishes.
## Usage
`$ PORT=1081 node . scifin`