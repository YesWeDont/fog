// @ts-check
process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'
const {servers: PROXIES, auths: AUTHS} = require('./proxydata.json')
const net = require('net');
const http = require('http');
const HttpsProxyAgent = require('https-proxy-agent');
const WebSocket = require('ws');
const agent = HttpsProxyAgent({
    host: PROXIES[0].host,
    port: PROXIES[0].port,
    headers:{ 'Proxy-Authorization': AUTHS[0] }
});
/** @type {http.Server} */
const server = http.createServer(async (req, res)=>{
    res.writeHead(403, "Unauthorised").end();
});
server.on("connect", async (req, client, head)=>{

    const target = new URL(`http://${req.url}`);
    const hostname = target.hostname,
    port = +(target.port || 80),
    host = hostname+":"+port;
    
    const tunnel = new WebSocket(`wss://${PROXIES[1].host}:${PROXIES[1].port}`, {agent});
    await new Promise(res=>tunnel.on('open', res));
    tunnel.send(JSON.stringify({hostname, port, auth: AUTHS[1]}));
    
    const response = (await new Promise(res=>tunnel.once('message', data=>res(data)))).toString('utf8');
    if(response != 'ok'){
        client.write(`HTTP/${req.httpVersion} 400 FAILED\r\n\r\n`)
    }
    
    client.write(`HTTP/${req.httpVersion} 200 OK\r\n\r\n`);
    
    tunnel.on('message', message=>client.write(message))
    tunnel.on('close', ()=>client.end());
    client.on("end", ()=>{
        if(tunnel.readyState == tunnel.CLOSING || tunnel.readyState == tunnel.CLOSED){}
        else tunnel.ping('{"op":"CLOSE", "data":"Disconnected"}')
    })
    client.on('data', data=>tunnel.send(data));
    client.on('error', err=>{
        console.error(err);
        tunnel.close();
        client.destroy();
    })
})
server.listen(5775, ()=>console.log("Server on 5775"));