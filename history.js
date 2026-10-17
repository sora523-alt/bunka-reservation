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

async function logAction(action, details) {
    try {
        await addDoc(collection(db, "action_logs"), {
            uuid: staffSessionId,
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
    return String(Math.floor((x - Math.floor(x)) * 900000) + 100000);
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

// 🔒 管理画面からの強制ログアウトおよびオレンジ色ロックの監視
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
                await logAction("スタッフログイン(履歴画面)", `端末ID: ${staffSessionId} が履歴画面にログインしました`);
                document.getElementById("auth-overlay").style.display = "none";
                initHistoryView();
            } else {
                errorMsg.textContent = "❌ トークンが正しくありません。";
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

function formatTimestamp(ts) {
    if (!ts) return '不明';
    let date;
    if (typeof ts.toDate === 'function') {
        date = ts.toDate();
    } else if (ts instanceof Date) {
        date = ts;
    } else {
        date = new Date(ts);
    }
    if (isNaN(date.getTime())) return '不明';

    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function getTimestampMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    const date = ts instanceof Date ? ts : new Date(ts);
    return isNaN(date.getTime()) ? 0 : date.getTime();
}

let historyTab = 'completed';
let cachedShopsData = [];
let isInitialLoaded = false;

// 🔄 初回ロード＆データフェッチ
async function initHistoryView(isBackground = false) {
    const isAuth = await checkStaffAuth();
    if (!isAuth) return;

    const container = document.getElementById("history-container");
    if (!container) return;

    if (!isInitialLoaded) {
        container.innerHTML = "<p>読み込み中...</p>";
    }

    try {
        const shopsSnapshot = await getDocs(collection(db, "shops"));
        const processedShopNames = new Set();
        cachedShopsData = [];

        for (const shopDoc of shopsSnapshot.docs) {
            const shopData = shopDoc.data();
            const shopId = shopDoc.id;
            const rawShopName = shopData.name || shopData.shopName || shopId;
            const normalizedName = rawShopName.trim().replace(/\s+/g, '').toLowerCase();

            if (processedShopNames.has(normalizedName)) continue;
            processedShopNames.add(normalizedName);

            const qCompleted = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "==", "completed"));
            const qCancelled = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "in", ["cancelled", "expired"]));

            const [completedSnap, cancelledSnap] = await Promise.all([
                getDocs(qCompleted),
                getDocs(qCancelled)
            ]);

            const completedList = [];
            const cancelledList = [];

            completedSnap.forEach((qDoc) => {
                const docId = qDoc.id;
                const qData = qDoc.data();
                const idShort = docId.slice(-4).toUpperCase();
                const typeText = qData.type === "timeslot" ? `時間予約 (${qData.date || ''} ${qData.timeSlot})` : "当日順番待ち";
                const partySizeText = qData.partySize ? ` (${qData.partySize}人)` : " (1人)";
                const createdTime = formatTimestamp(qData.createdAt);
                const completedTime = formatTimestamp(qData.completedAt);
                const createdMillis = getTimestampMillis(qData.createdAt);

                const searchTarget = `${docId} ${idShort} ${typeText} ${qData.date || ''} ${qData.timeSlot || ''}`.toLowerCase();

                completedList.push({
                    createdMillis,
                    searchTarget,
                    html: `
                        <div style="background: #f8f9fa; border: 1px solid #bce8f1; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 5px solid #17a2b8;">
                            <span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">受付完了</span>
                            <strong>${typeText}</strong>${partySizeText} — ID: <strong>${idShort}</strong><br>
                            <span style="font-size: 13px; color: #333; margin-top: 4px; display: block;">
                                🕒 <strong>予約時間:</strong> ${createdTime} ➔ 🏁 <strong>案内完了時間:</strong> <span style="color: #007bff; font-weight: bold;">${completedTime}</span>
                            </span>
                        </div>
                    `
                });
            });

            cancelledSnap.forEach((qDoc) => {
                const docId = qDoc.id;
                const qData = qDoc.data();
                const idShort = docId.slice(-4).toUpperCase();
                const typeText = qData.type === "timeslot" ? `時間予約 (${qData.date || ''} ${qData.timeSlot})` : "当日順番待ち";
                const partySizeText = qData.partySize ? ` (${qData.partySize}人)` : " (1人)";
                const createdTime = formatTimestamp(qData.createdAt);
                const cancelledTime = formatTimestamp(qData.cancelledAt);
                const statusLabel = qData.status === "expired" ? "期限切れ" : "キャンセル";
                const createdMillis = getTimestampMillis(qData.createdAt);

                const searchTarget = `${docId} ${idShort} ${typeText} ${qData.date || ''} ${qData.timeSlot || ''} ${statusLabel}`.toLowerCase();

                cancelledList.push({
                    createdMillis,
                    searchTarget,
                    html: `
                        <div style="background: #fff5f5; border: 1px solid #ffccd5; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 5px solid #ff4d4d;">
                            <span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">${statusLabel}</span>
                            <strong>${typeText}</strong>${partySizeText} — ID: <strong>${idShort}</strong><br>
                            <span style="font-size: 13px; color: #333; margin-top: 4px; display: block;">
                                🕒 <strong>予約時間:</strong> ${createdTime} ➔ ❌ <strong>キャンセル時間:</strong> <span style="color: #d32f2f; font-weight: bold;">${cancelledTime}</span>
                            </span>
                        </div>
                    `
                });
            });

            completedList.sort((a, b) => b.createdMillis - a.createdMillis);
            cancelledList.sort((a, b) => b.createdMillis - a.createdMillis);

            cachedShopsData.push({
                shopId,
                rawShopName,
                completedList,
                cancelledList
            });
        }

        if (!isInitialLoaded) {
            renderHistoryUI();
            isInitialLoaded = true;
        } else {
            updateHistoryContentOnly();
        }

    } catch (e) {
        console.error("エラー:", e);
        if (!isInitialLoaded) {
            container.innerHTML = "データの読み込みに失敗しました。";
        }
    }
}

// 🖥️ UI全体の構築（初回のみ、またはタブ切り替え時）
function renderHistoryUI() {
    const container = document.getElementById("history-container");
    if (!container) return;
    
    container.innerHTML = "";

    cachedShopsData.forEach(shop => {
        const shopCard = document.createElement("div");
        shopCard.className = "card";
        shopCard.id = `shop-card-${shop.shopId}`;

        shopCard.innerHTML = `
            <h2>${shop.rawShopName}</h2>
            
            <div style="margin-bottom: 15px;">
                <input type="text" class="history-search-input" data-shopid="${shop.shopId}" placeholder="🔍 ID（下4桁など）や日付で検索..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; font-size: 14px;">
            </div>

            <div style="display: flex; gap: 8px; margin-bottom: 15px; border-bottom: 2px solid #eee; padding-bottom: 10px;">
                <button type="button" class="history-sub-tab" data-shopid="${shop.shopId}" data-tab="completed" style="padding: 8px 16px; background: ${historyTab === 'completed' ? '#17a2b8' : '#f0f0f0'}; color: ${historyTab === 'completed' ? 'white' : '#333'}; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                    ✅ 受付履歴
                </button>
                <button type="button" class="history-sub-tab" data-shopid="${shop.shopId}" data-tab="cancelled" style="padding: 8px 16px; background: ${historyTab === 'cancelled' ? '#dc3545' : '#f0f0f0'}; color: ${historyTab === 'cancelled' ? 'white' : '#333'}; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                    ❌ キャンセル履歴
                </button>
            </div>

            <div class="history-tab-content-area" id="history-content-${shop.shopId}" style="margin-bottom: 20px;">
                ${getShopTabContentHtml(shop)}
            </div>
        `;

        container.appendChild(shopCard);
    });

    // イベントリスナーの付与（入力時にフォーカスが外れないよう、inputイベントでDOMだけを部分更新する）
    container.querySelectorAll(".history-search-input").forEach(input => {
        input.addEventListener("input", (e) => {
            const shopId = e.target.getAttribute("data-shopid");
            const keyword = e.target.value.toLowerCase().trim();
            updateSingleShopContent(shopId, keyword);
        });
    });

    container.querySelectorAll(".history-sub-tab").forEach(tabBtn => {
        tabBtn.addEventListener("click", (e) => {
            historyTab = e.target.getAttribute("data-tab");
            renderHistoryUI();
        });
    });
}

// 特定の店舗カードのリスト部分だけを高速に更新（フォーカス維持）
function updateSingleShopContent(shopId, keyword) {
    const shop = cachedShopsData.find(s => s.shopId === shopId);
    if (!shop) return;

    const contentArea = document.getElementById(`history-content-${shopId}`);
    if (contentArea) {
        contentArea.innerHTML = getShopTabContentHtml(shop, keyword);
    }
}

// 既存の入力フォーカスを維持したままデータだけ更新する場合
function updateHistoryContentOnly() {
    cachedShopsData.forEach(shop => {
        const inputEl = document.querySelector(`.history-search-input[data-shopid="${shop.shopId}"]`);
        const keyword = inputEl ? inputEl.value.toLowerCase().trim() : "";
        updateSingleShopContent(shopId, keyword);
    });
}

function getShopTabContentHtml(shop, keyword = "") {
    const filterList = (list) => {
        if (!keyword) return list;
        return list.filter(item => item.searchTarget.includes(keyword));
    };

    if (historyTab === 'completed') {
        const filtered = filterList(shop.completedList);
        const listHtml = filtered.length > 0 ? filtered.map(i => i.html).join("") : "<p style='color: #666; padding: 10px;'>条件に一致する受付完了履歴はありません</p>";
        return `
            <h3 style="color: #17a2b8; margin-top: 0;">✅ 受付履歴（案内完了）</h3>
            ${listHtml}
        `;
    } else {
        const filtered = filterList(shop.cancelledList);
        const listHtml = filtered.length > 0 ? filtered.map(i => i.html).join("") : "<p style='color: #666; padding: 10px;'>条件に一致するキャンセル履歴はありません</p>";
        return `
            <h3 style="color: #dc3545; margin-top: 0;">❌ キャンセル履歴</h3>
            ${listHtml}
        `;
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

updateLastRefreshTime();

onSnapshot(collection(db, "queues"), () => {
    checkStaffAuth().then(authed => {
        if (authed) {
            initHistoryView(true);
            updateLastRefreshTime();
        }
    });
});

setInterval(() => {
    checkStaffAuth().then(authed => {
        if (authed) {
            initHistoryView(true);
            updateLastRefreshTime();
        }
    });
}, 30000);

checkStaffAuth().then(authed => {
    if (authed) {
        initHistoryView(false);
    }
});