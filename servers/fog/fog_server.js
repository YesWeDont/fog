// @ts-check
import { ServerResponse, createServer } from 'node:http';
import http from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { inspect } from 'node:util';
import { print } from '../../logger.js'
import { logOnErr } from '../../logOnErr.js';
import { awaitConfig } from '../../config.js';
import { createConnection } from './agents/index.js';
import { Duplex } from 'node:stream';

const {ssl, proxies, ...config} = await awaitConfig();
const hopByHopHeaders = [ 'Connection', 'Keep-Alive', 'Proxy-Authenticate', 'Proxy-Authorization','TE', 'Trailers', 'Transfer-Encoding', 'Upgrade' ];

/** @type {import('../../types.js').ServerCreator} */
const create = ssl.key && ssl.cert ?
    (options, requestListener) => createHTTPSServer(options, requestListener) :
    (options, requestListener) => createServer(requestListener);
const server = create(ssl, async (req, res) => {
    const onClientError = logOnErr(req, 'client');
    req.socket.pause()
    try{
        const url = new URL(req.url || '');
        const headers = Object.fromEntries(Object.entries(req.headers)
            .filter(([name])=>!hopByHopHeaders.includes(name)) // Get rid of headers if they are deemed 'Hop By Hop'
        );
        if(url.protocol !== 'http:') return res.writeHead(400).end('https: requests should be made through CONNECT proxies');
        
        const target = await createConnection(proxies, {hostname: url.hostname, port: +(url.port||'80')});
        const foreign = http.request({
            hostname: url.hostname, port: (url.port || '80'), path: url.pathname,
            method: req.method, headers,
            createConnection: ()=>(/** @type {import('node:net').Socket}*/ (target)),
        }, onResp);

        req.pipe(foreign);
        req.socket.resume();
        
        // const onForeignError = logOnErr(foreign, 'foreign');
        req.on('error', abortRequest);
        foreign.on('close', abortRequest);
        function abortRequest(){
            foreign.destroy();
            foreign.off('response', onResp);
            req.destroy();
            res.destroy();
            req.off('close', abortRequest);
            foreign.off('close', abortRequest);
        }
        function onResp(resp){
            foreign.off('close', abortRequest);
            req.off('close', abortRequest);
            const headers = Object.fromEntries(Object.entries(resp.headers)
                .filter(([name])=>!hopByHopHeaders.includes(name)) // Get rid of headers if they are deemed 'Hop By Hop'
            );
            res.writeHead(resp.statusCode||200, resp.statusMessage, headers);
            resp.pipe(res);

            res.on('close', cleanup);
            req.on('close', cleanup);
            resp.once('close', cleanup);
            foreign.on('close', cleanup);
            function cleanup() {
                foreign.off('close', cleanup);
                foreign.end();
                // foreign.off('error', onForeignError);
                res.off('close', cleanup);
                res.end(() => res.destroy());
                resp.off('close', cleanup);
                resp.destroy();
                req.destroy();
                req.off('error', onClientError);
                req.off('close', cleanup);
                
                print({ ev: 'cleanup', level: -1 }, ['conn', 'cleanup'], url.toString());
            }
        }
    } catch(e){
        // handle any errors during connection
        const debug = inspect(e);
        print({ level: 2 }, ['connect', 'err'], debug);
        if(!res || res?.headersSent){
            res.destroy();
            req.destroy()
            print({level: 1}, ['cleanup'], 'Headers were sent already when error occurred')
        }
        else if (e?.code == 'ENOTFOUND') res?.writeHead(404).end('Host not found');
        else if (e?.code == 'ERR_INVALID_URL') res?.writeHead(400).end('Invalid URL');
        else res
                .writeHead(500, { 'Content-Type': 'text/plain', 'Content-Length': debug.length })
                .end(debug);
    }
})
    .on('connect', async function onconnect(req, /** @type {import('net').Socket} */socket, _head) {
        // Code is mostly based on the `proxy` library.
        socket.pause();
        
        /** @type {ServerResponse|null} */
        let res = new ServerResponse(req);
        const url = req.headers.host || req.url;
        res.shouldKeepAlive = false;
        res.chunkedEncoding = false;
        res.useChunkedEncodingByDefault = false;
        res.assignSocket(socket);
        function onFinish() {
            if (res) { res.detachSocket(socket) }
            socket.end();
            res = null;
        }
        res.once('finish', onFinish);

        const onSocketError = logOnErr(socket, 'client');
        
        if (!url) {
            print({level:1}, ['client', 'err'], 'No `Host` header or target URL given');
            return res.writeHead(400).end('No `Host` header or target URL given.');
        }
        if (!authenticate(req)) {
            res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="proxy"' });
            res.end();
            return;
        }

        socket.resume();

        try {
            const { hostname, port: _port } = new URL('http://' + url);
            const port = _port || '80';

            const target = await createConnection(proxies, {hostname, port: +port});

            if (res) {
                // Send 200
                res.removeListener('finish', onFinish);
                res.writeHead(200, 'Connection established');
                res.flushHeaders();
                res.detachSocket(socket);
                res = null;
                socket.pipe(target);
                target.pipe(socket);

                // error management, cleanup
                const onTargetError = logOnErr(target, 'foreign');
                function cleanup() {
                    target.off('close', cleanup);
                    target.end(() => target.destroy());
                    target.off('error', onTargetError);
                    socket.off('close', cleanup);
                    socket.off('error', onSocketError);
                    socket.end(() => socket.destroy());
                    print({ ev: 'cleanup', level: -1 }, ['conn', 'cleanup'], '%s:%s', hostname, port);
                }
                target.once('close', cleanup);
                socket.once('close', cleanup);
            } else {
                // the res socket died halfway...
                target.destroy();
            }
        } catch (e) {
            // handle any errors during connection
            const debug = inspect(e);
            print({ level: 2 }, ['connect', 'err'], debug);
            if(!res || res?.headersSent) print({level: 1}, ['cleanup'], 'Headers were already sent')
            else if (e?.code == 'ENOTFOUND') res?.writeHead(404).end('Host not found');
            else if (e?.code == 'ERR_INVALID_URL') res?.writeHead(400).end('Invalid URL');
            else res
                ?.writeHead(500, { 'Content-Type': 'text/plain', 'Content-Length': debug.length })
                .end(debug);
        }
    })
    .listen(config.port);
process.on('exit', () => print({level: 1}, ['exit'], `Worker exiting...`));
function authenticate(/** @type {import('http').IncomingMessage} */ req) {
    return (req.headers['proxy-authorization'] ?? '') == config.auth
}