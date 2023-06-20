import net from 'node:net';
import tls from 'node:tls';
import { print } from './logger.js';

import pkg from './packageJson.cjs';
export const version = pkg.version;
/** @param {import('node:events').EventEmitter} ee */
export function logOnErr(ee, scope=''){
    /** @param {NodeJS.ErrnoException} err */
    function onError(err){ print({level:2}, scope?[scope, 'err']:['err'], err.code); }
    ee.once('error', onError);
    return ()=>ee.off('error', onError);
}
const hopByHopHeaders = [ 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization','te', 'trailers', 'transfer-encoding', 'upgrade' ];
export function removeHopByHop(headers){
    return Object.fromEntries(Object.entries(headers)
        .filter(([name])=>!hopByHopHeaders.includes(name.toLowerCase())) // Get rid of headers if they are deemed 'Hop By Hop'
    );
}
/** @param {import('node:events').EventEmitter} ee @param {string|symbol} evName @param {AbortSignal} [signal]  */
export function waitUntil(ee, evName, signal=new AbortController().signal){
    return new Promise((resolve, reject)=>{
        ee.once(evName, success);
        ee.once('error', fail); signal.onabort = fail;
        function success(...args){
            resolve(args);
            ee.off('error', fail); signal.onabort = null;
        }
        function fail(err){
            reject(err);
            ee.off(evName, success); signal.onabort = null;
        }
    });
}
/** @param {import("./types").Proxy} target @param {AbortSignal} signal @param {import('node:stream').Duplex} [socket] */
export async function connect(target, signal, socket){
    if(socket && !target.ssl) return socket;
    if(target.ssl) {
        const _socket = tls.connect({host: target.hostname, port: target.port, socket: socket});
        await waitUntil(_socket, 'secureConnect', signal);
        return _socket;
    } else {
        const socket = net.connect({host: target.hostname, port: target.port, signal});
        await waitUntil(socket, 'connect'); //no need for ac here
        return socket;
    }
}
/** @param {import('./types').Target} target */
export function targetToString(target){ return target.hostname+':'+target.port; }