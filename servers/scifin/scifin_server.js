// @ts-check
import { ServerResponse, createServer } from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { inspect } from 'node:util';
import { connect } from 'node:net';
import { print } from '../../logger.js';
import { logOnErr } from '../../logOnErr.js';
import { awaitConfig } from '../../config.js';

const { ssl, ...config} = await awaitConfig();
/** @type {import('../../types.js').ServerCreator} */
const create = ssl.key && ssl.cert ?
    (options, requestListener) => createHTTPSServer(options, requestListener) :
    (options, requestListener) => createServer(requestListener);


const server = create(ssl, async function onconnect(req, res) {
    // Code is mostly based on the `proxy` library.

    const url = req.headers.target;
    req.pause(); // prevent data loss
    const onReqError = logOnErr(req, 'client');
    if(req.method == 'GET'){
        const url = new URL(req.url??'', 'http://localhost:3000');
        if(url.pathname == '/shutdown'){
            if(url.searchParams.get('secret') == config.secret && config.secret) {
                print({level: 2}, ['force-exit'], 'Worker forced exit');
                process.send?.({ type: 'FORCE_EXIT', data: null });
            } else print({level: 2}, ['client', 'err'], 'Client provided incorrect force-exit key, or the key wasn\'t configured in env variables');
        }
    }
    if (req.method?.toUpperCase() !== 'POST') {
        print({level:1}, ['client', 'err'], 'Incorrect method %s, expected POST', req.method);
        return res.writeHead(405).end();
    }
    if (!url) {
        print({level: 1}, ['client', 'err'], 'No `Target` header given', req.method);
        return res.writeHead(400).end('No `Target` header given');
    }

    if (!authenticate(req)) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="proxy"' });
        res.end();
        return;
    }

    req.resume();

    try {
        const { hostname, port: _port } = new URL('http://' + url);
        const port = _port || '80';
        const target =
            await new Promise((resolve, reject) => {
                const socket = connect(
                    { host: hostname, port: +port },
                    () => { socket.off('error', reject); resolve(socket) }
                );
                socket.once('error', reject)
            });
        res.writeHead(200, 'Connection established');
        res.flushHeaders();
        req.pipe(target);
        target.pipe(res);
        const onTargetError = logOnErr(target, 'foreign')
        function cleanup() {
            target.off('close', cleanup);
            target.off('error', onTargetError);
            target.end(() => target.destroy());
            res.off('close', cleanup);
            res.end(() => res.destroy());
            req.off('error', onReqError);
            print({level: -1}, ['conn', 'cleanup'], '%s:%s', hostname, port);
        }
        target.once('close', cleanup)
        res.once('close', cleanup)
    } catch (e) {
        const debug = inspect(e);
        if (e?.code == 'ENOTFOUND') res?.writeHead(404).end('Host not found');
        if (e?.code == 'ERR_INVALID_URL') res?.writeHead(400).end('Invalid URL');
        else if (res)
            res
                .writeHead(500, { 'Content-Type': 'text/plain', 'Content-Length': debug.length })
                .end(debug);
        print({level: 2}, ['connect', 'err'], debug);
    }
})
    .on('connect', (req, /** @type {import('net').Socket} */socket) => {
        logOnErr(socket, 'client')
        const res = new ServerResponse(req);
        res.assignSocket(socket);
        print({level: 1}, ['client', 'err'], 'Incorrect method %s, expected POST', req.method);
        return res.writeHead(405).end();
    })
    .listen(config.port);

function authenticate(/** @type {import('http').IncomingMessage} */ req) {
    return (req.headers['proxy-authorization'] ?? '') == config.auth;
}