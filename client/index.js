// @ts-check
process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'

const http = require('http');

const createProxyTunnel = require('./tunnel');
const verbose = require('./log'); // verbose logging
const PORT = 5775;

const PROXIES = JSON.parse(process.env.PROXY_DATA || require('fs').readFileSync(
    require.resolve('./proxydata.json') // the data and info for the proxy servers.
).toString());

const server = http.createServer(/** @param {http.IncomingMessage} req  @param {http.ServerResponse} res*/
async (req, res)=>{
    // decode the request
    const {hostname, port, pathname, search} = new URL(req.url || '');
    const target = `${hostname}:${port||80}${pathname == '/'? '':pathname}${search}`;
    verbose(`Incoming normal request (method: ${req.method}) to: ${target}`);
    // connect to the target host
    try{
        let conn = await createProxyTunnel(PROXIES, {hostname, port: +port || 80});
        if(!conn) return res.writeHead(503, `Connection refused`);
        let request = http.request({
            method: req.method,
            headers: req.headers,
            port: port || 80,
            hostname,
            path: pathname+search,
            createConnection:()=>conn?conn:(()=>{throw new Error('')})()
        }, resp=>{
            res.writeHead(resp.statusCode || 400, resp.statusMessage, resp.headers);
            resp.pipe(res, {end: true})
        });

        req.pipe(request);
        req.once('end', ()=>request.end())
    }catch(e){
        res.writeHead(500, 'internal server error');
        res.end(e.message);
        console.error(e);
    }
});
server.on("connect", async (req, client, head)=>{
    // decode the incoming request
    const {hostname, port} = new URL(`http://${req.url}`);
    const target = `${hostname}:${port||80}`;
    verbose(`Incoming CONNECT to: ${target}`);
    // connect to target
    let conn = await createProxyTunnel(PROXIES, {hostname, port: +port || 80});
    client.write(`HTTP/${req.httpVersion} 200 OK \r\n\r\n`);
    
    // write head packet
    conn.write(head);

    // pipe the streams
    client.pipe(conn, {end: false});
    conn.pipe(client, {end: true});

    // cleanup
    const error = e=>{
        if(e){
            if(e.message) console.error(e.message);
            else console.error(e);
        }
        destroy();
    }
    function destroy(){
        verbose('Cutting a connection')
        if(conn && !conn.destroyed) conn.destroy();
        if(client && !client.destroyed) client.destroy();
        client.off('close', destroy);
        conn.off('close', destroy);
        client.off('error', error);
        conn.off('error', error);
        // @ts-ignore GC
        conn = null;
        // @ts-ignore GC
        client = null;
    }
    client.once('close', destroy);
    conn.once('close', destroy);
    client.once('error', error);
    conn.once('error', error);
});
// ensure server is accessible everywhere
server.listen(PORT, '0.0.0.0', ()=>console.log(`Server listening on port ${PORT}`));