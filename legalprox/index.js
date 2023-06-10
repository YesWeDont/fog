// @ts-check

const ws = require('ws');
const net = require('net');
const PORT = process.env.PORT || 8000;

const server = process.env.NODE_ENV == 'production' ?
    require('http').createServer() :
    require('./createDevServer')();

server.listen(PORT, ()=>console.log(`Server up at port ${PORT}`));

const wss = new ws.WebSocketServer({server});

function suppressedJSONParse(str){
    try{return JSON.parse(str)}
    catch(e){return undefined}
}
wss.on('connection', async conn=>{
    // wait for and decipher opening message
    /** @type {ws.RawData} */
    const message = await new Promise(res=>conn.once('message', res));
    const parsed = suppressedJSONParse(message.toString('utf8'));
    if(!parsed){
        console.error('A client provided invalid JSON or an invalid opening packet.');
        return conn.close(1003, 'INVALID_DATA: Provide a JSON value with auth, port and host.')
    }
    const {hostname: host, port, auth} = parsed;
    const target = `${host}:${port}`;

    // data checking
    if(auth !== (process.env.AUTH || '')) {
        console.error('A client provided invalid credentials.');
        return conn.close(1002, 'INVALID_AUTH')
    }
    // there is no need to call the full cleanup here since foreign is not set up yet.
    if(!host || !port) {
        console.error('A client provided an invalid opening message. Either port or host was missing.');
        return conn.close(1003, 'INVALID_DATA: Expected both hostname and port in opening message');
    }
    
    // connect to target host
    let foreign;
    try{
        foreign = net.createConnection({host, port});
        conn.once('close', destroy)
        conn.once('error', error);
        foreign.once('close', destroy);
        foreign.once('error', error);
        await new Promise(res=>foreign.once('connect', res));
    }catch(e){
        console.error(`${e.message} when connecting to target ${target}`)
        conn.send(e.message);
        return conn.close(1000, 'CONNECTION_ERROR');
    }

    conn.send('ok');

    // bind event listeners
    function handleMessage(data){
        if(data instanceof Buffer || data instanceof ArrayBuffer) foreign.write(new Uint8Array(data))
        else foreign.write(new Uint8Array(Buffer.concat(data)))
    }
    function pipeData(data){conn.send(data)}
    function handlePing(buf){
        let {op} = JSON.parse(buf.toString());
        if(op == 'DATA_END') foreign.end();
        else if(op == 'CLOSE') {
            foreign.destroy();
            return conn.close();
        }
        conn.pong('ok');
    }
    conn.on('message', handleMessage);
    conn.on("ping", handlePing);
    foreign.on('data', pipeData);

    // cleanup
    function destroy(){
        if(conn.readyState !== conn.CLOSING && conn.readyState !== conn.CLOSED) conn.close();
        conn.off('message', handleMessage);
        conn.off('ping', handlePing);
        conn.off('close', destroy);
        conn.off('error', error);
        // @ts-ignore this is done after socket is closed to avoid memory leak
        conn = null;

        foreign.off('data', pipeData);
        foreign.off('close', destroy);
        foreign.off('error', error)
        foreign.destroy();
        foreign = null
    }

    function error(e){
        console.error(`${e.message} when tunneling request to ${target}`);
        destroy();
    }
});