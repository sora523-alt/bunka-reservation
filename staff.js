import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, updateDoc, doc, setDoc, deleteDoc, getDoc, serverTimestamp, query, where, onSnapshot, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

async function logAction(action, details, targetUuid = staffSessionId) {
    try {
        await addDoc(collection(db, "action_logs"), {
            uuid: targetUuid,
            action: action,
            details: details,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("ログ記録エラー", e);
    }
}

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
        return;
    }

    if (docSnap.exists()) {
        const data = docSnap.data();
        const overlay = document.getElementById("staff-orange-lock-overlay");
        if (data.isLocked === true) {
            if (!overlay) {
                const lockDiv = document.createElement("div");
                lockDiv.id = "staff-orange-lock-overlay";
                lockDiv.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: orange; z-index: 999999; display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px;";
                lockDiv.innerHTML = `
                    <div>🔒 この端末は管理者によって一時的にロックされています</div>
                    <div style="font-size: 16px; margin-top: 15px; font-weight: normal;">トークン管理画面から解除されるまで操作できません。</div>
                `;
                document.body.appendChild(lockDiv);
            }
        } else {
            if (overlay) overlay.remove();
        }
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
                    userAgent: navigator.userAgent,
                    isLocked: false
                });
                await logAction("スタッフログイン", `端末ID: ${staffSessionId} がログインしました`);
                document.getElementById("auth-overlay").style.display = "none";
                initStaffView();
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

    if (!document.getElementById("staff-modal-overlay")) {
        const modalOverlay = document.createElement("div");
        modalOverlay.id = "staff-modal-overlay";
        modalOverlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: none; justify-content: center; align-items: center; z-index: 10000; padding: 20px; box-sizing: border-box;";
        modalOverlay.innerHTML = `
            <div id="staff-modal-content" style="background: white; padding: 30px; border-radius: 12px; width: 100%; max-width: 500px; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.3);">
            </div>
        `;
        document.body.appendChild(modalOverlay);
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
let html5QrCode = null;
let isInitialLoaded = false;
let countdownTimerInterval = null;
let cachedShopsData = [];
let cachedShopDetails = {};
let searchQuery = "";

setInterval(() => {
    checkStaffAuth().then(authed => {
        if (authed && currentTab !== 'scanner') initStaffView(true);
    });
}, 30000);

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible') {
        checkStaffAuth().then(authed => {
            if (authed && currentTab !== 'scanner') initStaffView(true);
        });
    }
});

async function initStaffView(isBackground = false) {
    const isAuth = await checkStaffAuth();
    if (!isAuth) return;

    if (isBackground && currentTab === 'scanner') return;

    const container = document.getElementById("staff-container");
    if (!container) return;

    if (currentTab !== 'scanner' && html5QrCode) stopCamera();
    const todayStr = getTodayDateString();

    if (!isInitialLoaded || !document.getElementById("staff-shops-list")) {
        container.innerHTML = `
            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 20px; text-align: center; font-weight: bold; color: #0d47a1;">
                📅 本日の管理日付: ${todayStr}
            </div>
            <div id="staff-shops-list">読み込み中...</div>
        `;
        isInitialLoaded = true;
    }

    try {
        const shopsSnapshot = await getDocs(collection(db, "shops"));
        if (shopsSnapshot.empty) {
            document.getElementById("staff-shops-list").innerHTML = "<p>店舗データがありません。</p>";
            return;
        }

        if (!selectedShopId) selectedShopId = shopsSnapshot.docs[0].id;

        cachedShopsData = [];
        shopsSnapshot.docs.forEach(docSnap => {
            cachedShopsData.push({ id: docSnap.id, ...docSnap.data() });
        });

        let shopData = cachedShopsData.find(s => s.id === selectedShopId) || cachedShopsData[0];
        selectedShopId = shopData.id;

        const isQueueStopped = shopData.isQueueStopped === true;
        const standardGroupSize = shopData.standardGroupSize !== undefined ? shopData.standardGroupSize : 4;
        const minutesPerGroup = shopData.minutesPerGroup !== undefined ? shopData.minutesPerGroup : 10;
        const autoExpireMinutes = shopData.autoExpireMinutes !== undefined ? shopData.autoExpireMinutes : 1;
        const timeslotExpireMinutes = shopData.timeslotExpireMinutes !== undefined ? shopData.timeslotExpireMinutes : 10;

        const qWaiting = query(collection(db, "queues"), where("shopId", "==", selectedShopId), where("status", "in", ["waiting", "called"]));
        const qReserved = query(collection(db, "queues"), where("shopId", "==", selectedShopId), where("status", "==", "reserved"));

        const [waitingSnap, reservedSnap] = await Promise.all([getDocs(qWaiting), getDocs(qReserved)]);
        const nowTime = new Date();

        for (const docSnap of waitingSnap.docs) {
            const qData = docSnap.data();
            const ticketIdShort = docSnap.id.slice(-4).toUpperCase();
            const customerUuid = qData.deviceUuid || "unknown_customer";

            if (qData.status === "called" && qData.calledAt) {
                const calledTime = typeof qData.calledAt.toMillis === 'function' ? qData.calledAt.toMillis() : new Date(qData.calledAt).getTime();
                const expireMs = autoExpireMinutes * 60 * 1000;
                if (nowTime.getTime() > calledTime + expireMs) {
                    await updateDoc(doc(db, "queues", docSnap.id), { status: "expired", cancelledAt: serverTimestamp() });
                    await logAction("自動キャンセル", `店舗: ${shopData.name} / 予約番号: [${ticketIdShort}] が呼び出し時間切れでキャンセルされました`, customerUuid);
                }
            }
        }

        for (const docSnap of reservedSnap.docs) {
            const qData = docSnap.data();
            const ticketIdShort = docSnap.id.slice(-4).toUpperCase();
            const customerUuid = qData.deviceUuid || "unknown_customer";

            if (qData.type === "timeslot" && qData.timeSlot && qData.date === todayStr && qData.timeSlot.includes("-")) {
                const endTimePart = qData.timeSlot.split("-")[1].trim();
                const [endH, endM] = endTimePart.split(":").map(Number);
                const slotEndDatetime = new Date(nowTime.getFullYear(), nowTime.getMonth(), nowTime.getDate(), endH, endM, 0);
                slotEndDatetime.setMinutes(slotEndDatetime.getMinutes() + timeslotExpireMinutes);

                if (nowTime > slotEndDatetime) {
                    await updateDoc(doc(db, "queues", docSnap.id), { status: "expired", cancelledAt: serverTimestamp() });
                    await logAction("自動キャンセル", `店舗: ${shopData.name} / 時間予約番号: [${ticketIdShort}] が時間切れでキャンセルされました`, customerUuid);
                }
            }
        }

        const [waitingSnap2, reservedSnap2] = await Promise.all([
            getDocs(query(collection(db, "queues"), where("shopId", "==", selectedShopId), where("status", "in", ["waiting", "called"]))),
            getDocs(query(collection(db, "queues"), where("shopId", "==", selectedShopId), where("status", "==", "reserved")))
        ]);

        const waitingDocs = [];
        waitingSnap2.forEach(d => waitingDocs.push({ id: d.id, ...d.data() }));
        waitingDocs.sort((a, b) => {
            const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeA - timeB;
        });

        const reservedDocs = [];
        reservedSnap2.forEach(d => reservedDocs.push({ id: d.id, ...d.data() }));
        reservedDocs.sort((a, b) => {
            const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeA - timeB;
        });

        cachedShopDetails = {
            shopData,
            waitingDocs,
            reservedDocs,
            isQueueStopped,
            standardGroupSize,
            minutesPerGroup,
            autoExpireMinutes,
            timeslotExpireMinutes,
            todayStr
        };

        renderStaffUI();
        updateLastRefreshTime();

    } catch (e) {
        console.error(e);
        const listEl = document.getElementById("staff-shops-list");
        if (listEl) listEl.innerHTML = "データの読み込みに失敗しました。";
    }
}

function renderStaffUI() {
    const listContainer = document.getElementById("staff-shops-list");
    if (!listContainer) return;

    const { shopData, waitingDocs, reservedDocs, isQueueStopped, standardGroupSize, minutesPerGroup, timeslotExpireMinutes, todayStr } = cachedShopDetails;

    let shopSelectorHtml = `<div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">`;
    cachedShopsData.forEach(s => {
        const isSelected = s.id === selectedShopId;
        shopSelectorHtml += `
            <button class="shop-select-tab" data-shopid="${s.id}" style="padding: 10px 15px; background: ${isSelected ? '#007bff' : '#f0f0f0'}; color: ${isSelected ? 'white' : '#333'}; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
                ${s.name}
            </button>
        `;
    });
    shopSelectorHtml += `</div>`;

    const filterDocs = (docs) => {
        if (!searchQuery.trim()) return docs;
        const q = searchQuery.trim().toLowerCase();
        return docs.filter(item => item.id.toLowerCase().includes(q));
    };

    let tabContentHtml = "";

    if (currentTab === 'waiting') {
        const filtered = filterDocs(waitingDocs);
        let waitingListHtml = "";

        filtered.forEach((qData, index) => {
            const qId = qData.id;
            const idShort = qId.slice(-4).toUpperCase();
            const partySize = qData.partySize || 1;
            const partySizeText = ` (${partySize}人)`;
            const createdTimeStr = formatTimestamp(qData.createdAt);
            const isCalled = qData.status === "called";
            const isManualStaff = qData.isStaffIssued === true;

            let aheadPeople = 0;
            for (let i = 0; i < waitingDocs.length; i++) {
                if (waitingDocs[i].id === qId) break;
                if (!waitingDocs[i].status || waitingDocs[i].status === "waiting" || waitingDocs[i].status === "called") {
                    aheadPeople += (waitingDocs[i].partySize || 1);
                }
            }
            const slotIndex = Math.floor(aheadPeople / standardGroupSize);
            const estimatedMinutes = slotIndex * minutesPerGroup;

            let waitTimeBadge = "";
            if (isCalled) {
                const calledTime = qData.calledAt && typeof qData.calledAt.toMillis === 'function' ? qData.calledAt.toMillis() : (qData.calledAt ? new Date(qData.calledAt).getTime() : Date.now());
                const expireMs = cachedShopDetails.autoExpireMinutes * 60 * 1000;
                const deadline = calledTime + expireMs;
                const remainingMs = deadline - Date.now();
                const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
                const remMin = Math.floor(remainingSec / 60);
                const remSec = remainingSec % 60;
                waitTimeBadge = `<span style="background: #ffc107; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-left: 8px;" class="countdown-badge" data-deadline="${deadline}">📢 呼び出し中 (自動キャンセルまで: ${remMin}分${String(remSec).padStart(2, '0')}秒)</span>`;
            } else {
                waitTimeBadge = `<span style="background: #e9ecef; color: #495057; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-left: 8px;">⏳ 予想待ち時間: 約 ${estimatedMinutes} 分</span>`;
            }

            let badgeHtml = "";
            if (isManualStaff) {
                badgeHtml = `<span class="status-badge" style="background:#6c757d; color:#fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;">🎫 紙の整理券（スタッフ発行）</span>`;
            } else if (isCalled) {
                badgeHtml = `<span class="status-badge" style="background:#ffc107; color:#000; padding: 4px 8px; border-radius: 4px; font-weight: bold;">📢 お呼び出し中</span>`;
            } else {
                badgeHtml = `<span class="status-badge" style="background:#28a745; color:#fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;">順番待ち</span>`;
            }

            waitingListHtml += `
                <div class="queue-item" style="display: flex; justify-content: space-between; align-items: center; background: ${isManualStaff ? '#f8f9fa' : (isCalled ? '#fff9e6' : '#fff')}; padding: 12px; margin-bottom: 8px; border-radius: 6px; border: 1px solid ${isManualStaff ? '#ccc' : (isCalled ? '#ffe082' : '#ddd')};">
                    <div>
                        <div style="margin-bottom: 4px;">
                            ${badgeHtml}
                            ${waitTimeBadge}
                        </div>
                        受付ID: <strong>${idShort}</strong>${partySizeText} <span style="font-size: 11px; color: #888;">(${qId})</span><br>
                        <span style="font-size: 12px; color: #666;">受付時刻: ${createdTimeStr}</span>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        ${(!isCalled && !isManualStaff) ? `<button data-id="${qId}" class="call-btn" style="background: #ffc107; color: #333; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">📢 呼び出す</button>` : ''}
                        <button data-id="${qId}" class="complete-btn" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">✅ 完了にする</button>
                    </div>
                </div>
            `;
        });
        if (waitingListHtml === "") waitingListHtml = "<p>該当する待ちのお客様はいません。</p>";

        let manualPartySizeOptionsHtml = "";
        for (let i = 1; i <= 5; i++) {
            manualPartySizeOptionsHtml += `<option value="${i}" ${i === 2 ? 'selected' : ''}>${i}人</option>`;
        }

        tabContentHtml = `
            <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #ccc;">
                <div style="margin-bottom: 15px; display: flex; gap: 8px;">
                    <input type="text" id="staff-search-input" placeholder="🔍 ID（例: ABCD または下4桁）で検索" value="${searchQuery}" style="flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px;">
                    <button id="staff-search-clear" style="padding: 10px 15px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">クリア</button>
                </div>

                <div style="background: #e2f0fb; border: 1px solid #bce8f1; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="margin-top: 0; color: #004085;">🎫 スマホがないお客様用の手動発券（紙にIDを書いてお渡しください）</h4>
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <div>
                            <label style="font-size: 13px; font-weight: bold;">人数:</label>
                            <select id="manual-party-size" style="padding: 6px; margin-left: 5px;">
                                ${manualPartySizeOptionsHtml}
                            </select>
                        </div>
                        <button id="manual-issue-btn" style="background: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 5px; font-weight: bold; cursor: pointer;">＋ 手動で順番待ちを発行する</button>
                    </div>
                </div>

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
                <h3>📋 当日順番待ちリスト (全 ${filtered.length} / ${waitingDocs.length} 件)</h3>
                <div style="margin-top: 10px;">${waitingListHtml}</div>
            </div>
        `;
    } 
    else if (currentTab === 'timeslot') {
        const filtered = filterDocs(reservedDocs);
        let reservedListHtml = "";
        
        filtered.forEach((qData) => {
            const qId = qData.id;
            const idShort = qId.slice(-4).toUpperCase();
            const partySizeText = qData.partySize ? ` (${qData.partySize}人)` : " (1人)";
            const createdTimeStr = formatTimestamp(qData.createdAt);
            
            let expireWarningHtml = "";
            if (qData.timeSlot && qData.timeSlot.includes("-")) {
                const endTimePart = qData.timeSlot.split("-")[1].trim();
                const [endH, endM] = endTimePart.split(":").map(Number);
                const slotEndDatetime = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), endH, endM, 0);
                slotEndDatetime.setMinutes(slotEndDatetime.getMinutes() + timeslotExpireMinutes);
                const expireTimeStr = `${String(slotEndDatetime.getHours()).padStart(2, '0')}:${String(slotEndDatetime.getMinutes()).padStart(2, '0')}`;
                expireWarningHtml = `<br><span style="font-size: 11px; color: #d9534f; font-weight: bold;">⚠️ 終了時刻(${endTimePart})から ${timeslotExpireMinutes}分過ぎた ${expireTimeStr} を過ぎると自動キャンセルされます</span>`;
            }

            reservedListHtml += `
                <div class="queue-item" style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 12px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #ddd;">
                    <div>
                        <span class="status-badge" style="background:#17a2b8; color:white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${qData.date || ''} ${qData.timeSlot}</span>
                        予約ID: <strong>${idShort}</strong>${partySizeText} <span style="font-size: 11px; color: #888;">(${qId})</span>
                        ${expireWarningHtml}<br>
                        <span style="font-size: 12px; color: #666;">予約時刻: ${createdTimeStr}</span>
                    </div>
                    <button data-id="${qId}" class="complete-btn" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">✅ 完了にする</button>
                </div>
            `;
        });
        if (reservedListHtml === "") reservedListHtml = "<p>該当する時間予約はありません。</p>";

        tabContentHtml = `
            <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #ccc;">
                <div style="margin-bottom: 15px; display: flex; gap: 8px;">
                    <input type="text" id="staff-search-input" placeholder="🔍 ID（例: ABCD または下4桁）で検索" value="${searchQuery}" style="flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px;">
                    <button id="staff-search-clear" style="padding: 10px 15px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">クリア</button>
                </div>

                <h3>⏰ 時間予約リスト (全 ${filtered.length} / ${reservedDocs.length} 件)</h3>
                <div style="margin-top: 10px;">${reservedListHtml}</div>
            </div>
        `;
    }
    else if (currentTab === 'scanner') {
        tabContentHtml = `
            <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #ccc; text-align: center;">
                <h3 style="color: #007bff; margin-top: 0;">📷 QRコード受付スキャナー</h3>
                <p style="font-size: 13px; color: #666;">お客様のスマホ画面に表示されているQRコードをカメラにかざしてください。</p>
                
                <div id="fresh-qr-video-container" style="width: 100%; max-width: 320px; margin: 15px auto; border-radius: 8px; overflow: hidden; border: 2px solid #007bff;"></div>
                
                <div id="fresh-scan-status" style="margin-top: 15px; padding: 12px; background: #e3f2fd; border-radius: 6px; border: 1px solid #bbdefb; color: #0d47a1; font-weight: bold; font-size: 14px;">
                    🔍 カメラを起動中...
                </div>

                <div style="margin-top: 25px; padding-top: 20px; border-top: 1px dashed #ccc; text-align: left;">
                    <h4 style="margin: 0 0 8px 0; color: #333; font-size: 14px;">⌨️ カメラで読み取れない場合（ID検索）</h4>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="scanner-manual-input" placeholder="例: ABCD（英文字4桁や部分一致）" style="flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px;">
                        <button id="scanner-manual-search-btn" style="background: #007bff; color: white; border: none; padding: 10px 15px; border-radius: 6px; font-weight: bold; cursor: pointer;">検索</button>
                    </div>
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
                📋 順番待ち (${waitingDocs.length})
            </button>
            <button class="nav-tab-btn" data-tab="timeslot" style="padding: 10px 15px; background: ${currentTab === 'timeslot' ? '#28a745' : '#e0e0e0'}; color: ${currentTab === 'timeslot' ? 'white' : '#333'}; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                ⏰ 時間予約 (${reservedDocs.length})
            </button>
            <button class="nav-tab-btn" data-tab="scanner" style="padding: 10px 15px; background: ${currentTab === 'scanner' ? '#28a745' : '#e0e0e0'}; color: ${currentTab === 'scanner' ? 'white' : '#333'}; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                📷 QRスキャン受付
            </button>
        </div>

        <div id="tab-content-area">${tabContentHtml}</div>
    `;

    listContainer.innerHTML = "";
    listContainer.appendChild(mainCard);

    bindStaffEvents(mainCard);

    if (currentTab === 'scanner' && !html5QrCode) {
        startFreshCamera();
    }
}

function bindStaffEvents(rootEl) {
    const searchInputEl = rootEl.querySelector("#staff-search-input");
    if (searchInputEl) {
        searchInputEl.addEventListener("input", (e) => {
            searchQuery = e.target.value;
            const tabArea = document.getElementById("tab-content-area");
            if (tabArea) {
                tabArea.innerHTML = renderStaffUIContentOnly(); // または簡易再描画
                initStaffView(false);
            }
        });
        setTimeout(() => {
            const el = document.getElementById("staff-search-input");
            if (el) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
            }
        }, 50);
    }

    const searchClearBtn = rootEl.querySelector("#staff-search-clear");
    if (searchClearBtn) {
        searchClearBtn.addEventListener("click", () => {
            searchQuery = "";
            initStaffView(false);
        });
    }

    rootEl.querySelectorAll(".shop-select-tab").forEach(btn => {
        btn.addEventListener("click", (e) => { 
            selectedShopId = e.target.getAttribute("data-shopid"); 
            searchQuery = "";
            initStaffView(false); 
        });
    });

    rootEl.querySelectorAll(".nav-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => { 
            currentTab = e.target.getAttribute("data-tab"); 
            searchQuery = "";
            initStaffView(false); 
        });
    });

    const scannerManualBtn = rootEl.querySelector("#scanner-manual-search-btn");
    const scannerManualInput = rootEl.querySelector("#scanner-manual-input");
    if (scannerManualBtn && scannerManualInput) {
        const executeManualSearch = async () => {
            const keyword = scannerManualInput.value.trim().toLowerCase();
            if (!keyword) {
                alert("検索するIDを入力してください。");
                return;
            }
            const allQueuesSnap = await getDocs(query(collection(db, "queues"), where("shopId", "==", selectedShopId)));
            let matchedDocId = null;
            allQueuesSnap.forEach(d => {
                if (d.id.toLowerCase().includes(keyword)) matchedDocId = d.id;
            });
            if (matchedDocId) {
                handleFreshScannedTicket(matchedDocId);
            } else {
                alert(`「${keyword}」に一致するチケットが見つかりませんでした。`);
            }
        };
        scannerManualBtn.addEventListener("click", executeManualSearch);
        scannerManualInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") executeManualSearch();
        });
    }

    if (countdownTimerInterval) clearInterval(countdownTimerInterval);
    if (currentTab === 'waiting') {
        countdownTimerInterval = setInterval(() => {
            const badges = rootEl.querySelectorAll(".countdown-badge");
            badges.forEach(badge => {
                const deadline = parseInt(badge.getAttribute("data-deadline"), 10);
                const remainingMs = deadline - Date.now();
                const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
                const remMin = Math.floor(remainingSec / 60);
                const remSec = remainingSec % 60;
                badge.innerHTML = `📢 呼び出し中 (自動キャンセルまで: ${remMin}分${String(remSec).padStart(2, '0')}秒)`;
            });
        }, 1000);
    }

    const manualIssueBtn = rootEl.querySelector("#manual-issue-btn");
    if (manualIssueBtn) {
        manualIssueBtn.addEventListener("click", async () => {
            const partySize = parseInt(rootEl.querySelector("#manual-party-size").value) || 1;
            const { shopData, todayStr } = cachedShopDetails;
            try {
                const docRef = await addDoc(collection(db, "queues"), {
                    shopId: selectedShopId,
                    shopName: shopData.name,
                    date: todayStr,
                    partySize: partySize,
                    deviceUuid: "staff_manual_issue",
                    status: "waiting",
                    type: "queue",
                    isStaffIssued: true,
                    createdAt: serverTimestamp()
                });
                await handleManualIssuedTicket(docRef.id);
            } catch (e) {
                console.error(e);
                alert("手動発行に失敗しました。");
            }
        });
    }

    const toggleQueueBtn = rootEl.querySelector("#toggle-queue-btn");
    if (toggleQueueBtn) {
        toggleQueueBtn.addEventListener("click", async () => {
            const { isQueueStopped } = cachedShopDetails;
            const nextState = !isQueueStopped;
            const actionText = nextState ? "一時停止" : "再開";
            if (confirm(`本当に順番待ちの受付を【${actionText}】しますか？`)) {
                await updateDoc(doc(db, "shops", selectedShopId), { isQueueStopped: nextState });
                initStaffView(false);
            }
        });
    }

    rootEl.querySelectorAll(".call-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const ticketId = e.target.getAttribute("data-id");
            if (confirm("このお客様を呼び出しますか？")) {
                await updateDoc(doc(db, "queues", ticketId), { status: "called", calledAt: serverTimestamp() });
            }
        });
    });

    rootEl.querySelectorAll(".complete-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            if (confirm("この受付（予約）を完了にしますか？")) {
                await updateDoc(doc(db, "queues", e.target.getAttribute("data-id")), { status: "completed", completedAt: serverTimestamp() });
                initStaffView(false);
            }
        });
    });
}

let lastScannedId = null;
let isProcessingFreshScan = false;

function startFreshCamera() {
    const statusEl = document.getElementById("fresh-scan-status");
    if (html5QrCode) {
        try { html5QrCode.stop().catch(() => {}); } catch (e) {}
        html5QrCode = null;
    }
    if (!document.getElementById("fresh-qr-video-container")) return;

    html5QrCode = new Html5Qrcode("fresh-qr-video-container");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            const scannedText = decodedText.trim();
            if (scannedText && scannedText !== lastScannedId && !isProcessingFreshScan) {
                lastScannedId = scannedText;
                handleFreshScannedTicket(scannedText);
                setTimeout(() => { lastScannedId = null; }, 3000);
            }
        },
        (errorMessage) => {}
    ).then(() => {
        if (statusEl) statusEl.innerHTML = "🟢 スキャン待機中... QRコードをカメラに映してください";
    }).catch((err) => {
        if (statusEl) {
            statusEl.style.background = "#ffebee";
            statusEl.style.color = "#c62828";
            statusEl.style.borderColor = "#ffcdd2";
            statusEl.innerHTML = "❌ カメラの起動に失敗しました（権限を確認してください）";
        }
    });
}

function stopCamera() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
        }).catch(() => { html5QrCode = null; });
    }
}

async function handleFreshScannedTicket(ticketId) {
    isProcessingFreshScan = true;
    const modalOverlay = document.getElementById("staff-modal-overlay");
    const modalContent = document.getElementById("staff-modal-content");
    const statusEl = document.getElementById("fresh-scan-status");

    if (!modalOverlay || !modalContent) {
        isProcessingFreshScan = false;
        return;
    }

    if (statusEl) {
        statusEl.style.background = "#e8f5e9";
        statusEl.style.color = "#2e7d32";
        statusEl.style.borderColor = "#c8e6c9";
        statusEl.innerHTML = `✅ チケットを検出しました！ (ID: ${ticketId.slice(-4).toUpperCase()})`;
    }

    try {
        const docRef = doc(db, "queues", ticketId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            modalContent.innerHTML = `
                <h2 style="color: #d32f2f; margin-top: 0;">❌ 見つかりません</h2>
                <p style="font-size: 15px; color: #555;">検索/読み取りID: <strong>${ticketId}</strong></p>
                <p style="color: #d32f2f; font-weight: bold;">データベースに存在しないか、無効なチケットです。</p>
                <button id="fresh-modal-close" style="background: #6c757d; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 15px;">閉じる</button>
            `;
            modalOverlay.style.display = "flex";
            document.getElementById("fresh-modal-close").onclick = () => {
                modalOverlay.style.display = "none";
                isProcessingFreshScan = false;
                if (statusEl) statusEl.innerHTML = "🔍 スキャン待機中... QRコードを映してください";
            };
            return;
        }

        const data = docSnap.data();
        const idShort = ticketId.slice(-4).toUpperCase();
        const typeText = data.type === "timeslot" ? `時間予約 (${data.date || ''} ${data.timeSlot})` : "当日順番待ち";
        const partySize = data.partySize || 1;
        const currentStatus = data.status;

        let statusText = "順番待ち中";
        if (currentStatus === "called") statusText = "📢 お呼び出し中";
        else if (currentStatus === "reserved") statusText = "⏰ 時間予約";
        else if (currentStatus === "completed") statusText = "✅ 受付完了済み";

        if (currentStatus === "completed") {
            modalContent.innerHTML = `
                <h2 style="color: #856404; margin-top: 0;">⚠️ すでに受付が完了しています</h2>
                <div style="background: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: left;">
                    <p style="margin: 4px 0; font-size: 16px;">予約ID: <strong>${idShort}</strong></p>
                    <p style="margin: 4px 0; font-size: 16px;">種類: <strong>${typeText}</strong></p>
                    <p style="margin: 4px 0; font-size: 16px;">人数: <strong>${partySize} 人</strong></p>
                </div>
                <button id="fresh-modal-close" style="background: #007bff; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 10px;">確認（閉じる）</button>
            `;
            modalOverlay.style.display = "flex";
            document.getElementById("fresh-modal-close").onclick = () => {
                modalOverlay.style.display = "none";
                isProcessingFreshScan = false;
                if (statusEl) statusEl.innerHTML = "🔍 スキャン待機中... QRコードを映してください";
            };
            return;
        }

        modalContent.innerHTML = `
            <h2 style="color: #0d47a1; margin-top: 0;">👤 お客様の予約情報</h2>
            <div style="background: #e3f2fd; border: 2px solid #2196f3; padding: 18px; border-radius: 8px; margin: 15px 0; text-align: left;">
                <p style="margin: 6px 0; font-size: 18px;">受付ID: <strong style="color: #d9534f; font-size: 22px;">${idShort}</strong></p>
                <p style="margin: 6px 0; font-size: 18px;">種類: <strong>${typeText}</strong></p>
                <p style="margin: 6px 0; font-size: 18px;">人数: <strong>${partySize} 人</strong></p>
                <p style="margin: 6px 0; font-size: 18px;">現在の状態: <strong>${statusText}</strong></p>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button id="fresh-accept-btn" style="background: #28a745; color: white; border: none; padding: 14px; border-radius: 6px; font-weight: bold; flex: 1; cursor: pointer; font-size: 16px;">
                    ✅ 受付をしますか？
                </button>
                <button id="fresh-dismiss-btn" style="background: #6c757d; color: white; border: none; padding: 14px; border-radius: 6px; font-weight: bold; width: 100px; cursor: pointer; font-size: 16px;">
                    キャンセル
                </button>
            </div>
        `;
        modalOverlay.style.display = "flex";

        document.getElementById("fresh-accept-btn").onclick = async () => {
            if (confirm(`【確認】本当にこのお客様（ID: ${idShort} / ${partySize}人）の受付を完了にしますか？`)) {
                const acceptBtn = document.getElementById("fresh-accept-btn");
                acceptBtn.disabled = true;
                acceptBtn.innerText = "処理中...";

                try {
                    await updateDoc(docRef, {
                        status: "completed",
                        completedAt: serverTimestamp()
                    });

                    modalContent.innerHTML = `
                        <h2 style="color: #2e7d32; margin-top: 0;">🎉 受付完了しました！</h2>
                        <p style="font-size: 18px; margin: 10px 0;">ID: <strong>${idShort}</strong> (${partySize}人)</p>
                        <p style="color: #666; font-size: 14px;">正常に来場・受付処理が完了しました。</p>
                        <button id="fresh-success-ok" style="background: #28a745; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 15px;">OK（次へ進む）</button>
                    `;

                    document.getElementById("fresh-success-ok").onclick = () => {
                        modalOverlay.style.display = "none";
                        isProcessingFreshScan = false;
                        if (statusEl) statusEl.innerHTML = "🔍 スキャン待機中... QRコードを映してください";
                        initStaffView(false);
                    };
                } catch (updateErr) {
                    console.error(updateErr);
                    alert("受付処理の保存に失敗しました。");
                    acceptBtn.disabled = false;
                    acceptBtn.innerText = "✅ 受付をしますか？";
                }
            }
        };

        document.getElementById("fresh-dismiss-btn").onclick = () => {
            modalOverlay.style.display = "none";
            isProcessingFreshScan = false;
            if (statusEl) statusEl.innerHTML = "🔍 スキャン待機中... QRコードを映してください";
        };

    } catch (e) {
        console.error(e);
        modalContent.innerHTML = `
            <h2 style="color: red; margin-top: 0;">エラーが発生しました</h2>
            <button id="fresh-modal-close" style="background: #6c757d; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 15px;">閉じる</button>
        `;
        modalOverlay.style.display = "flex";
        document.getElementById("fresh-modal-close").onclick = () => {
            modalOverlay.style.display = "none";
            isProcessingFreshScan = false;
            if (statusEl) statusEl.innerHTML = "🔍 スキャン待機中... QRコードを映してください";
        };
    }
}

async function handleManualIssuedTicket(ticketId) {
    isProcessingFreshScan = true;
    const modalOverlay = document.getElementById("staff-modal-overlay");
    const modalContent = document.getElementById("staff-modal-content");

    if (!modalOverlay || !modalContent) {
        isProcessingFreshScan = false;
        return;
    }

    try {
        const docRef = doc(db, "queues", ticketId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            modalContent.innerHTML = `
                <h2 style="color: #d32f2f; margin-top: 0;">❌ エラー</h2>
                <button id="fresh-modal-close" style="background: #6c757d; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 15px;">閉じる</button>
            `;
            modalOverlay.style.display = "flex";
            document.getElementById("fresh-modal-close").onclick = () => {
                modalOverlay.style.display = "none";
                isProcessingFreshScan = false;
                initStaffView(false);
            };
            return;
        }

        const data = docSnap.data();
        const shopId = data.shopId;
        const shopDoc = await getDoc(doc(db, "shops", shopId));
        const shopData = shopDoc.exists() ? shopDoc.data() : {};
        const standardGroupSize = shopData.standardGroupSize || 4;
        const minutesPerGroup = shopData.minutesPerGroup !== undefined ? shopData.minutesPerGroup : 10;

        const qWaiting = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "in", ["waiting", "called"]));
        const queueSnapshot = await getDocs(qWaiting);
        const waitingDocs = [];
        queueSnapshot.forEach(d => waitingDocs.push({ id: d.id, ...d.data() }));
        waitingDocs.sort((a, b) => {
            const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeA - timeB;
        });

        let aheadPeople = 0;
        for (let i = 0; i < waitingDocs.length; i++) {
            if (waitingDocs[i].id === ticketId) break;
            if (!waitingDocs[i].status || waitingDocs[i].status === "waiting" || waitingDocs[i].status === "called") {
                aheadPeople += (waitingDocs[i].partySize || 1);
            }
        }
        const slotIndex = Math.floor(aheadPeople / standardGroupSize);
        const estimatedMinutes = slotIndex * minutesPerGroup;

        const idShort = ticketId.slice(-4).toUpperCase();
        const partySize = data.partySize || 1;

        modalContent.innerHTML = `
            <h2 style="color: #0d47a1; margin-top: 0;">🎫 手動発券された予約情報</h2>
            <div style="background: #e3f2fd; border: 2px solid #2196f3; padding: 18px; border-radius: 8px; margin: 15px 0; text-align: left;">
                <p style="margin: 6px 0; font-size: 18px;">受付ID: <strong style="color: #d9534f; font-size: 22px;">${idShort}</strong></p>
                <p style="margin: 6px 0; font-size: 18px;">種類: <strong>紙の整理券（手動発券）</strong></p>
                <p style="margin: 6px 0; font-size: 18px;">人数: <strong>${partySize} 人</strong></p>
                
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #90caf9; font-size: 16px; color: #0d47a1;">
                    前のお待ち人数: <strong>${aheadPeople} 人</strong><br>
                    およその待ち時間: <strong>約 ${estimatedMinutes} 分</strong>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button id="fresh-accept-btn" style="background: #28a745; color: white; border: none; padding: 14px; border-radius: 6px; font-weight: bold; flex: 1; cursor: pointer; font-size: 16px;">
                    ✅ 順番待ち予約をしますか？
                </button>
                <button id="fresh-dismiss-btn" style="background: #6c757d; color: white; border: none; padding: 14px; border-radius: 6px; font-weight: bold; width: 100px; cursor: pointer; font-size: 16px;">
                    キャンセル
                </button>
            </div>
        `;
        modalOverlay.style.display = "flex";

        document.getElementById("fresh-accept-btn").onclick = async () => {
            modalOverlay.style.display = "none";
            isProcessingFreshScan = false;
            initStaffView(false);
        };

        document.getElementById("fresh-dismiss-btn").onclick = async () => {
            if (confirm("この手動発券を取り消しますか？")) {
                try {
                    await deleteDoc(docRef);
                } catch (e) {
                    console.error(e);
                }
            }
            modalOverlay.style.display = "none";
            isProcessingFreshScan = false;
            initStaffView(false);
        };

    } catch (e) {
        console.error(e);
        modalContent.innerHTML = `
            <h2 style="color: red; margin-top: 0;">エラーが発生しました</h2>
            <button id="fresh-modal-close" style="background: #6c757d; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 15px;">閉じる</button>
        `;
        modalOverlay.style.display = "flex";
        document.getElementById("fresh-modal-close").onclick = () => {
            modalOverlay.style.display = "none";
            isProcessingFreshScan = false;
            initStaffView(false);
        };
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
    if (currentTab !== 'scanner') initStaffView(true);
});

onSnapshot(collection(db, "queues"), () => {
    if (currentTab !== 'scanner') initStaffView(true);
});

checkStaffAuth().then(authed => {
    if (authed) {
        initStaffView(false);
    }
});