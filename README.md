botis
=====
A GitHub bot for setting reminders on stuff.

![screenshot](/screenshot.png)

## Usage
**botis** is a tiny command-line application. A very small web-service. It
requires a RedisDB instance to be running with `--notify-keyspace-events Ex`:
```bash
redis-server --notify-keyspace-events Ex
```

Its usage message is reasonably self-explicative:
```

  Usage: botis [options]

  Options:

    -h, --help                         output usage information
    -r, --repo <repo>                  The repository to watch
    -u, --user <user>                  The bot's user name
    -t, --token <token>                A GitHub API token
    -p, --redis-port [port=6379]       A RedisDB port
    -h, --redis-host [host=localhost]  A RedisDB host
    -l, --labels <labels ...>          The issue labels to consider

```

## Library Usage
The core logic is also exported as library. It's all documented, so I recomment
you to [read the JSDoc annotations in the code](https://github.com/yamadapc/botis/blob/master/lib/index.js).

## License
This code is licensed under the MIT license for Pedro Tacla Yamada. For more
information please refer to the [LICENSE](/LICENSE) file.
