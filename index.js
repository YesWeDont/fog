import { print } from './logger.js';
import { manageThreads } from './threadManager.js';

const serverType = process.argv[2];
if(serverType == 'scifin'){
    print(['startup'], 'Loading SciFin server...');
    manageThreads('./servers/scifin/scifin_server.js');
}
else if(serverType == 'fog' || serverType == 'client' || !serverType) {
    if(!serverType) print({level: 1}, 'No server type provided, defaulting to fog...');
    print(['startup'], 'Loading fog server...');
    manageThreads('./servers/fog/fog_server.js');
}
else throw new Error('Unrecognised server type')