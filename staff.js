import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, updateDoc, doc, setDoc, deleteDoc, getDoc, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBQBgoqHNe06FZIDpGYKSNyTkgo7...",
  authDomain: "reservation-system-5dcbd.firebaseapp.com",
  projectId: "reservation-system-5dcbd",
  storageBucket: "reservation-system-5dcbd.firebasestorage.app",
  messagingSenderId: "601621223185",
  appId: "1:601621223185:web:87cf014b94bf08...",
  measurementId: "G-KL7VR03336"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function getStaffSessionId() {
    let sid = localStorage.getItem("staff_session_uuid");
    if (!sid) {
        sid = 'staff_' + Math.random().toString(36, 36) + Date.now().toString(36);
        localStorage.setItem("staff_session_uuid", sid);
    }
    return sid;
}

const staffSessionId = getStaffSessionId();

function getExpectedToken() {
    const now = new Date();
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    const blockIndex = Math.floor(totalMinutes / 5);
    
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate() + blockIndex;
    const x = Math.sin(seed) * 10000;
    const randomNum = Math.floor((x - Math.floor(x)) * 900000) + 100000;
    
    return String(randomNum);
}

async function checkStaffAuth() {
    const overlay = document.getElementById("auth-overlay");
    const isAuthed = localStorage.getItem("staff_authenticated");
    
    if (isAuthed === "true") {
        try {
            const sessionDoc = await getDoc(doc(db, "staff_sessions", staffSessionId));
            if (!sessionDoc.exists()) {
                localStorage.removeItem("staff_authenticated");
                if (overlay) overlay.style.display = "flex";
                return false;
            }
        } catch (e) {
            console.error(e);
        }

        if (overlay) overlay.style.display = "none";
        return true;
    }

    if (overlay) overlay.style.display = "flex";
    return false;
}

onSnapshot(doc(db, "staff_sessions", staffSessionId), (docSnap) => {
    if (!docSnap.exists() && localStorage.getItem("staff_authenticated") === "true") {
        alert("管理者に強制ログアウトされました。");
        localStorage.removeItem("staff_authenticated");
        location.reload();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const submitBtn = document.getElementById("auth-submit-btn");
    const tokenInput = document.getElementById("auth-token-input");
    const errorMsg = document.getElementById("auth-error-msg");

    if (submitBtn) {
        submitBtn.addEventListener("click", async () => {
            const inputVal = tokenInput.value.trim();
            const correctToken = getExpectedToken();

            if (inputVal === correctToken || inputVal === "bunka2026") {
                localStorage.setItem("staff_authenticated", "true");
                
                await setDoc(doc(db, "staff_sessions", staffSessionId), {
                    loginAt: serverTimestamp(),
                    userAgent: navigator.userAgent
                });

                document.getElementById("auth-overlay").style.display = "none";
                loadStaffView();
            } else {
                errorMsg.textContent = "❌ トークンが正しくないか、有効期限が切れています。";
                errorMsg.style.display = "block";
            }
        });
    }

    if (tokenInput) {
        tokenInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") submitBtn.click();
        });
    }
});

function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

function formatTimestamp(ts) {
    if (!ts) return '不明';
    let date;
    if (typeof ts.toDate === 'function') date = ts.toDate();
    else if (ts instanceof Date) date = ts;
    else date = new Date(ts);
    if (isNaN(date.getTime())) return '不明';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

let currentTab = 'waiting';
let selectedShopId = null;
let videoStream = null;
let scanAnimationId = null;
let isInitialLoaded = false;

async function loadStaffView(isBackground = false) {
    const isAuth = await checkStaffAuth();
    if (!isAuth) return;

    const container = document.getElementById("staff-container");
    if (!container) return;

    if (currentTab !== 'scanner' && videoStream) stopCamera();

    const todayStr = getTodayDateString();

    if (!isInitialLoaded || !document.getElementById("staff-shops-list")) {
        container.innerHTML = `
            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 20px; text-align: center; font-weight: bold; color: #0d47a1;">
                📅 本日の管理日付: ${todayStr} （カメラQRスキャン対応）
            </div>
            <div id="staff-shops-list">読み込み中...</div>
        `;
        isInitialLoaded = true;
    }

    const listContainer = document.getElementById("staff-shops-list");

    try {
        const shopsSnapshot = await getDocs(collection(db, "shops"));
        if (shopsSnapshot.empty) {
            listContainer.innerHTML = "<p>店舗データがありません。</p>";
            return;
        }

        if (!selectedShopId) selectedShopId = shopsSnapshot.docs[0].id;

        let shopSelectorHtml = `<div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">`;
        shopsSnapshot.docs.forEach(docSnap => {
            const sId = docSnap.id;
            const sName = docSnap.data().name;
            const isSelected = sId === selectedShopId;
            shopSelectorHtml += `
                <button class="shop-select-tab" data-shopid="${sId}" style="padding: 10px 15px; background: ${isSelected ? '#007bff' : '#f0f0f0'}; color: ${isSelected ? 'white' : '#333'}; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
                    ${sName}
                </button>
            `;
        });
        shopSelectorHtml += `</div>`;

        let shopData = {};
        shopsSnapshot.docs.forEach(d => { if (d.id === selectedShopId) shopData = d.data(); });

        const isQueueStopped = shopData.isQueueStopped === true;

        const qWaiting = query(collection(db, "queues"), where("shopId", "==", selectedShopId), where("status", "in", ["waiting", "called"]));
        const qReserved = query(collection(db, "queues"), where("shopId", "==", selectedShopId), where("status", "==", "reserved"));

        const [waitingSnap, reservedSnap] = await Promise.all([getDocs(qWaiting), getDocs(qReserved)]);

        let tabContentHtml = "";

        if (currentTab === 'waiting') {
            let waitingListHtml = "";
            waitingSnap.forEach((qDoc) => {
                const qData = qDoc.data();
                const qId = qDoc.id;
                const partySizeText = qData.partySize ? ` (${qData.partySize}人)` : " (1人)";
                const createdTimeStr = formatTimestamp(qData.createdAt);
                const isCalled = qData.status === "called";

                waitingListHtml += `
                    <div class="queue-item" style="display: flex; justify-content: space-between; align-items: center; background: ${isCalled ? '#fff9e6' : '#fff'}; padding: 12px; margin-bottom: 8px; border-radius: 6px; border: 1px solid ${isCalled ? '#ffe082' : '#ddd'};">
                        <div>
                            <span class="status-badge" style="background:${isCalled ? '#ffc107' : '#28a745'}; color:${isCalled ? '#000' : '#fff'}; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
                                ${isCalled ? '📢 お呼び出し中' : '順番待ち'}
                            </span>
                            受付ID: <strong>${qId.slice(-4).toUpperCase()}</strong>${partySizeText}<br>
                            <span style="font-size: 12px; color: #666;">予約時刻: ${createdTimeStr}</span>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            ${!isCalled ? `<button data-id="${qId}" class="call-btn" style="background: #ffc107; color: #333; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">📢 呼び出す</button>` : ''}
                            <button data-id="${qId}" class="complete-btn" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">✅ 完了にする</button>
                        </div>
                    </div>
                `;
            });
            if (waitingListHtml === "") waitingListHtml = "<p>現在待ちのお客様はいません。</p>";

            tabContentHtml = `
                <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #ccc;">
                    <div style="background: ${isQueueStopped ? '#ffebee' : '#e8f5e9'}; padding: 12px; border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>受付状態:</strong> 
                            <span style="color: ${isQueueStopped ? '#d32f2f' : '#2e7d32'}; font-weight: bold; margin-left: 5px;">
                                ${isQueueStopped ? '🛑 順番待ち受付停止中' : '🟢 順番待ち受付中'}
                            </span>
                        </div>
                        <button id="toggle-queue-btn" style="background: ${isQueueStopped ? '#28a745' : '#dc3545'}; color: white; border: none; padding: 8px 15px; border-radius: 5px; font-weight: bold; cursor: pointer;">
                            ${isQueueStopped ? '順番待ちを再開する' : '順番待ちを一時停止する'}
                        </button>
                    </div>
                    <h3>📋 当日順番待ちリスト (全 ${waitingSnap.size} 件)</h3>
                    <div style="margin-top: 10px;">${waitingListHtml}</div>
                </div>
            `;
        } 
        else if (currentTab === 'timeslot') {
            let reservedListHtml = "";
            reservedSnap.forEach((qDoc) => {
                const qData = qDoc.data();
                const qId = qDoc.id;
                const partySizeText = qData.partySize ? ` (${qData.partySize}人)` : " (1人)";
                const createdTimeStr = formatTimestamp(qData.createdAt);
                reservedListHtml += `
                    <div class="queue-item" style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 12px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #ddd;">
                        <div>
                            <span class="status-badge" style="background:#17a2b8; color:white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${qData.date || ''} ${qData.timeSlot}</span>
                            予約ID: <strong>${qId.slice(-4).toUpperCase()}</strong>${partySizeText}<br>
                            <span style="font-size: 12px; color: #666;">予約時刻: ${createdTimeStr}</span>
                        </div>
                        <button data-id="${qId}" class="complete-btn" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">✅ 完了にする</button>
                    </div>
                `;
            });
            if (reservedListHtml === "") reservedListHtml = "<p>現在有効な時間予約はありません。</p>";

            tabContentHtml = `
                <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #ccc;">
                    <h3>⏰ 時間予約リスト (全 ${reservedSnap.size} 件)</h3>
                    <div style="margin-top: 10px;">${reservedListHtml}</div>
                </div>
            `;
        }
        else if (currentTab === 'scanner') {
            tabContentHtml = `
                <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #ccc; text-align: center;">
                    <h3 style="color: #007bff; margin-top: 0;">📷 カメラでQRコードを読み取る</h3>
                    <p style="font-size: 13px; color: #666;">お客様のスマホ画面に表示されているQRコードをカメラに向けてください。</p>
                    
                    <div style="position: relative; width: 100%; max-width: 320px; margin: 0 auto; background: #000; border-radius: 8px; overflow: hidden;">
                        <video id="qr-video" playsinline style="width: 100%; display: block;"></video>
                        <canvas id="qr-canvas" style="display: none;"></canvas>
                    </div>
                    
                    <!-- 💡 スキャンされたお客様の情報を表示してボタンで確定するエリア -->
                    <div id="scan-result-area" style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 6px; border: 1px solid #ddd; text-align: left;">
                        <p style="margin: 0; color: #888; text-align: center;">（QRコードをスキャンするとここに予約情報が表示されます）</p>
                    </div>
                </div>
            `;
        }

        const mainCard = document.createElement("div");
        mainCard.className = "card";
        mainCard.innerHTML = `
            <h2>店舗管理: ${shopData.name}</h2>
            ${shopSelectorHtml}

            <div style="display: flex; gap: 5px; margin-bottom: 20px; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-wrap: wrap;">
                <button class="nav-tab-btn" data-tab="waiting" style="padding: 10px 15px; background: ${currentTab === 'waiting' ? '#28a745' : '#e0e0e0'}; color: ${currentTab === 'waiting' ? 'white' : '#333'}; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                    📋 順番待ち (${waitingSnap.size})
                </button>
                <button class="nav-tab-btn" data-tab="timeslot" style="padding: 10px 15px; background: ${currentTab === 'timeslot' ? '#17a2b8' : '#e0e0e0'}; color: ${currentTab === 'timeslot' ? 'white' : '#333'}; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                    ⏰ 時間予約 (${reservedSnap.size})
                </button>
                <button class="nav-tab-btn" data-tab="scanner" style="padding: 10px 15px; background: ${currentTab === 'scanner' ? '#007bff' : '#e0e0e0'}; color: ${currentTab === 'scanner' ? 'white' : '#333'}; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                    📷 QRスキャン受付
                </button>
            </div>

            <div id="tab-content-area">${tabContentHtml}</div>
        `;

        listContainer.innerHTML = "";
        listContainer.appendChild(mainCard);

        mainCard.querySelectorAll(".shop-select-tab").forEach(btn => {
            btn.addEventListener("click", (e) => { selectedShopId = e.target.getAttribute("data-shopid"); loadStaffView(false); });
        });
        mainCard.querySelectorAll(".nav-tab-btn").forEach(btn => {
            btn.addEventListener("click", (e) => { currentTab = e.target.getAttribute("data-tab"); loadStaffView(false); });
        });

        if (currentTab === 'scanner' && !videoStream) startCamera();

        const toggleQueueBtn = mainCard.querySelector("#toggle-queue-btn");
        if (toggleQueueBtn) {
            toggleQueueBtn.addEventListener("click", async () => {
                const nextState = !isQueueStopped;
                await updateDoc(doc(db, "shops", selectedShopId), { isQueueStopped: nextState });
                loadStaffView(false);
            });
        }

        mainCard.querySelectorAll(".call-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                await updateDoc(doc(db, "queues", e.target.getAttribute("data-id")), { status: "called", calledAt: serverTimestamp() });
                loadStaffView(false);
            });
        });

        mainCard.querySelectorAll(".complete-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                await updateDoc(doc(db, "queues", e.target.getAttribute("data-id")), { status: "completed", completedAt: serverTimestamp() });
                loadStaffView(false);
            });
        });

        updateLastRefreshTime();

    } catch (e) {
        console.error(e);
        listContainer.innerHTML = "データの読み込みに失敗しました。";
    }
}

function startCamera() {
    const video = document.getElementById("qr-video");
    const canvasElement = document.getElementById("qr-canvas");
    if (!video || !canvasElement) return;
    const canvas = canvasElement.getContext("2d");

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((stream) => {
        videoStream = stream;
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        video.play();
        scanAnimationId = requestAnimationFrame(() => tick(video, canvas));
    }).catch((err) => { console.error(err); });
}

function stopCamera() {
    if (videoStream) { videoStream.getTracks().forEach(track => track.stop()); videoStream = null; }
    if (scanAnimationId) { cancelAnimationFrame(scanAnimationId); scanAnimationId = null; }
}

let lastScannedCode = null;
let isProcessingScan = false;

function tick(video, canvas) {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.canvas.width = video.videoWidth;
        canvas.canvas.height = video.videoHeight;
        canvas.drawImage(video, 0, 0, canvas.canvas.width, canvas.canvas.height);
        const imageData = canvas.getImageData(0, 0, canvas.canvas.width, canvas.canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

        if (code) {
            const scannedId = code.data.trim();
            if (scannedId && scannedId !== lastScannedCode && !isProcessingScan) {
                lastScannedCode = scannedId;
                handleScannedTicket(scannedId);
                setTimeout(() => { lastScannedCode = null; }, 3000);
            }
        }
    }
    if (currentTab === 'scanner') scanAnimationId = requestAnimationFrame(() => tick(video, canvas));
}

// 💡 読み込んだ瞬間に完了させず、情報カードを表示してボタンで確定する処理
async function handleScannedTicket(ticketId) {
    isProcessingScan = true;
    const resultArea = document.getElementById("scan-result-area");
    if (!resultArea) { isProcessingScan = false; return; }

    try {
        const docRef = doc(db, "queues", ticketId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            resultArea.innerHTML = `<p style="color: red; font-weight: bold; text-align: center;">❌ 無効なチケットです（ID: ${ticketId}）</p>`;
            isProcessingScan = false;
            return;
        }

        const data = docSnap.data();
        const idShort = ticketId.slice(-4).toUpperCase();
        const typeText = data.type === "timeslot" ? `時間予約 (${data.date || ''} ${data.timeSlot})` : "当日順番待ち";
        const partySize = data.partySize || 1;
        const currentStatus = data.status;

        if (currentStatus === "completed") {
            resultArea.innerHTML = `
                <div style="background: #fff3cd; border: 1px solid #ffeeba; padding: 10px; border-radius: 6px;">
                    <p style="margin: 0; color: #856404; font-weight: bold;">⚠️ このチケットはすでに受付完了しています</p>
                    <p style="margin: 4px 0 0 0; font-size: 13px;">ID: <strong>${idShort}</strong> / ${partySize}人</p>
                </div>
            `;
            isProcessingScan = false;
            return;
        }

        // 💡 情報表示と「受付を完了する」ボタンの配置
        resultArea.innerHTML = `
            <div style="background: #e3f2fd; border: 2px solid #2196f3; padding: 12px; border-radius: 6px;">
                <p style="margin: 0 0 8px 0; font-weight: bold; color: #0d47a1;">👤 読み取ったお客様の予約情報</p>
                <p style="margin: 4px 0; font-size: 14px;">予約ID: <strong>${idShort}</strong></p>
                <p style="margin: 4px 0; font-size: 14px;">種類: <strong>${typeText}</strong></p>
                <p style="margin: 4px 0; font-size: 14px;">人数: <strong>${partySize} 人</strong></p>
                <p style="margin: 4px 0 8px 0; font-size: 14px;">現在の状態: <strong>${currentStatus === 'called' ? 'お呼び出し中' : (currentStatus === 'reserved' ? '時間予約' : '順番待ち')}</strong></p>
                
                <button id="confirm-scan-complete-btn" style="background: #28a745; color: white; border: none; padding: 10px; border-radius: 5px; font-weight: bold; width: 100%; cursor: pointer; font-size: 15px;">
                    ✅ この内容で受付を完了する
                </button>
            </div>
        `;

        const confirmBtn = resultArea.querySelector("#confirm-scan-complete-btn");
        confirmBtn.addEventListener("click", async () => {
            confirmBtn.disabled = true;
            confirmBtn.innerText = "処理中...";
            
            await updateDoc(docRef, { 
                status: "completed", 
                completedAt: serverTimestamp() 
            });

            resultArea.innerHTML = `
                <div style="background: #e8f5e9; border: 1px solid #c8e6c9; padding: 12px; border-radius: 6px; text-align: center;">
                    <p style="margin: 0; color: #2e7d32; font-weight: bold; font-size: 16px;">✅ 受付が完了しました！</p>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #555;">ID: ${idShort} (${partySize}人)</p>
                </div>
            `;
            isProcessingScan = false;
        });

    } catch (e) {
        console.error(e);
        resultArea.innerHTML = `<p style="color: red; font-weight: bold;">エラーが発生しました。</p>`;
        isProcessingScan = false;
    }
}

function updateLastRefreshTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const updateEl = document.getElementById('last-updated');
    if (updateEl) {
        updateEl.textContent = `最終更新: ${timeString}`;
    }
}

onSnapshot(collection(db, "shops"), () => {
    if (currentTab !== 'scanner') {
        loadStaffView(true);
    }
});

onSnapshot(collection(db, "queues"), () => {
    if (currentTab !== 'scanner') {
        loadStaffView(true);
    }
});

checkStaffAuth().then(authed => {
    if (authed) {
        loadStaffView(false);
    }
});