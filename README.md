# legalprox - a very legal prox
## Usage
1. Host `./server/ws.js` and/or `./server/http.js` somewhere
2. Configure `proxydata.js` in the order for which you want your proxies to be used. To use a server with `./server/ws.js` specify `type: "ws"` and to use `./server/http.js` specify `type: "http"`.
3. Run `client.js` on your computer.
4. Vióla! A proxy is hosted on `localhost:5775`.