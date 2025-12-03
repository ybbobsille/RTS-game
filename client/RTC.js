async function Handle_RTC_Data(event) {
  RTC_log(event.data)
}

async function Connect_To_Host(socket) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pc.oniceconnectionstatechange = () =>
      RTC_log("ICE: " + pc.iceConnectionState);
    globalThis.pc = pc
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      globalThis.channel = channel; // expose for console testing
      channel.onmessage = Handle_RTC_Data;
      socket.close()

      RTC_log("Client DataChannel Ready: " + channel.readyState);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(JSON.stringify({
          bypass:{
            RTC:{
                candidate: event.candidate
            },
            user_id:window.user_id
          },
          room:window.room
        }));
      }
    };
    socket.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        RTC_log("Signal:" + JSON.stringify(msg))

        if (msg.RTC) {
            if (msg.RTC.offer) {
                await pc.setRemoteDescription(msg.RTC.offer);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                socket.send(JSON.stringify({
                    bypass: {
                        RTC:{
                            answer:answer
                        },
                        user_id:window.user_id
                    },
                    room:window.room
                }))
            }
            if (msg.RTC.candidate) {
                await pc.addIceCandidate(msg.RTC.candidate);
            }
        }
    }
}

function RTC_log(msg) {
    console.log("RTC:", msg)
    document.getElementById("RTClog").value += msg + "\n";
}