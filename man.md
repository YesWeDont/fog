# fog(1) man page
## Name
**fog** - Robust composition of proxies, much like function composition: f∘g(x)=f(g(x)).
## Synopsis
**fog** [**-h** | **--help**]

**fog** [**-v** | **--verbose**] [$**-p** | **--port** PORT] [**-c** | **--config** FILE] [**-t** | **--threads** THREAD_COUNT] [**-a** | **--auth** HEADER] [**-s** | **--admin-secret** SECRET] [SERVER_TYPE]
## Description
**fog** chains multiple proxies together and hosts the result of 'composing' these proxies together on a local machine. Alternatively it can also host `scifin` proxies.

Options that **fog** understands:
- **-h** | **--help** Display this help page
- **-v** | **--verbose** Produce more detailed logs
- **-p** | **--port** PORT Selects which port the resultant server is hosted on. Defaults to random port.
- **-c** | **--config** FILE (fog only) Select the proxy config file for fog server
- **-t** | **--threads** THREAD_COUNT Set the number of threads used by the server instance. Defaults to 2 threads.
- **-a** | **--auth** HEADER Only allow requests containing Proxy-Authorization header with the specified contents
- **-s** | **--admin-secret** SECRET (SciFin only) Allow the server to be shut down remotely.

[SERVER_TYPE]
The type of server being hosted, either `fog` or `scifin`, defaults to `fog` if not provided.

Examples:
- **fog** # Hosts a direct HTTP proxy server on a random port
- **fog** -vvc ./config.json -p1080 fog # Host a fog server with servers defined by `config.json`, very verbose, on port 1080
- **fog** scifin # Hosts a scifin server on a random port