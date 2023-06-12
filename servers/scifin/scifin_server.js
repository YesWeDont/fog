// @ts-check
import { createServer } from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { inspect } from 'node:util';
import { connect } from 'node:net';
import { print } from '../../logger.js';
import { logOnErr } from '../../util.js';
import { awaitConfig } from '../../config.js';

const { ssl, ...config} = await awaitConfig();
/** @type {import('../../types.js').ServerCreator} */
const create = ssl.key && ssl.cert ?
    (options, requestListener) => createHTTPSServer(options, requestListener) :
    (options, requestListener) => createServer(requestListener);


create(ssl, async function onconnect(req, res) {
    // Code is mostly based on the `proxy` library.

    const unbindClientErrorLog = logOnErr(req, 'client');
    const url = req.headers.target;
    print({level: -1}, ['conn', 'prepare'], '%s', url);
    if(req.method == 'GET'){
        const url = new URL(req.url??'', 'http://localhost:3000');
        if(url.pathname == '/shutdown'){
            if(url.searchParams.get('secret') == config.secret && config.secret) {
                print({level: 2}, ['force-exit'], 'Worker forced exit');
                process.send?.({ type: 'FORCE_EXIT', data: null });
            } else print({level: 2}, ['client', 'err'], 'Client provided incorrect force-exit key, or the key wasn\'t configured');
        }
    }
    if (req.method?.toUpperCase() !== 'POST') {
        print({level:1}, ['client', 'err'], 'Incorrect method %s, expected POST', req.method);
        return res.writeHead(405).end('Method not allowed');
    }
    if (!url) {
        print({level: 1}, ['client', 'err'], 'No `Target` header given', req.method);
        return res.writeHead(400).end('No `Target` header given');
    }

    if (!authenticate(req)) return res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="proxy"' }).end();

    try {
        const { hostname, port: _port } = new URL('http://' + url);
        const port = _port || '80';
        const ac = new AbortController();
        req.socket.once('close', abort);
        function abort(){ ac.abort(); }
        const target =
            await new Promise((resolve, reject) => {
                const socket = connect(
                    { host: hostname, port: +port, signal: ac.signal },
                    () => { socket.off('error', reject); resolve(socket); }
                );
                socket.once('error', reject);
            });
        req.socket.off('close', abort);
        print({level: -1}, ['conn'], '%s:%s', hostname, port);
        res.writeHead(200, 'Connection established').flushHeaders();
        req.pipe(target);
        target.pipe(res);
        const unbindTargetErrorLog = logOnErr(target, 'foreign');
        function cleanup(wasErr) {
            if(!wasErr){
                unbindTargetErrorLog();
                unbindClientErrorLog();
            }
            target.off('close', cleanup);
            target.unpipe(res);
            req.unpipe(target);
            res.off('close', cleanup);
            print({level: -1}, ['conn', 'cleanup'], '%s:%s', hostname, port);
        }
        target.once('close', cleanup);
        res.once('close', cleanup);
    } catch (e) {
        const debug = inspect(e);
        if (e?.code == 'ENOTFOUND') res.writeHead(404).end('Host not found', unbindClientErrorLog);
        if (e?.code == 'ERR_INVALID_URL') res.writeHead(400).end('Invalid URL', unbindClientErrorLog);
        else res.writeHead(500).end(e.message || debug, unbindClientErrorLog);
        print({level: 2}, ['connect', 'err'], debug);
    }
})
    .on('connect', (req, /** @type {import('net').Socket} */socket) => {
        const unbindClientErrorLog = logOnErr(socket, 'client');
        print({level: 1}, ['client', 'err'], 'Incorrect method %s, expected POST', req.method);
        return socket.end('HTTP/1.1 405 Method not allowed\r\nContent-Length: 18\r\n\r\nMethod not allowed', unbindClientErrorLog);
    })
    .listen(config.port);

function authenticate(/** @type {import('http').IncomingMessage} */ req) {
    print({level: -1}, 'Expected auth `%s`, and got `%s`', req.headers['proxy-authorization']??'', config.auth??'');
    return (req.headers['proxy-authorization'] ?? '') == (config.auth??'');
}