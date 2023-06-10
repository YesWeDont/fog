# fog
Chain proxies `f(x)` and `g(x)` together to form `(f∘g)(x)` (`f(g(x))`)!
## Usage
1. Host your proxies somewhere. Currently, the client supports only HTTP proxies or [`fog-ws`](/legalprox/README.md) proxies.
2. Configure `proxydata.js` in the order for which you want your servers to be used. The client will connect to the first proxy first, i.e. if you specified [`f(x)`, `g(x)`] it would connect to proxy `f(x)` before using the tunnel provided by that to connect to `g(x)` and finally access your endpoint.
3. Run `client.js` on your computer.
4. Vióla! Instead of `f(x)` and `g(x)` a more glorious, chained version (`f(g(x))`) is hosted on port 5775.
