// @ts-check

const ws = require('ws');
const CLOSED_REASONS = {
    1000: 'FINISHED',
    1001: 'LEAVING',
    1002: 'PROTOCOL_ERROR',
    1003: 'INVALID_DATA',
    1004: 'UNKNOWN',
    1005: 'NO_REASON',
    1006: 'TERMNINATED',
    1007: 'INCONSISTENT_DATA',
    1008: 'VIOLATED_POLICY',
    1009: 'TOO_BIG',
    1010: 'NO_NEGO',
    1011: 'UNEXPECTED_ERROR',
    1015: 'TLS_HANDSHAKE_FAILED'
}

const net = require('net');
const server = require('http').createServer();

server.listen(process.env.PORT || 8000);

const wss = new ws.WebSocketServer({server});
wss.on('connection', async conn=>{
    /** @type {ws.RawData} */
    const message = await new Promise(res=>conn.once('message', res));
    const {hostname: host, port, auth} = JSON.parse(message.toString('utf8'));
    if(auth !== (process.env.AUTH || '')) return conn.close(1002, 'INVALID_AUTH');

    const foreign = net.createConnection({host, port});
    await new Promise(res=>foreign.once('connect', res));

    conn.send('ok');

    conn.on('message', data=>{
        if(data instanceof Buffer || data instanceof ArrayBuffer) foreign.write(new Uint8Array(data))
        else foreign.write(new Uint8Array(Buffer.concat(data)))
    });
    conn.on("ping", buf=>{
        let {op, data} = JSON.parse(buf.toString());
        if(op == 'DATA_END') foreign.end();
        else if(op == 'CLOSE') {
            foreign.destroy();
            return conn.close();
        }
        conn.pong('ok');
    });
    conn.on('close', (code, reason)=>foreign.destroy(new Error(`${CLOSED_REASONS[code]}: ${reason}`)))
    conn.on('error', e=>{
        console.error(e);
        foreign.destroy();
    });

    foreign.on('data', data=>conn.send(data));
    foreign.on('close', isErr=>conn.close());
    foreign.on('error', e=>{
        console.error(e);
        conn.close(1000, e.toString())
    });
})