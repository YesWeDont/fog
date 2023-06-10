# fog
Chain proxies `f(x)` and `g(x)` together to form `(f∘g)(x)` (`f(g(x))`)!
## Usage
1. Host your proxies somewhere. Currently, the client supports only HTTP `CONNECT` proxies or [`scifin`](/servers/scifin/README.md) proxies.
2. Configure `config.json` in the order for which you want your servers to be used. The client will connect to the first proxy first, i.e. if you specified [`f(x)`, `g(x)`] it would connect to proxy `f(x)` before using the tunnel provided by that to connect to `g(x)` and finally access your endpoint.
Example format:
```
[{
    "hostname":"localhost",
    "type": "scifin",
    "port": 8080,
    "tls": false
},
{
    "hostname":"localhost",
    "type": "scifin",
    "port": 1081,
    "authorization": "Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="
}]
```
This will connect to `localhost:8080` first then talk to `localhost:1081` via that connection.

3. Run `CONFIG=config.json PORT=1080 node .` on your computer.
4. Vióla! Instead of `f(x)` and `g(x)` a more glorious, chained version (`f(g(x))`) is hosted on port 1080.
