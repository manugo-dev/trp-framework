fx_version "cerulean"
game "gta5"

name "rpjs-bridge"
description "Roleplay Javascript Framework Bridge for ESX/QBCore"
version "1.0.0"

dependencies {
    "rpjs-core"
}

client_script {
    "client/**/*.js"
}

server_script {
    "server/**/*.js"
}

shared_script {
    "shared/**/*.js"
}

node_version "22"
