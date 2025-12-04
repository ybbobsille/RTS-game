import wrtc from "@roamhq/wrtc";
import readline from "node:readline";
import { WebSocket } from "ws";
import fs from "node:fs";

var Base64 = {

    ALPHA: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    encode: function (value) {

        if (typeof (value) !== 'number') {
            throw 'Value is not number!';
        }

        var result = '', mod;
        do {
            mod = value % 64;
            result = Base64.ALPHA.charAt(mod) + result;
            value = Math.floor(value / 64);
        } while (value > 0);

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
var room_id = null
const users = []
const users_connections = {}

async function Game_Loop() {
    global.tick_duration = 0
    global.tick_index = 0
    global.users = users
    global.users_connections = users_connections
    global.engine_store = {}
    console.log("Loading scripts...")
    var files = fs.readdirSync("./scripts")
    console.log("Scripts found:", files.join(", "))
    var scripts = []
    for (var file of files) {
        const fp = "./scripts/" + file
        const module = await import(fp);
        console.log("Loaded:", fp);
        if (typeof module.init === "function") {
            await module.init();
        }
        scripts.push(module)
    }
    console.log("All scripts have loaded!")

    //wait for all users to be ready
    await new Promise((resolve) => {
        const check = () => {
            for (var key of Object.keys(users_connections)) {
                if (users_connections[key].status == false) {
                    setTimeout(check, 500)
                    return
                }
            }
            resolve()
        }
        check()
    })

    Object.values(users_connections).forEach(user => {
        user.channel.send(JSON.stringify({
            Game_Start:true
            //FIXME: send game ui logic over the connection so the user can load it.
        }))
    })

    const internal_tick = async () => {
        const tick_start = Date.now()
        global.tick_index += 1
        try {
            for (var script of scripts) {
                if (typeof script.tick == "function") {
                    await script.tick()
                }

                if (script._render_to_file) script._render_to_file("./out.bmp")
            }
        }
        catch (e) {
            console.log(e)
        }
        global.tick_duration = Date.now() - tick_start
    }
    const tick = setInterval(internal_tick, 1000 / global.Game_Settings.tick_rate)
    setTimeout(() => {
        console.log("Game Started!")
        global.game_started = true
    }, global.Game_Settings.start_counter * 1000)
}

async function Handle_RTC_Data(event) {
    console.log(event.data)
}

async function Connect_To_User(user_id, socket) {
    users_connections[user_id] = {
        status:false
    }
    const pc = new wrtc.RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    global.pc = pc
    users_connections[user_id].pc = pc

    const channel = pc.createDataChannel("data");
    channel.addEventListener("message", Handle_RTC_Data)
    users_connections[user_id].channel = channel;

    pc.oniceconnectionstatechange = () => {
      console.log("ICE:", user_id, pc.iceConnectionState);
      users_connections[user_id].status = pc.iceConnectionState == "connected"

      if (pc.iceConnectionState == "connected") {
        socket.close()
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(JSON.stringify({
          bypass:{
            RTC: {
                candidate: event.candidate
            }
          },
          user_id:user_id
        }));
      }
    };

    socket.on("message", async (data) => {
        const msg = JSON.parse(data)
        
        if (msg.RTC && msg.user_id == user_id) {
            if (msg.RTC.answer) {
                await pc.setRemoteDescription(msg.RTC.answer);
                console.log("Answer applied for", user_id);
            }
            if (msg.RTC.candidate) {
              await pc.addIceCandidate(msg.RTC.candidate);
            }
        }
    })

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.send(JSON.stringify({
        bypass:{
            room_start:true
        },
        user_id:user_id
    }))
    socket.send(JSON.stringify({
        bypass:{
            RTC:{
                offer:offer
            }
        },
        user_id:user_id
    }))
}

function Handle_Answer(code) {
    const ip = code.split("_")[0].split("-").map(p => Base64.decode(p)).join(".")
    const port = code.split("_")[1].split("").map(p => Base64.decode(p)).join("")
    return { ip, port }
}

function start({ ip, port }) {
    console.log(`Connecting to ${ip}:${port}`)
    const socket = new WebSocket(`ws:${ip}:${port}`)
    socket.on("message", async (event) => {
        const msg = JSON.parse(event)

        if (msg.msg) {
            console.log("Incoming message: '", msg.msg, "'")
        }
        if (msg.user_joined) {
            console.log("New user:", msg.user_joined)
            users.push(msg.user_joined)
        }
        if (msg.host_confirmed) {
            console.log("Hosting game with room id:", msg.host_confirmed)
            room_id = msg.host_confirmed
        }
        if (msg._TEMP_start_room) {
            users.forEach(user_id => {
                Connect_To_User(user_id, socket)
            })
            Game_Loop()
        }
    })

    socket.on("open", () => {
        socket.send(JSON.stringify({ "register_host": true }))
    })
}

global.Game_Settings = {
    start_counter:10,
    tick_rate:10
}

Game_Loop()
    .catch(e => console.error(e))
//start(Handle_Answer("B/-A-A-B_IAIA"))
//const rl = readline.createInterface({
//    input: process.stdin,
//    output: process.stdout,
//})
//rl.question("Enter Connection code: ", (answer) => start(Handle_Answer(answer)));