import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, doc, getDoc, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

async function checkCustomerAuth() {
    const overlay = document.getElementById("customer-auth-overlay");
    const isAuthed = localStorage.getItem("customer_authenticated") === "true";

    try {
        const configDoc = await getDoc(doc(db, "settings", "app_config"));
        const currentServerPass = configDoc.exists() ? (configDoc.data().customerPassword || "bunka2026") : "bunka2026";
        const savedAuthedPass = localStorage.getItem("customer_authed_pass");

        if (!isAuthed || savedAuthedPass !== currentServerPass) {
            localStorage.removeItem("customer_authenticated");
            localStorage.removeItem("customer_authed_pass");
            if (overlay) overlay.style.display = "flex";
            return false;
        }
    } catch (e) {
        console.error(e);
    }

    if (overlay) overlay.style.display = "none";
    return true;
}

onSnapshot(doc(db, "settings", "app_config"), (docSnap) => {
    if (docSnap.exists() && localStorage.getItem("customer_authenticated") === "true") {
        const serverPass = docSnap.data().customerPassword || "bunka2026";
        const savedPass = localStorage.getItem("customer_authed_pass");
        if (serverPass !== savedPass) {
            alert("パスワードが変更されたため、再認証が必要です。");
            localStorage.removeItem("customer_authenticated");
            localStorage.removeItem("customer_authed_pass");
            location.reload();
        }
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const submitBtn = document.getElementById("customer-submit-btn");
    const tokenInput = document.getElementById("customer-token-input");
    const errorMsg = document.getElementById("customer-error-msg");

    if (submitBtn) {
        submitBtn.addEventListener("click", async () => {
            const inputVal = tokenInput.value.trim();
            try {
                const configDoc = await getDoc(doc(db, "settings", "app_config"));
                const serverPass = configDoc.exists() ? (configDoc.data().customerPassword || "bunka2026") : "bunka2026";

                if (inputVal === serverPass) {
                    localStorage.setItem("customer_authenticated", "true");
                    localStorage.setItem("customer_authed_pass", serverPass);
                    document.getElementById("customer-auth-overlay").style.display = "none";
                    loadShops();
                } else {
                    errorMsg.textContent = "❌ パスワードが違います。";
                    errorMsg.style.display = "block";
                }
            } catch (e) {
                errorMsg.textContent = "❌ 認証エラーが発生しました。";
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

function getDeviceUuid() {
    let uuid = localStorage.getItem("device_uuid");
    if (!uuid) {
        uuid = 'user_' + Math.random().toString(36, 36) + Date.now().toString(36);
        localStorage.setItem("device_uuid", uuid);
    }
    return uuid;
}

const deviceUuid = getDeviceUuid();

function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

let userTab = 'shops';
let userSelectedDates = {};
let customerCountdownInterval = null;

// ⏰ 30秒ごとの自動更新タイマー設定（お客様用）
setInterval(() => {
    checkCustomerAuth().then(authed => {
        if (authed) loadShops();
    });
}, 30000);

async function loadShops() {
    const isAuth = await checkCustomerAuth();
    if (!isAuth) return;

    const container = document.getElementById("shop-container");
    if (!container) return;
    
    const todayStr = getTodayDateString();

    const headerNavHtml = `
        <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 15px; text-align: center; font-weight: bold; color: #0d47a1;">
            📅 本日の日付: ${todayStr}
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <button class="user-nav-tab" data-tab="shops" style="flex: 1; padding: 10px; background: ${userTab === 'shops' ? '#007bff' : '#e0e0e0'}; color: ${userTab === 'shops' ? 'white' : '#333'}; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
                🏠 店舗・予約トップ
            </button>
            <button class="user-nav-tab" data-tab="history" style="flex: 1; padding: 10px; background: ${userTab === 'history' ? '#28a745' : '#e0e0e0'}; color: ${userTab === 'history' ? 'white' : '#333'}; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
                📜 予約・利用履歴
            </button>
        </div>
    `;

    container.innerHTML = headerNavHtml + `<div id="user-main-content">読み込み中...</div>`;
    const mainContent = document.getElementById("user-main-content");
    mainContent.innerHTML = "";

    if (customerCountdownInterval) clearInterval(customerCountdownInterval);

    try {
        if (userTab === 'history') {
            mainContent.innerHTML = `<h3>📜 あなたの予約・利用履歴</h3><p>読み込み中...</p>`;
            
            const historyQuery = query(collection(db, "queues"), where("deviceUuid", "==", deviceUuid));
            const historySnap = await getDocs(historyQuery);

            let activeTicketsHtml = "";
            let completedTicketsHtml = "";
            let cancelledTicketsHtml = "";

            historySnap.forEach(hDoc => {
                const data = hDoc.data();
                const idShort = hDoc.id.slice(-4).toUpperCase();
                const typeName = data.type === "timeslot" ? `時間予約 (${data.date || ''} ${data.timeSlot})` : "当日順番待ち";
                const sizeText = data.partySize ? ` / ${data.partySize}人` : "";
                
                const cardStyle = "background: #fff; border: 1px solid #ddd; padding: 12px; border-radius: 6px; margin-bottom: 10px;";

                if (data.status === "waiting" || data.status === "reserved" || data.status === "called") {
                    activeTicketsHtml += `
                        <div style="${cardStyle} border-left: 5px solid #00c300;">
                            <p style="margin: 0; font-weight: bold; color: #008000;">【有効な予約】 ${data.shopName || '店舗'}</p>
                            <p style="margin: 4px 0; font-size: 14px;">ID: <strong>${idShort}</strong> | ${typeName}${sizeText}</p>
                            <span style="font-size: 12px; background: #e6f9e6; color: #008000; padding: 2px 6px; border-radius: 4px;">ステータス: ${data.status === 'called' ? '📢 お呼び出し中' : (data.status === 'reserved' ? '予約完了' : '順番待ち中')}</span>
                        </div>
                    `;
                } else if (data.status === "completed") {
                    completedTicketsHtml += `
                        <div style="${cardStyle} border-left: 5px solid #17a2b8;">
                            <p style="margin: 0; font-weight: bold; color: #17a2b8;">【受付・利用完了】 ${data.shopName || '店舗'}</p>
                            <p style="margin: 4px 0; font-size: 14px;">ID: <strong>${idShort}</strong> | ${typeName}${sizeText}</p>
                            <span style="font-size: 12px; background: #e1f5fe; color: #0277bd; padding: 2px 6px; border-radius: 4px;">案内終了済み</span>
                        </div>
                    `;
                } else if (data.status === "cancelled" || data.status === "expired") {
                    cancelledTicketsHtml += `
                        <div style="${cardStyle} border-left: 5px solid #ff4d4d; opacity: 0.8;">
                            <p style="margin: 0; font-weight: bold; color: #ff4d4d;">【キャンセル・無効】 ${data.shopName || '店舗'}</p>
                            <p style="margin: 4px 0; font-size: 14px;">ID: <strong>${idShort}</strong> | ${typeName}${sizeText}</p>
                            <span style="font-size: 12px; background: #ffebee; color: #c62828; padding: 2px 6px; border-radius: 4px;">ステータス: ${data.status === 'expired' ? '時間切れキャンセル' : 'キャンセル'}</span>
                        </div>
                    `;
                }
            });

            mainContent.innerHTML = `
                <div style="background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #ccc;">
                    <h3 style="margin-top:0; color:#0056b3;">🎫 有効な予約チケット</h3>
                    ${activeTicketsHtml || '<p style="color:#666;">現在有効な予約はありません。</p>'}

                    <h3 style="margin-top:20px; color:#17a2b8;">✅ 過去の受付・利用履歴</h3>
                    ${completedTicketsHtml || '<p style="color:#666;">過去の利用履歴はありません。</p>'}

                    <h3 style="margin-top:20px; color:#ff4d4d;">❌ キャンセル・期限切れ履歴</h3>
                    ${cancelledTicketsHtml || '<p style="color:#666;">キャンセル履歴はありません。</p>'}
                </div>
            `;
        } else {
            const querySnapshot = await getDocs(collection(db, "shops"));
            
            for (const docSnap of querySnapshot.docs) {
                const data = docSnap.data();
                const shopId = docSnap.id;
                
                const standardGroupSize = data.standardGroupSize || 4;
                const minutesPerGroup = data.minutesPerGroup !== undefined ? data.minutesPerGroup : 10;
                const autoExpireMinutes = data.autoExpireMinutes !== undefined ? data.autoExpireMinutes : 1;
                const timeslotExpireMinutes = data.timeslotExpireMinutes !== undefined ? data.timeslotExpireMinutes : 10;
                const closeBeforeMinutes = data.closeBeforeMinutes !== undefined ? data.closeBeforeMinutes : 0;
                const isQueueStopped = data.isQueueStopped === true;

                const dateSlotsMap = data.dateSlots || {
                    [todayStr]: data.timeSlots || { "10:00-10:30": 5, "11:00-11:30": 5 }
                };

                const availableDates = Object.keys(dateSlotsMap);
                if (!userSelectedDates[shopId] || !availableDates.includes(userSelectedDates[shopId])) {
                    userSelectedDates[shopId] = availableDates.includes(todayStr) ? todayStr : availableDates[0];
                }
                const activeDate = userSelectedDates[shopId];
                const timeSlots = dateSlotsMap[activeDate] || {};

                const qWaiting = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "in", ["waiting", "called"]));
                const queueSnapshot = await getDocs(qWaiting);
                
                const waitingDocs = [];
                queueSnapshot.forEach(doc => waitingDocs.push({ id: doc.id, ...doc.data() }));
                waitingDocs.sort((a, b) => {
                    const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                    const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                    return timeA - timeB;
                });

                let totalWaitingPeople = 0;
                waitingDocs.forEach(w => {
                    if (w.status === "waiting") totalWaitingPeople += (w.partySize || 1);
                });
                const totalSlotIndex = Math.floor(totalWaitingPeople / standardGroupSize);
                const totalEstMin = totalSlotIndex * minutesPerGroup;

                const myActiveQuery = query(
                    collection(db, "queues"), 
                    where("shopId", "==", shopId), 
                    where("deviceUuid", "==", deviceUuid),
                    where("status", "in", ["waiting", "reserved", "called"])
                );
                const myActiveSnap = await getDocs(myActiveQuery);
                let myTicketHtml = "";
                let isAlreadyBooked = !myActiveSnap.empty;
                let activeTicketDoc = isAlreadyBooked ? myActiveSnap.docs[0] : null;

                if (isAlreadyBooked) {
                    const ticketData = activeTicketDoc.data();
                    const ticketStatus = ticketData.status;
                    const typeText = ticketData.type === "timeslot" ? `時間予約: ${ticketData.date || ''} ${ticketData.timeSlot}` : "順番待ち";
                    const currentSize = ticketData.partySize || 1;

                    let waitInfoHtml = "";
                    if (ticketData.type === "queue") {
                        if (ticketStatus === "called") {
                            const calledTime = ticketData.calledAt && typeof ticketData.calledAt.toMillis === 'function' ? ticketData.calledAt.toMillis() : (ticketData.calledAt ? new Date(ticketData.calledAt).getTime() : Date.now());
                            const expireMs = autoExpireMinutes * 60 * 1000;
                            const deadline = calledTime + expireMs;
                            
                            waitInfoHtml = `
                                <div style="margin: 10px 0; padding: 10px; background: #fff3cd; border: 1px solid #ffeeba; border-radius: 6px; color: #856404; font-weight: bold;">
                                    📢 お呼び出しがかかりました！<br>
                                    <span class="customer-countdown" data-deadline="${deadline}" style="font-size: 16px; color: #d9534f;">自動キャンセルまで: 計算中...</span>
                                </div>
                            `;
                        } else if (ticketStatus === "waiting") {
                            let aheadPeople = 0;
                            for (let i = 0; i < waitingDocs.length; i++) {
                                if (waitingDocs[i].id === activeTicketDoc.id) break;
                                if (waitingDocs[i].status === "waiting") {
                                    aheadPeople += (waitingDocs[i].partySize || 1);
                                }
                            }
                            const slotIndex = Math.floor(aheadPeople / standardGroupSize);
                            const estimatedMinutes = slotIndex * minutesPerGroup;

                            waitInfoHtml = `
                                <p style="margin: 8px 0; font-size: 15px; color: #333;">
                                    あなたの前には <strong>${aheadPeople} 人</strong> お待ちです<br>
                                    およその待ち時間: <strong>約 ${estimatedMinutes} 分</strong>
                                </p>
                            `;
                        }
                    } else if (ticketData.type === "timeslot" && ticketData.timeSlot) {
                        const parts = ticketData.timeSlot.split("-");
                        const endTimePart = parts.length > 1 ? parts[1].trim() : ticketData.timeSlot.trim();
                        const [endH, endM] = endTimePart.split(":").map(Number);
                        const now = new Date();
                        const slotEndDatetime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH || 0, endM || 0, 0);
                        slotEndDatetime.setMinutes(slotEndDatetime.getMinutes() + timeslotExpireMinutes);
                        const expireTimeStr = `${String(slotEndDatetime.getHours()).padStart(2, '0')}:${String(slotEndDatetime.getMinutes()).padStart(2, '0')}`;

                        waitInfoHtml = `
                            <p style="margin: 8px 0; font-size: 14px; color: #d9534f; font-weight: bold;">
                                ⚠️ ${expireTimeStr}を過ぎると自動キャンセルされますのでご注意ください
                            </p>
                        `;
                    }

                    let cancelOptionsHtml = `<option value="all">全員キャンセル (${currentSize}人分)</option>`;
                    if (currentSize > 1) {
                        for (let i = 1; i < currentSize; i++) {
                            cancelOptionsHtml += `<option value="${i}">${i}人分だけキャンセル（${currentSize - i}人に変更）</option>`;
                        }
                    }

                    myTicketHtml = `
                        <div class="ticket-box" style="background: #e6f9e6; border: 2px dashed #00c300; padding: 15px; border-radius: 8px; margin-top: 15px; text-align: center;">
                            <h3>🎫 あなたの予約チケット</h3>
                            <p style="font-size: 24px; font-weight: bold; color: #008000; margin: 5px 0;">ID: ${activeTicketDoc.id.slice(-4).toUpperCase()}</p>
                            <p>ステータス: <strong>${ticketStatus === 'called' ? '📢 お呼び出し中' : (ticketStatus === 'reserved' ? '予約完了' : '順番待ち中')} ${typeText} (${currentSize}人)</strong></p>
                            
                            ${waitInfoHtml}

                            <div style="background: #fff; padding: 15px; display: inline-block; border-radius: 8px; margin: 10px 0; border: 1px solid #ccc; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                                <div id="fresh-qrcode-${shopId}" style="display: flex; justify-content: center;"></div>
                                <p style="font-size: 11px; color: #666; margin: 8px 0 0 0;">スタッフにこのQRコードをご提示ください</p>
                            </div>

                            <div style="margin-top: 15px; border-top: 1px solid #ddd; padding-top: 10px;">
                                <label style="font-size: 13px; font-weight: bold;">キャンセル・人数変更:</label><br>
                                <select id="cancel-select-${shopId}" style="padding: 6px; margin: 6px 0; width: 100%;">
                                    ${cancelOptionsHtml}
                                </select>
                                <button id="cancel-btn-${shopId}" class="cancel-btn" style="background: #ff4d4d; color:white; border:none; padding:10px; border-radius:5px; cursor:pointer; width:100%; font-weight:bold;">キャンセルを確定する</button>
                            </div>
                        </div>
                    `;
                }

                const slotQueryReserved = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "==", "reserved"));
                const slotQueryCompleted = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "==", "completed"));
                const [reservedSnap, completedSnap] = await Promise.all([getDocs(slotQueryReserved), getDocs(slotQueryCompleted)]);

                let slotButtonsHtml = "";
                const nowTime = new Date();
                const isTodayActive = (activeDate === todayStr);

                for (const [time, limit] of Object.entries(timeSlots)) {
                    if (isTodayActive && time.includes("-")) {
                        const startTimePart = time.split("-")[0].trim();
                        const [startH, startM] = startTimePart.split(":").map(Number);
                        const slotStartDatetime = new Date(nowTime.getFullYear(), nowTime.getMonth(), nowTime.getDate(), startH, startM, 0);
                        slotStartDatetime.setMinutes(slotStartDatetime.getMinutes() - closeBeforeMinutes);

                        if (nowTime >= slotStartDatetime) {
                            continue;
                        }
                    }

                    let slotConsumedCount = 0;
                    reservedSnap.forEach(sDoc => {
                        if (sDoc.data().date === activeDate && sDoc.data().timeSlot === time) slotConsumedCount += (sDoc.data().partySize || 1);
                    });
                    completedSnap.forEach(sDoc => {
                        if (sDoc.data().date === activeDate && sDoc.data().timeSlot === time) slotConsumedCount += (sDoc.data().partySize || 1);
                    });

                    const remainingSlotSeats = limit - slotConsumedCount;
                    const isFull = remainingSlotSeats <= 0;

                    slotButtonsHtml += `
                        <button class="slot-btn" data-time="${time}" ${isFull ? 'disabled' : ''} style="background:${isFull ? '#ddd' : '#f0f0f0'}; color:${isFull ? '#888' : '#333'}; cursor:${isFull ? 'not-allowed' : 'pointer'}; padding:8px 12px; border:1px solid #ccc; border-radius:4px; min-width: 110px; text-align: center;">
                            <strong>${time}</strong><br><span style="font-size:11px;">(残り${remainingSlotSeats}人)</span>
                        </button>
                    `;
                }

                let dateTabsHtml = `<div style="display: flex; gap: 6px; margin: 10px 0; flex-wrap: wrap;">`;
                availableDates.forEach(dStr => {
                    const isAct = dStr === activeDate;
                    dateTabsHtml += `<button class="user-date-tab" data-shopid="${shopId}" data-date="${dStr}" style="padding: 6px 12px; background: ${isAct ? '#007bff' : '#e0e0e0'}; color: ${isAct ? 'white' : '#333'}; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">📅 ${dStr}</button>`;
                });
                dateTabsHtml += `</div>`;

                let queueActionHtml = isQueueStopped ? 
                    `<div style="background: #ffebee; color: #c62828; padding: 12px; border-radius: 6px; font-weight: bold; text-align: center; margin-top: 10px;">🚫 現在、順番待ちの受付を停止しています</div>` : 
                    `
                    <div style="margin-bottom: 10px;">
                        <label>順番待ちの人数: </label>
                        <select id="queue-size-${shopId}" style="padding: 6px;">
                            <option value="1">1人</option><option value="2" selected>2人</option><option value="3">3人</option><option value="4">4人</option><option value="5">5人以上</option>
                        </select>
                    </div>
                    <button id="queue-btn-${shopId}" style="background: #00c300; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; width:100%; cursor:pointer;">順番待ちを発行する</button>
                `;

                const card = document.createElement("div");
                card.className = "card";
                card.innerHTML = `
                    <h2>${data.name}</h2>
                    <p>現在の待ち人数: <strong>${totalWaitingPeople}</strong> 人（およそ約 ${totalEstMin} 分待ち）</p>
                    
                    ${isAlreadyBooked ? myTicketHtml : queueActionHtml}

                    <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                    
                    <h3>⏰ 時間予約（タイムスロット）</h3>
                    <div style="margin-bottom: 5px; font-size: 13px; font-weight: bold; color: #555;">📅 日付を選択してください：</div>
                    ${dateTabsHtml}

                    <div class="slot-container" id="slots-${shopId}" style="display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0;">
                        ${slotButtonsHtml || '<p style="font-size:13px; color:#666;">現在受付中の時間枠はありません。</p>'}
                    </div>
                    <button id="time-btn-${shopId}" style="background: #6c757d; color:white; border:none; padding:10px; border-radius:5px; width:100%; cursor:pointer;" disabled>時間枠を選んで予約 (${activeDate})</button>
                `;
                
                mainContent.appendChild(card);

                if (isAlreadyBooked) {
                    setTimeout(() => {
                        const qrContainer = document.getElementById(`fresh-qrcode-${shopId}`);
                        if (qrContainer && activeTicketDoc) {
                            qrContainer.innerHTML = "";
                            try {
                                new QRCode(qrContainer, {
                                    text: activeTicketDoc.id,
                                    width: 140,
                                    height: 140,
                                    colorDark: "#000000",
                                    colorLight: "#ffffff",
                                    correctLevel: QRCode.CorrectLevel.M
                                });
                            } catch (err) {
                                console.error("QRコード生成エラー:", err);
                            }
                        }
                    }, 100);
                }

                card.querySelectorAll(".user-date-tab").forEach(tabBtn => {
                    tabBtn.addEventListener("click", (e) => {
                        userSelectedDates[e.target.getAttribute("data-shopid")] = e.target.getAttribute("data-date");
                        loadShops();
                    });
                });

                if (!isAlreadyBooked && !isQueueStopped) {
                    const queueBtn = card.querySelector(`#queue-btn-${shopId}`);
                    if (queueBtn) {
                        queueBtn.addEventListener("click", async () => {
                            const partySize = parseInt(card.querySelector(`#queue-size-${shopId}`).value);
                            try {
                                await addDoc(collection(db, "queues"), {
                                    shopId: shopId,
                                    shopName: data.name,
                                    date: activeDate,
                                    partySize: partySize,
                                    deviceUuid: deviceUuid,
                                    status: "waiting",
                                    type: "queue",
                                    createdAt: serverTimestamp()
                                });
                                alert(`順番待ちを発行しました！（${partySize}人）`);
                                loadShops();
                            } catch (e) {
                                alert("発行に失敗しました。");
                            }
                        });
                    }
                } else if (isAlreadyBooked) {
                    const cancelBtn = card.querySelector(`#cancel-btn-${shopId}`);
                    const cancelSelect = card.querySelector(`#cancel-select-${shopId}`);
                    cancelBtn.addEventListener("click", async () => {
                        const cancelVal = cancelSelect.value;
                        const currentPartySize = activeTicketDoc.data().partySize || 1;

                        if (cancelVal === "all") {
                            if (confirm("本当に全員キャンセルしますか？")) {
                                await updateDoc(doc(db, "queues", activeTicketDoc.id), { 
                                    status: "cancelled",
                                    cancelledAt: serverTimestamp()
                                });
                                alert("キャンセルしました。");
                                loadShops();
                            }
                        } else {
                            const cancelCount = parseInt(cancelVal);
                            const newPartySize = currentPartySize - cancelCount;
                            if (confirm(`${cancelCount}人分をキャンセルし、${newPartySize}人に変更しますか？`)) {
                                await updateDoc(doc(db, "queues", activeTicketDoc.id), { partySize: newPartySize });
                                alert(`${cancelCount}人分をキャンセルしました。`);
                                loadShops();
                            }
                        }
                    });
                }

                let selectedTime = null;
                const slotBtns = card.querySelectorAll(`#slots-${shopId} .slot-btn:not([disabled])`);
                const timeBtn = card.querySelector(`#time-btn-${shopId}`);

                slotBtns.forEach(btn => {
                    btn.addEventListener("click", (e) => {
                        card.querySelectorAll(`#slots-${shopId} .slot-btn:not([disabled])`).forEach(b => {
                            b.style.background = "#f0f0f0";
                            b.style.color = "#333";
                        });
                        e.currentTarget.style.background = "#00c300";
                        e.currentTarget.style.color = "white";
                        
                        selectedTime = e.currentTarget.getAttribute("data-time");
                        timeBtn.removeAttribute("disabled");
                        timeBtn.style.background = "#007bff";
                        timeBtn.innerText = `${activeDate} ${selectedTime} で予約を確定する`;
                    });
                });

                timeBtn.addEventListener("click", async () => {
                    if (!selectedTime || isAlreadyBooked) return;
                    const partySize = 2; 

                    const currentLimit = timeSlots[selectedTime] || 0;
                    const sQueryR = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "==", "reserved"));
                    const sQueryC = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "==", "completed"));
                    const [resSnap, compSnap] = await Promise.all([getDocs(sQueryR), getDocs(sQueryC)]);

                    let currentSlotConsumed = 0;
                    resSnap.forEach(sDoc => {
                        if (sDoc.data().date === activeDate && sDoc.data().timeSlot === selectedTime) currentSlotConsumed += (sDoc.data().partySize || 1);
                    });
                    compSnap.forEach(sDoc => {
                        if (sDoc.data().date === activeDate && sDoc.data().timeSlot === selectedTime) currentSlotConsumed += (sDoc.data().partySize || 1);
                    });
                    
                    if (currentSlotConsumed + partySize > currentLimit) {
                        alert("申し訳ありません！選択された人数分の空きがありません。");
                        loadShops();
                        return;
                    }

                    await addDoc(collection(db, "queues"), {
                        shopId: shopId,
                        shopName: data.name,
                        date: activeDate,
                        partySize: partySize,
                        deviceUuid: deviceUuid,
                        status: "reserved",
                        timeSlot: selectedTime,
                        type: "timeslot",
                        createdAt: serverTimestamp()
                    });
                    alert(`${activeDate} ${selectedTime} の時間予約が完了しました！`);
                    loadShops();
                });
            }
        }

        customerCountdownInterval = setInterval(() => {
            const countdownEls = document.querySelectorAll(".customer-countdown");
            countdownEls.forEach(el => {
                const deadline = parseInt(el.getAttribute("data-deadline"), 10);
                const remainingMs = deadline - Date.now();
                const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
                const remMin = Math.floor(remainingSec / 60);
                const remSec = remainingSec % 60;
                el.innerText = `自動キャンセルまで: ${remMin}分${String(remSec).padStart(2, '0')}秒`;
            });
        }, 1000);

        container.querySelectorAll(".user-nav-tab").forEach(navBtn => {
            navBtn.addEventListener("click", (e) => {
                userTab = e.target.getAttribute("data-tab");
                loadShops();
            });
        });

    } catch (e) {
        console.error("データ取得失敗: ", e);
        mainContent.innerHTML = "データの読み込みに失敗しました。";
    }
}

checkCustomerAuth().then(authed => {
    if (authed) {
        loadShops();
    }
});

function updateLastRefreshTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const updateEl = document.getElementById('last-updated');
    if (updateEl) {
        updateEl.textContent = `最終更新: ${timeString}`;
    }
}

updateLastRefreshTime();

onSnapshot(collection(db, "shops"), () => {
    checkCustomerAuth().then(authed => {
        if (authed) loadShops();
    });
    updateLastRefreshTime();
});

onSnapshot(collection(db, "queues"), () => {
    checkCustomerAuth().then(authed => {
        if (authed) loadShops();
    });
    updateLastRefreshTime();
});