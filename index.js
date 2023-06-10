let server = require('http').createServer((req, res)=>{
    let host_url = new URL(req.url, "localhost:80");
    let port = host_url.port ? host_url.port : ({
        ftp:'21',
        http:'80',
        https:'443',
        ws:'80',
        wss:'443',
    }[host_url.protocol.replace(':', '')] || '80');
    let host = host_url.hostname + ":" + port;
    console.log("foreign target host", host);
    let foreign = require('net').createConnection({
        host: host_url.hostname,
        port: host_url.port || 80
    });
    foreign.on('connect', ()=>{
        foreign.once('data', data=>{
            console.log('response', data.toString());
            let str = data.toString('utf-8');
            if(str.startsWith(`HTTP/${req.httpVersion} 200`)){
                let headers_string = '';
                for(let header in req.headers){
                    headers_string+=`${header}: ${req.headers[header]}\r\n`;
                };
                // GET google.com HTTP/1.1 \r\n User-Agent:curl/7.8.2
                foreign.write(`${req.method} ${host_url.pathname} HTTP/${req.httpVersion}\r\n${headers_string}\r\n`);
                req.pipe(eqProxy, {end: false});
                eqProxy.pipe(res, {end: true});
            }else {
                res.writeHead(400, "Connection rejected").end();
            }
        });
    })
});
server.on("connect", (req, client, head)=>{
    //todo
})
server.listen(8000, '0.0.0.0', ()=>console.log("Server on 5775"));
