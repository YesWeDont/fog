// @ts-check
import http, { IncomingMessage } from 'node:http';
import net from 'node:net';
import { Duplex } from 'node:stream';
import tls from 'node:tls';
import { print } from '../../../logger.js';
/**
 * @param {import('../../../types.js').Proxy} proxy
 * @param {import('../../../types.js').Target} next
 * @param {Duplex} [socket]
 * @returns {Promise<Duplex>}
 * */
export async function createConnection(proxy, next, socket){
    /** @type {Duplex}*/
    let _socket = await new Promise((resolve, reject)=>{
        if(socket && !proxy.tls && !proxy.ssl) return resolve(socket);
        const _socket = proxy.tls||proxy.ssl?
            tls.connect({host: proxy.hostname, port: proxy.port, socket: socket}, onceSuccess):
            net.connect({host: proxy.hostname, port: proxy.port}, onceSuccess);
        function onceSuccess(){ resolve(_socket); _socket.off('error', onceError); }
        function onceError(error){ reject(error); onceClose();}
        function onceClose(){
            _socket.off('error', onceError);
            _socket.off('close', onceClose);
            _socket.off('connect', onceSuccess);
            _socket.off('secureConnect', onceSuccess);
            _socket.destroy();
        }
        _socket.on('error', onceError);
        _socket.on('close', onceClose);
    });
    let request = http.request({
        hostname: proxy.hostname,
        port: proxy.port,
        method:'CONNECT',
        path: next.hostname+':'+next.port,
        // @ts-ignore createConnection() can return any value as long as it is a Duplex.
        createConnection: ()=>_socket,
        headers:{ host: next.hostname+':'+next.port, }
    });
    request.setHeader('User-Agent', 'fog/v2.0.1')
    if(proxy.authorization) request.setHeader('Proxy-Authorization', proxy.authorization);
    request.setSocketKeepAlive(true);
    request.shouldKeepAlive = true;
    request.end();
    return await (new Promise((resolve, reject)=>{
        function onceErrorBeforeConnect(error){
            request.off('connect', onconnect);
            request.destroy();
            _socket.destroy();
            reject(error);
        }
        function onceResponse(/** @type {IncomingMessage} */res){
            request.off('connect', onconnect);
            request.off('error', onceErrorBeforeConnect);
            reject({req: request, res});
        }
        request.once('error', onceErrorBeforeConnect);
        request.once('connect', onconnect);
        request.once('response', onceResponse)
        async function onconnect(/** @type {http.IncomingMessage} */ _res, /** @type {net.Socket} */res_socket){
            request.off('error', onceErrorBeforeConnect);
            request.off('response', onceResponse);
            if(_res.statusCode !== 200) return reject({res:_res, req: request});
            print({level:-1}, ['http', 'conn'], '%s:%s via proxy %s:%s', next.hostname, next.port, proxy.hostname, proxy.port);
            function onceError(/** @type {Error} */ err){
                res_socket.off('error', onceError);
                _socket.off('error', onceError);
                // destroy the streams
                res_socket.destroy();
                _socket.destroy()
                request.destroy();
                print({level:2}, ['http', 'err'], err.message);
                reject(err);
            }
            res_socket.once('error', onceError);
            resolve(res_socket);
        }
    }));
}