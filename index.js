import simpleSocks from 'simple-socks';
import {createServer} from 'http';
const server = simpleSocks.createServer().listen(5775);
const dummyServer = createServer((req, res)=>res.end("Invalid credentials. Try again")).listen(8080);