import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let countdownInterval = null;

async function loadShops() {
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
                
                const standardGroupSize = data.standardGroupSize || 4; // 基準人数
                const minutesPerGroup = data.minutesPerGroup !== undefined ? data.minutesPerGroup : 10; // かかる時間
                const autoExpireMinutes = data.autoExpireMinutes !== undefined ? data.autoExpireMinutes : 1;
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

                const qWaiting = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "==", "waiting"));
                const queueSnapshot = await getDocs(qWaiting);
                
                // 全待機人数を計算
                let totalWaitingPeople = 0;
                queueSnapshot.forEach(wDoc => {
                    totalWaitingPeople += (wDoc.data().partySize || 1);
                });
                const totalEstMin = Math.ceil(totalWaitingPeople / standardGroupSize) * minutesPerGroup;

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
                    if (ticketData.type === "queue" && ticketStatus === "waiting") {
                        let aheadPeople = 0;
                        const allWaitingDocs = queueSnapshot.docs;
                        for (let i = 0; i < allWaitingDocs.length; i++) {
                            if (allWaitingDocs[i].id === activeTicketDoc.id) break;
                            aheadPeople += (allWaitingDocs[i].data().partySize || 1);
                        }
                        const estimatedMinutes = Math.ceil(aheadPeople / standardGroupSize) * minutesPerGroup;
                        waitInfoHtml = `
                            <p style="margin: 8px 0; font-size: 15px; color: #333;">
                                あなたの前には <strong>${aheadPeople} 人</strong> お待ちです<br>
                                およその待ち時間: <strong>約 ${estimatedMinutes} 分</strong>
                            </p>
                        `;
                    }

                    let callNoticeHtml = "";
                    if (ticketStatus === "called") {
                        callNoticeHtml = `
                            <div style="background: #fff3cd; border: 2px solid #ffeba2; padding: 12px; border-radius: 8px; margin: 10px 0; text-align: center;">
                                <p style="font-size: 18px; font-weight: bold; color: #856404; margin: 0 0 5px 0;">📢 お店から呼び出されました！</p>
                                <p style="font-size: 15px; font-weight: bold; color: #d9534f; margin: 0;">
                                    順番になりました！<strong>${autoExpireMinutes}分以内</strong>にお越しください。
                                </p>
                                <div id="countdown-display" style="font-size: 22px; font-weight: bold; color: #dc3545; margin-top: 8px; background: #fff; padding: 6px; border-radius: 6px; border: 1px solid #ffc107;">
                                    残り時間: 計算中...
                                </div>
                                <p style="font-size: 11px; color: #856404; margin: 5px 0 0 0;">※時間が過ぎると自動的にキャンセルとなります。</p>
                            </div>
                        `;

                        // ⏱️ リアルタイムカウントダウン開始
                        if (ticketData.calledAt) {
                            const calledTimeMs = ticketData.calledAt.toDate ? ticketData.calledAt.toDate().getTime() : new Date(ticketData.calledAt).getTime();
                            const expireTimeMs = calledTimeMs + (autoExpireMinutes * 60 * 1000);

                            if (countdownInterval) clearInterval(countdownInterval);

                            countdownInterval = setInterval(async () => {
                                const nowMs = Date.now();
                                const remainMs = expireTimeMs - nowMs;

                                const countEl = document.getElementById("countdown-display");

                                if (remainMs <= 0) {
                                    clearInterval(countdownInterval);
                                    if (countEl) countEl.innerHTML = "⏳ 時間切れ（自動キャンセル中...）";
                                    await updateDoc(doc(db, "queues", activeTicketDoc.id), { 
                                        status: "expired",
                                        cancelledAt: serverTimestamp()
                                    });
                                    loadShops();
                                } else {
                                    const rMin = Math.floor(remainMs / (1000 * 60));
                                    const rSec = Math.floor((remainMs % (1000 * 60)) / 1000);
                                    if (countEl) {
                                        countEl.innerHTML = `⏱️ 残り時間: <strong>${rMin}分${rSec.toString().padStart(2, '0')}秒</strong>`;
                                    }
                                }
                            }, 1000);
                        }
                    }

                    let cancelOptionsHtml = `<option value="all">全額・全件キャンセル (${currentSize}人分)</option>`;
                    if (currentSize > 1) {
                        for (let i = 1; i < currentSize; i++) {
                            cancelOptionsHtml += `<option value="${i}">${i}人分だけキャンセル（${currentSize - i}人に変更）</option>`;
                        }
                    }

                    myTicketHtml = `
                        <div class="ticket-box" style="background: ${ticketStatus === 'called' ? '#fff9e6' : '#e6f9e6'}; border: 2px dashed ${ticketStatus === 'called' ? '#ffc107' : '#00c300'}; padding: 15px; border-radius: 8px; margin-top: 15px; text-align: center;">
                            <h3>🎫 あなたの予約チケット</h3>
                            <p style="font-size: 24px; font-weight: bold; color: ${ticketStatus === 'called' ? '#b78103' : '#008000'}; margin: 5px 0;">${activeTicketDoc.id.slice(-4).toUpperCase()}</p>
                            <p>ステータス: <strong>${ticketStatus === 'called' ? '📢 お呼び出し中' : (ticketStatus === 'reserved' ? '予約完了' : '順番待ち中')} ${typeText} (${currentSize}人)</strong></p>
                            
                            ${callNoticeHtml}
                            ${waitInfoHtml}
                            
                            <div style="background: #fff; padding: 10px; display: inline-block; border-radius: 6px; margin: 10px 0; border: 1px solid #ccc;">
                                <div id="qrcode-${shopId}" style="display: flex; justify-content: center;"></div>
                            </div>

                            <div style="background: #fff; border: 1px solid #17a2b8; padding: 10px; border-radius: 6px; margin: 12px 0; text-align: left;">
                                <p style="margin: 0; color: #0056b3; font-weight: bold; font-size: 13px;">📸 【重要なお願い】</p>
                                <p style="margin: 4px 0 0 0; font-size: 13px; color: #333;">念のため、この画面のスクリーンショットを保存しておいてください。</p>
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
                for (const [time, limit] of Object.entries(timeSlots)) {
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
                        ${slotButtonsHtml}
                    </div>
                    <button id="time-btn-${shopId}" style="background: #6c757d; color:white; border:none; padding:10px; border-radius:5px; width:100%; cursor:pointer;" disabled>時間枠を選んで予約 (${activeDate})</button>
                `;
                
                mainContent.appendChild(card);

                if (isAlreadyBooked) {
                    setTimeout(() => {
                        const qrContainer = document.getElementById(`qrcode-${shopId}`);
                        if (qrContainer && activeTicketDoc) {
                            qrContainer.innerHTML = "";
                            new QRCode(qrContainer, {
                                text: activeTicketDoc.id,
                                width: 128,
                                height: 128
                            });
                        }
                    }, 50);
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
                            if (confirm("本当に予約を全額キャンセルしますか？")) {
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

loadShops();

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
    loadShops();
    updateLastRefreshTime();
});

onSnapshot(collection(db, "queues"), () => {
    loadShops();
    updateLastRefreshTime();
});

setInterval(() => {
    loadShops();
    updateLastRefreshTime();
}, 30000);