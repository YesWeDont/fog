# ws
Copycat of HTTP `CONNECT` proxy using WebSockets
## Motivation
Normal CONNECT proxies utilise the `Host` header, which makes it hard to host on foreign hosting services.
Instead, information is now provided through the `Target` header and using the HTTP Upgrade mechanism to create a WS tunnel. This is more generally supported in hosting services than `millimol` as some only allow HTTP WebSocket upgrades.
## Usage
`$ node . ws -p8080`