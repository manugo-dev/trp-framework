fx_version "cerulean"
game "gta5"

name "rpjs-core"
description "Roleplay Javascript Framework Core"
version "1.0.0"

dependencies {
    "/onesync"
}

shared_script {
    "dist/shared/**/*.js"
}

client_script {
    "config/database.js",
    "dist/client/**/*.js"
}

server_script {
    "dist/server/**/*.js"
}

files {
    "dist/nui/index.html",
    "dist/nui/css/**/*",
    "dist/nui/js/**/*",
    "dist/nui/img/**/*",
    "dist/nui/assets/**/*"
}

ui_page "dist/nui/index.html"

node_version "22"
