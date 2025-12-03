import { WebSocketServer, WebSocket } from "ws";
import readline from "node:readline";
import { strict } from "node:assert";

const port = 8080
const hosts = new Map()
const users = new Map()
const user_sockets = new Map()

var Base64 = {

    ALPHA: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    encode: function (value) {

        if (typeof(value) !== 'number') {
            throw 'Value is not number!';
        }

        var result = '', mod;
        do {
            mod = value % 64;
            result = Base64.ALPHA.charAt(mod) + result;
            value = Math.floor(value / 64);
        } while(value > 0);

        return result;
    },

    decode: function (value) {

        var result = 0;
        for (var i = 0, len = value.length; i < len; i++) {
            result *= 64;
            result += Base64.ALPHA.indexOf(value[i]);
        }

        return result;
    },
};

function Generate_Host_Id() {
    var id = null
    const Chars = "qwertyuiopasdfghjklzxcvbnmm"
    while (id == null) {
        id = ""
        for (var i=0; i < 10; i++) id += Chars.charAt(Math.round(Math.random() * Chars.length))
        if (hosts.has(id)) {
            id = null
        }
    }
    return id
}

function Generate_User_Id() {
    var id = null
    const Chars = "qwertyuiopasdfghjklzxcvbnmm"
    while (id == null) {
        id = ""
        for (var i=0; i < 10; i++) id += Chars.charAt(Math.round(Math.random() * Chars.length))
        if (users.has(id)) {
            id = null
        }
    }
    return id
}

function Handle_Answer(answer) {
    answer = answer.trim()
    if (answer.match(/\d+\.\d+\.\d+\.\d+/) == null) {
        throw new Error("Ip must match: 'x.x.x.x'")
    }
    const parts = answer.split(/\./g)
    console.log(`\n\n\n\n\nConnection code: ${
        parts.map(p => Base64.encode(parseInt(p))).join("-")
    }_${
        `${port}`.split("").map(p => Base64.encode(parseInt(p))).join("")
    }`)
    return answer
}

function start(ip) {
    rl.close();

    const wss = new WebSocketServer({ port: port });

    console.log(`Signaling server running on ws://${ip}:${port}`);

    wss.on("connection", (socket) => {
        console.log("Client connected");

        function Remove_User(user_id) {

        }

        socket.on("message", (data) => {
            const msg = JSON.parse(data)
            if (msg.msg) console.log("incoming message: '", msg.msg, "'")

            if (msg.register_host) {
                const id = Generate_Host_Id()
                hosts.set(id, {
                    "users":[],
                    "socket":socket,
                    ...msg.register_host
                })
                socket.send(JSON.stringify({host_confirmed: id}))
            }
            if (msg.register_user) {
                const id = Generate_User_Id()
                users.set(id, {
                    "socket":socket
                }),
                user_sockets.set(socket, id)
                console.log(`Registered user: ${id}`)
                socket.send(JSON.stringify({user_confitmed: id}))
            }
            if (msg.user_join_room) {
                if (!hosts.has(msg.user_join_room)) socket.send(JSON.stringify({room_joined:false}))
                const room_host = hosts.get(msg.user_join_room)
                const room_socket = room_host.socket
                const user_id = user_sockets.get(socket)
                users.get(user_id).room = msg.user_join_room
                
                room_host.users.push(user_id)
                room_socket.send(JSON.stringify({user_joined: user_id}))
                socket.send(JSON.stringify({room_joined:true}))
            }
            if (msg._TEMP_start_room) { // used to start the game from the client
                if (!hosts.has(msg._TEMP_start_room)) {
                    socket.send(JSON.stringify({_TEMP_room_start_failed:false}))
                    return
                }
                const room_host = hosts.get(msg._TEMP_start_room)
                const room_socket = room_host.socket
                room_socket.send(JSON.stringify({_TEMP_start_room:true}))
            }
            if (msg.room_start) {
                const room_host = hosts.get(msg.room_start)
                room_host.users.forEach(user_id => {
                    if (!users.has(user_id)) return
                    const user = users.get(user_id)
                    const user_socket = user.socket
                    if (!user_socket.OPEN) return Remove_User()
                    user_socket.send(JSON.stringify({room_start:true}))
                })
            }
            if (msg.bypass) {
                if (msg.user_id) {
                    const user_id = msg.user_id
                    if (!users.has(user_id)) return
                    const user_socket = users.get(user_id).socket
                    if (!user_socket.OPEN) return Remove_User()
                    user_socket.send(JSON.stringify(msg.bypass))
                }
                else if (msg.room) {
                    if (!hosts.has(msg.room)) return
                    const host_socket = hosts.get(msg.room).socket
                    if (!host_socket.OPEN) return Remove_User()
                    host_socket.send(JSON.stringify(msg.bypass))
                }
            }
        });

        socket.send(JSON.stringify({ "msg": "Hello world!" }))
    });
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})
rl.question("Enter Radmin ip: ", (answer) => start(Handle_Answer(answer)));
