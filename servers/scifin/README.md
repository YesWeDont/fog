# scifin
Copycat of HTTP `CONNECT` proxy
## Motivation
Normal CONNECT proxies utilise the `Host` header, which makes it hard to host on foreign hosting services.
Instead, information is now provided through the `Target` header and the `POST` method.
## Usage
`$ PORT=1081 node . scifin`