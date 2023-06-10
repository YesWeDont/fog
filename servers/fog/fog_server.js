// @ts-check
import { ServerResponse, createServer } from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { createConnection as createSciFinConnection } from './agents/scifin_agent.js';
import { createConnection as createHTTPConnection } from './agents/http_agent.js';
import { inspect } from 'node:util';
import { connect } from 'node:net';
import { Duplex } from 'node:stream';
import { print } from '../../logger.js'

/** @type {import('../../types.js').ServerCreator} */
const create = process.env.SSL_KEY && process.env.SSL_CERT ?
    (options, requestListener) => createHTTPSServer(options, requestListener) :
    (options, requestListener) => createServer(requestListener);

/** @type {import('../../types.js').Config} */
const { sslConfig, serverConfig } = await new Promise(resolve => {
    process.on('message', ({ data, type }) => {
        if (type == 'CONFIG') resolve(data);
    });
    process.send?.({ type: 'REQUEST_CONFIG', data: null });
});

const server = create(sslConfig, (req, res) => {
    // rude clients
    req.once('error', (/** @type {NodeJS.ErrnoException} */e) =>
        print({ level: 2 }, ['client', 'err'], e.code)
    );
    print({ level: 1 }, ['client', 'err'], 'Incorrect method %s, expected CONNECT', req.method)
    return res.writeHead(405).end();
})
    .on('connect', async function onconnect(req, /** @type {import('net').Socket} */socket, _head) {
        // Code is mostly based on the `proxy` library.
        socket.pause();
        
        /** @type {ServerResponse|null} */
        let res = new ServerResponse(req);
        const url = req.url || req.headers.host;
        res.shouldKeepAlive = false;
        res.chunkedEncoding = false;
        res.useChunkedEncodingByDefault = false;
        res.assignSocket(socket);
        function onFinish() {
            if (res) { res.detachSocket(socket) }
            socket.end();
        }
        res.once('finish', onFinish);

        socket.once('error', (/** @type {NodeJS.ErrnoException} */e) =>
            print({level:2}, ['client', 'err'], e.code)
        );
        
        if (!url) {
            print({level:1}, ['client', 'err'], 'No `Host` header or target URL given');
            return res.writeHead(400).end('No "url" provided.');
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

            /** @type {Promise<Duplex|undefined>} */
            const init = Promise.resolve(undefined);
            const target = await (
                
                // crreate socket from config...
                await serverConfig.reduce(async (prev, curr, index) => {
                    let socket = await prev;
                    let next = serverConfig[index + 1] || { hostname, port: +port }
                    if (curr.type == 'scifin')
                        return await createSciFinConnection(curr, next, socket)
                    else if (curr.type == 'http')
                        return await createHTTPConnection(curr, next, socket)
                }, init)
                
                .then(socket => {
                    if (socket) return socket;
                    // ...but direct mode if no config
                    else return new Promise((resolve, reject) => {
                        const socket = connect( { host: hostname, port: +port },
                            () => {
                                socket.off('error', reject);
                                print({level: -1}, ['direct', 'conn'], '%s:%s', hostname, port);
                                resolve(socket)
                            }
                        );
                        socket.once('error', reject)
                    })
                },
                
                err => {
                    // handle errors during protocol handshake
                    if (err instanceof Error) throw err;
                    // HTTP related errors
                    else if (err.req && err.res) {
                        print(['handshake', 'err'], 'HTTP status %d during handshake.', err.res.statusCode);
                        res?.writeHead(err.res.statusCode, err.res.headers);
                        err.res.pipe(res, { end: true });
                        err.res?.on('close', () => err.req.destroy())
                        return 0;
                    }
                })
            );
            
            if (target == 0) return; // there was an error and it has been handled

            if (res) {
                // Send 200
                res.removeListener('finish', onFinish);
                res.writeHead(200, 'Connection established');
                res.flushHeaders();
                res.detachSocket(socket);
                res = null;
            }

            socket.pipe(target);
            target.pipe(socket);

            // error management, cleanup
            target.once('error', (/** @type {NodeJS.ErrnoException} */e) => print({ level: 2 }, ['foreign', 'err'], e.code))
            function cleanup() {
                target.off('close', cleanup);
                target.end(() => target.destroy());
                socket.off('close', cleanup);
                socket.end(() => socket.destroy());
                print({ ev: 'cleanup', level: -1 }, '%s:%s', hostname, port);
            }
            target.once('close', cleanup);
            socket.once('close', cleanup);
        } catch (e) {
            // handle any errors during connection
            const debug = inspect(e);
            if (e?.code == 'ENOTFOUND') res?.writeHead(404).end('Host not found');
            if (e?.code == 'ERR_INVALID_URL') res?.writeHead(400).end('Invalid URL');
            else if (res)
                res
                    .writeHead(500, { 'Content-Type': 'text/plain', 'Content-Length': debug.length })
                    .end(debug);
            print({ level: 2 }, ['connect', 'err'], debug);
        }
    })
    .listen(process.env.PORT);
process.on('exit', () => print({level: 1}, ['exit'], `Worker exiting...`));
function authenticate(/** @type {import('http').IncomingMessage} */ req) {
    return (req.headers['proxy-authorization'] ?? '') == (process.env.AUTH ?? '')
}