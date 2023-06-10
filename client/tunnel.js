// @ts-check
const http = require('http');
const https = require('https');
const verbose = require('./log');
const net = require('net');
const WebSocket = require('ws');
// const HttpsProxyAgent = require('https-proxy-agent');
/** @typedef {Target & {auth?: string, type:"ws"|"http"|string, ssl: boolean}} ProxyOptions */
/** @typedef {{hostname: string, port: number}} Target */
/** @typedef {((options: http.ClientRequestArgs , callback: (err: Error, socket: net.Socket)=>void)=>net.Socket)|undefined} ConnectionCreator */

/**
 * @param {net.Socket} source
 * @param {Target} target
 * @param {(err: any|undefined, socket: net.Socket)=>void} cb
 */
function cloneSocket(source, target, cb){
    let ret = new net.Socket();
    ret._read = (...args)=>source.read(...args)
    ret._write = (...args)=>source.write(...args);
    ret._final = (...args)=>source.end(...args);
    source.once('error', err=>ret.emit('error', err));
    source.once('close', _ => ret.destroy())
    ret._destroy = function (...args){
        // @ts-ignore
        delete this._destroy; delete this._read;
        // @ts-ignore
        delete this._final; delete this._write;
        if(!this.destroyed) net.Socket.prototype.destroy.call(this, args[1]);
        if(!source.destroyed) source.destroy();
    }
    ret.connect(target, ()=>{cb(null, ret)}).once('error', cb);
}
/**
 * Returns a new tunnel which communicates to the proxy through the given `prevLayer`.
 * @param {net.Socket} [prevLayer]
 * @param {ProxyOptions} proxy
 * @param {Target} target
 * @returns {Promise<net.Socket>} proxied stream
 */
async function tunnel(proxy, target, prevLayer){
    let createConnection = prevLayer?(options, cb)=>cloneSocket(prevLayer, options, cb):undefined;
    
    if(proxy.type === 'ws'){
        // @ts-ignore
        return wsProxy(proxy, target, createConnection);
    }else if(proxy.type=='http'){
        // @ts-ignore
        return httpProxy(proxy, target, createConnection)
    }
    else throw new Error('Unsupported proxy type');
}
/**
 * 
 * @param {ProxyOptions & {socket?:net.Socket}} proxy 
 * @param {Target} next
 * @param {ConnectionCreator} createConnection
 * @returns 
 */
async function httpProxy(proxy, next, createConnection){
    let req = (proxy.ssl?https:http).request({
        method:'CONNECT',
        path: `${next.hostname}:${next.port}`,
        host: proxy.hostname,
        port: proxy.port,
        headers:{Host: `${next.hostname}:${next.port}`, 'Proxy-Authorization': proxy.auth??'', 'Connection':'Keep-Alive'},
        createConnection
    });
    req.end();
    let socket = await new Promise((res, rej)=>
        req.once('error', rej).once('connect', (_, socket, head)=>{
            req.off('error', rej)
            socket.write(head, err=>{
                if(err) rej(err);
                else res(socket)
            });
        }));
    return socket;
}
/**
 * 
 * @param {ProxyOptions & {socket?: net.Socket}} proxy
 * @param {Target} target 
 * @param {ConnectionCreator} createConnection
 * @returns {Promise<net.Socket>}
 */
async function wsProxy(proxy, target, createConnection){
    let proxyUrl = `${proxy.ssl?'wss':'ws'}://${proxy.hostname}:${proxy.port}`
    verbose('creating ws tunnel to', proxyUrl, 'tunneling for', target);
    let ws = new WebSocket(proxyUrl, {createConnection});
    verbose('created ws tunnel to', proxyUrl, 'tunneling for', target);
    await new Promise((res, rej)=>[ws.onopen=res, ws.onclose=ws.onerror=rej]);
    // @ts-ignore
    delete ws.onopen; delete ws.onerror; delete ws.onclose;
    verbose('ws open');
    let socket = new net.Socket();
    ws.send(JSON.stringify({auth:proxy.auth, ...target}));
    const message = await new Promise(res=>ws.once('message', res));
    // this fixed the leak. I do not know why
    await new Promise(res=>socket.connect(target.port, target.hostname, ()=>res(undefined)));
    if(message.toString('utf8') !== 'ok'){
        socket.emit('error', message)
    }
    // this has to be AFTER the "OK" to ensure nodejs' errors dont trigger
    function handleMessage(data){
        if(data instanceof Buffer || data instanceof ArrayBuffer) {
            // Try comment line 59, socket.connect(), and you will be pinged by
            // insane amounts of warnings originating from this line
            socket.push(data);
        }
        else {for (let datum of data) socket.push(datum)}
    }
    function cleanup(){
        ws.off('message', handleMessage);
        // @ts-ignore GC
        ws.close(); ws = null
        // @ts-ignore GC
        delete socket._write; delete socket._writev;
        // @ts-ignore GC
        delete socket._final;  delete socket._destroy;
        // let the end user do the rest of the cleanup
        socket.emit('close');
    }
    ws.on('message', handleMessage);
    ws.once('close', cleanup);

    socket._write = (chunk, _, cb)=> ws.send(chunk, cb);
    socket._writev = (chunks, cb)=>{
        let iter = chunks[Symbol.iterator]();
        function send(){
            let {done, value} = iter.next();
            if(value) ws.send(value.chunk, (err)=>{
                if(done || err) cb(err);
                else send()
            })
        }
        send();
    }
    socket._destroy = (err)=>{
        ws.close(1000, err?.message);
    }
    socket._final = (cb)=>{
        if(ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING)
            ws.ping(JSON.stringify({op:'DATA_END', data:''}), undefined, cb);
    }
    ws.once('error', e=>socket.emit('error', e));
    return socket;
}

/**
 * 
 * @param {ProxyOptions[]} proxies 
 * @param {Target} target 
 * @returns {Promise<net.Socket>}
 */
module.exports = function createProxyTunnel(proxies, {hostname, port}){
    if(proxies.length == 0) throw new Error('Need at least one proxy!');
    // @ts-ignore legitimately arrogant
    return proxies.reduce((prevTunnel, proxy, index, proxies)=>
        // @ts-ignore dont be rude
        prevTunnel.then(prev=>
            tunnel(proxy, proxies[index+1] || {hostname, port}, prev)
        ),
        Promise.resolve(undefined)
    );
}