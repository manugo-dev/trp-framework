fx_version "cerulean"
game "gta5"

name "rpjs-core"
description "Roleplay Javascript Framework Core"
version "1.0.0"

dependencies {
    "rpjs-config"
}

client_script {
    "config/database.js",
    "dist/client/**/*.js"
}

server_script {
    "dist/server/**/*.js"
}

shared_script {
    "shared/**/*.js"
}

node_version "22"
