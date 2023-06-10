// @ts-check

const createProxyTunnel = require('./tunnel');
const PROXIES = require('./proxydata.json');

const http = require('http');
/** @type {http.Server} */
const server = http.createServer(async (req, res)=>{
    // res.writeHead(403, 'Unauthorised').end();
    const {hostname, port, pathname, search} = new URL(req.url);
    let conn = await createProxyTunnel(PROXIES, {hostname, port: port || 80});
    let request = http.request({
        method: req.method,
        headers: req.headers,
        port: port || 80,
        host: hostname,
        path: pathname+search,
        createConnection:()=>conn
    });
    req.pipe(request, {end: true});
    request.on('finish', ()=>{
        (request.socket || (()=>{throw new Error()})()).pipe(res, {end: true})
        request.socket.on('close', ()=>res.end())
    });
});

server.on('connect', async (req, client, head)=>{
    const target = new URL(`http://${req.url}`);
    const hostname = target.hostname,
    port = +(target.port || 80);
    
    let conn = await createProxyTunnel(PROXIES, {hostname,port});
    client.write(`HTTP/${req.httpVersion} 200 OK \r\n\r\n`);
    
    client.pipe(conn);
    conn.pipe(client);
    client.on('error', onError);
    conn.on('error', onError);
});

function onError(err){
    console.error(err.message);
}

server.listen(5775, '0.0.0.0', ()=>console.log('Server on 5775'));