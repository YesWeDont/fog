import type {
    IncomingMessage as _IncomingMessage,
    ServerResponse as _ServerResponse,
    RequestListener, Server as HTTPServer
} from 'node:http';
import { Server as HTTPSServer, ServerOptions } from 'node:https';
type IncomingMessage = typeof _IncomingMessage;
type ServerResponse = typeof _ServerResponse;
export type Config = {
    serverConfig: Proxy[],
    sslConfig:{
        key: Buffer|undefined,
        cert: Buffer|undefined
    }
}
export type Target = { hostname: string, port: number };
export type Proxy = Target & { tls?: boolean, ssl?: boolean, authorization?: string, type: 'http' | 'scifin' }
export type ServerCreator = (options: ServerOptions<IncomingMessage, ServerResponse>, requestListener: RequestListener<IncomingMessage, ServerResponse>) =>
    HTTPServer | HTTPSServer;
export type PrintOptions = { level?: number, wid?: number|boolean|string, lenient?: boolean };