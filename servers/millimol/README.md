# millimol
Copycat of HTTP `CONNECT` proxy
## Motivation
Normal CONNECT proxies utilise the `Host` header, which makes it hard to host on foreign hosting services.
Instead, information is now provided through the `Target` header and using the HTTP Upgrade mechanism to create a TCP tunnel.
## Usage
`$ node . millimol -p8080`