// @ts-check
const http = require('http');
const net = require('net');
const WebSocket = require('ws');
/** @typedef {Target & {auth?: string, type:"ws"|"http"|string}} ProxyOptions */
/** @typedef {{hostname: string, port: number}} Target */

/**
 * Returns a new tunnel which communicates to the proxy through the given `prevLayer`.
 * @param {net.Socket} prevLayer
 * @param {ProxyOptions} proxy
 * @param {Target} target
 * @returns {Promise<net.Socket>} proxied stream
 */
async function nextLayer(prevLayer, proxy, target){
    // @ts-ignore its an internal function
    if(!prevLayer.destroySoon) prevLayer.destroySoon = function () { return prevLayer.destroy();}

    if(proxy.type === 'ws'){
        let ws = new WebSocket(`wss://${proxy.hostname}:${proxy.port}`, {createConnection:()=>prevLayer})
        return initWSproxy(ws, target, proxy.auth);
    }else if(proxy.type=='http'){
        let res = await new Promise(/** @param {(data:http.IncomingMessage)=>void} res*/res=>http.request('http://httpbin.org/404',{
            method:'CONNECT',
            path:`${target.hostname}:${target.port}`,
            headers:{Host: `${target.hostname}:${target.port}`, Connection:'keep-alive', 'Proxy-Authorization': proxy.auth??''},
            /** @type {(options: http.ClientRequestArgs, oncreate: (err: Error, socket: net.Socket) => void) => net.Socket}*/
            createConnection:()=>prevLayer
        }, res));
        if(res.statusCode !== 200) throw new Error('Connection failed')
        return res.socket;
    }
    else throw new Error('Unsupported proxy type');
}
/**
 * @param {ProxyOptions} proxy
 * @param {Target} next
 * @return {Promise<net.Socket>}
 */
async function createBaseLayer(proxy, next){
    if(proxy.type == 'ws'){
        let ws = new WebSocket(`wss://${proxy.hostname}:${proxy.port}`);
        return await initWSproxy(ws, next, proxy.auth);
    }
    else if(proxy.type == 'http'){
        let req = http.request({
            method:'CONNECT',
            path: `${next.hostname}:${next.port}`,
            host: proxy.hostname,
            port: proxy.port,
            headers:{Host: `${next.hostname}:${next.port}`, 'Proxy-Authorization': proxy.auth??''}
        });
        req.end();
        let [socket, head] = await new Promise(resolve=>req.on('connect', (_, socket, head)=>resolve([socket, head])));
        // if(!head.toString('utf8').startsWith('200 ')) throw new Error('Connection failed');
        return socket;
    }
    else throw new Error('Unsupported proxy type')
}

/**
 * 
 * @param {WebSocket} ws 
 * @param {string} [auth]
 * @param {Target} target 
 * @returns {Promise<net.Socket>}
 */
async function initWSproxy(ws, target, auth=''){
    let newStream = new net.Socket();
    await new Promise(res=>ws.once('open', res));
    ws.send(JSON.stringify({auth, ...target}));
    const message = await new Promise(res=>ws.once('message', res));
    if(message.toString('utf8') !== 'ok'){
        newStream.emit('error', message)
    }
    // modifying the info
    newStream._write = (chunk, _, cb)=>{
        ws.send(chunk, cb);
    }
    newStream._writev = (chunks, cb)=>{
        let iter = chunks[Symbol.iterator]();
        function send(){
            let {done, value: {chunk}} = iter.next();
            ws.send(chunk, (err)=>{
                if(done || err) cb(err);
                else send()
            })
        }
        send();
    }
    newStream._read = ()=>{}
    ws.on('message', (data)=>{
        if(data instanceof Buffer || data instanceof ArrayBuffer) {
            newStream.push(new Uint8Array(data))
        }
        else newStream.push(Buffer.concat(data.map(a=>{
            return new Uint8Array(a)
        })))
    })
    newStream._final = cb=>{ ws.ping(JSON.stringify({op:'DATA_END', data:''}), undefined, cb); }
    ws.on('error', e=>newStream.emit('error', e));
    return newStream;
}
/**
 * @template T array input type
 * @template U output array type
 * @param {T[]} array 
 * @param {(value:T, index: number, array: T[], mapped: U[])=>Promise<U>} predicate
 * @returns {Promise<U[]>}
 */
 async function asyncMap(array, predicate){
    let newArr = [];
    for(let i = 0; i < array.length; i++){
        let t = array[i];
        newArr.push(await predicate(t, i, array, newArr));
    }
    return newArr;
}

module.exports = async function createProxyTunnel(proxies, {hostname, port}){
    if(proxies.length == 0) throw new Error('Need at least two proxies!');
    let tunnels = await asyncMap(proxies, (proxy, index, proxies, layers)=>{
        if(index == 0) return createBaseLayer(proxies[0], proxies[1] || {hostname, port});
        else return nextLayer(layers[index-1], proxy, proxies[index+1] || {hostname, port})
    });
    return tunnels[proxies.length - 1];
}