module.exports = {
    "apps": [
        {
            "name"        : "subbridge-metrics",
            "script"      : "index.js",
            "args"        : [],
            "watch"       : true,
            "merge_logs"  : true,
            "autorestart" : true,
            "exec_mode"   : "cluster",
            "env": {
                "NODE_ENV"              : "production",
                "ONFINALITY_API_KEY"    : "",
                "INFURA_API_KEY"        : "",
                "PORT"                  : "3001",
                "UPDATE_INTERVAL"       : "30000"
            },
            "log_date_format": "YYYY-MM-DD HH:mm:ss",
            "error_file" : "err.log",
            "out_file"   : "out.log",
            "pid_file"   : "info.pid"
        },
    ]
}