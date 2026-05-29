const mediaBox = document.getElementById("mediaBox");
const thumbnail = document.getElementById("thumbnail");
const video = document.getElementById("video");
const statusText = document.getElementById("status");
const statusIcon = document.getElementById("statusIcon");

let isPlaying = false;

let pc = null;
let localStream = null;
let remoteAudio = null;

mediaBox.addEventListener("click", async () => {
  if (!isPlaying) {
    await startApp();
  } else {
    stopApp();
  }
});

async function startApp() {
  try {
    updateStatus("準備中です...", "loading");

    // 動画を表示して再生
    thumbnail.style.display = "none";
    video.style.display = "block";
    video.currentTime = 0;
    await video.play();

    updateStatus("マイク許可を待っています...", "loading");

    // Realtime API 音声会話開始
    await startRealtime();

    isPlaying = true;
    updateStatus("くろおにくんに話しかけてください！", "active");

  } catch (error) {
    console.error(error);

    updateStatus(
      "開始に失敗しました。マイク許可やAPIキーを確認してください。",
      "error"
    );

    video.pause();
    video.currentTime = 0;
    video.style.display = "none";
    thumbnail.style.display = "block";

    stopRealtime();
    isPlaying = false;
  }
}

function stopApp() {
  // 動画停止
  video.pause();
  video.currentTime = 0;
  video.style.display = "none";
  thumbnail.style.display = "block";

  // Realtime API 停止
  stopRealtime();

  isPlaying = false;
  updateStatus("画像をタップしてください", "idle");
}

async function startRealtime() {
  updateStatus("AIと接続中です...", "loading");

  // WebRTC接続を作成
  pc = new RTCPeerConnection();

  // AIの音声を再生するaudio要素
  remoteAudio = document.createElement("audio");
  remoteAudio.autoplay = true;
  document.body.appendChild(remoteAudio);

  pc.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
  };

  updateStatus("マイク許可を待っています...", "loading");

  // マイク入力を取得
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true
  });

  updateStatus("AIと接続中です...", "loading");

  const audioTrack = localStream.getAudioTracks()[0];
  pc.addTrack(audioTrack, localStream);

  // Realtime APIのイベント送受信用
  const dataChannel = pc.createDataChannel("oai-events");

  dataChannel.addEventListener("open", () => {
    console.log("Realtime API connected");

    // 固定の最初の一言は送らない
    // ユーザーが話しかけたときだけAIが返答する
    updateStatus("会話できます。話しかけてください。", "active");
  });

  dataChannel.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    console.log("OpenAI event:", data);
  });

  // SDP offer作成
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // 自分のサーバーへSDPを送る
  const sdpResponse = await fetch("/session", {
    method: "POST",
    body: offer.sdp,
    headers: {
      "Content-Type": "application/sdp"
    }
  });

  if (!sdpResponse.ok) {
    const errorText = await sdpResponse.text();
    throw new Error(errorText);
  }

  const answerSdp = await sdpResponse.text();

  await pc.setRemoteDescription({
    type: "answer",
    sdp: answerSdp
  });
}

function stopRealtime() {
  // マイク停止
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      track.stop();
    });
    localStream = null;
  }

  // WebRTC接続停止
  if (pc) {
    pc.close();
    pc = null;
  }

  // AI音声再生用audioを削除
  if (remoteAudio) {
    remoteAudio.remove();
    remoteAudio = null;
  }
}

function updateStatus(text, type) {
  // 文字表示を更新
  if (statusText) {
    statusText.textContent = text;
  }

  // statusIcon がHTMLに無い場合でも止まらないようにする
  if (!statusIcon) {
    console.warn(
      "statusIcon が見つかりません。index.html に id='statusIcon' があるか確認してください。"
    );
    return;
  }

  statusIcon.classList.remove("idle", "loading", "active", "error");
  statusIcon.classList.add(type);
}