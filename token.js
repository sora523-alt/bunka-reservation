import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, deleteDoc, doc, setDoc, getDoc, updateDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

const ENCODED_MASTER_PASS = "MjAwMTA5MDQ=";
const ENCODED_DEFAULT_CUSTOMER_PASS = "YnVua2EyMDI2=";

function decodePass(encodedStr) {
    try {
        return atob(encodedStr);
    } catch (e) {
        return "";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("token-auth-overlay");
    const submitBtn = document.getElementById("token-submit-btn");
    const passInput = document.getElementById("token-password-input");
    const errorMsg = document.getElementById("token-error-msg");

    // すでに認証済みの場合はデータを読み込む
    if (localStorage.getItem("token_authenticated") === "true") {
        if (overlay) overlay.style.display = "none";
        loadResetShopsView();
        loadCustomerDevices();
        loadStaffActionLogs();
        loadCustomerActionLogs();
        loadActiveSessions();
    }

    // 🗂️ 画面内タブの切り替えイベント
    const tabButtons = document.querySelectorAll(".nav-tab-btn");
    const pageViews = document.querySelectorAll(".page-view");

    tabButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
            const targetId = e.target.getAttribute("data-target");

            tabButtons.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");

            pageViews.forEach(v => {
                if (v.id === targetId) {
                    v.style.display = "block";
                } else {
                    v.style.display = "none";
                }
            });
        });
    });

    if (submitBtn) {
        submitBtn.addEventListener("click", () => {
            const inputVal = passInput.value.trim();
            const correctPass = decodePass(ENCODED_MASTER_PASS);

            if (inputVal === correctPass) {
                localStorage.setItem("token_authenticated", "true");
                overlay.style.display = "none";
                document.getElementById("app-nav-tabs").style.display = "flex";
                document.getElementById("view-main").style.display = "block";

                loadResetShopsView();
                loadCustomerDevices();
                loadStaffActionLogs();
                loadCustomerActionLogs();
                loadActiveSessions();
            } else {
                errorMsg.textContent = "❌ パスワードが違います。";
                errorMsg.style.display = "block";
            }
        });
    }

    if (passInput) {
        passInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") submitBtn.click();
        });
    }

    const customerPassInput = document.getElementById("customer-pass-input");
    const saveCustomerPassBtn = document.getElementById("save-customer-pass-btn");

    async function loadCurrentCustomerPassword() {
        try {
            const configDoc = await getDoc(doc(db, "settings", "app_config"));
            const defaultPass = decodePass(ENCODED_DEFAULT_CUSTOMER_PASS);
            if (configDoc.exists()) {
                customerPassInput.value = configDoc.data().customerPassword || defaultPass;
            } else {
                customerPassInput.value = defaultPass;
            }
        } catch (e) {
            console.error("パスワード読込エラー:", e);
        }
    }
    loadCurrentCustomerPassword();

    if (saveCustomerPassBtn) {
        saveCustomerPassBtn.addEventListener("click", async () => {
            const newPass = customerPassInput.value.trim();
            if (!newPass) {
                alert("パスワードを入力してください。");
                return;
            }

            if (confirm(`お客様用パスワードを「${newPass}」に変更しますか？`)) {
                try {
                    await setDoc(doc(db, "settings", "app_config"), {
                        customerPassword: newPass,
                        updatedAt: new Date().toISOString()
                    });
                    alert("お客様用パスワードを変更しました！");
                } catch (e) {
                    alert("変更に失敗しました。エラー: " + e.message);
                }
            }
        });
    }

    // 👷 スタッフ用ログリセット
    const resetStaffLogsBtn = document.getElementById("reset-staff-logs-btn");
    if (resetStaffLogsBtn) {
        resetStaffLogsBtn.addEventListener("click", async () => {
            if (confirm("スタッフ用操作ログをすべてリセットしますか？")) {
                try {
                    const snap = await getDocs(collection(db, "action_logs"));
                    for (const d of snap.docs) {
                        const uuid = d.data().uuid || "";
                        if (uuid.startsWith("staff")) {
                            await deleteDoc(doc(db, "action_logs", d.id));
                        }
                    }
                    alert("スタッフ用操作ログをリセットしました！");
                    loadStaffActionLogs();
                } catch (e) {
                    console.error(e);
                    alert("リセットに失敗しました。");
                }
            }
        });
    }

    // 👤 お客様用ログリセット
    const resetCustomerLogsBtn = document.getElementById("reset-customer-logs-btn");
    if (resetCustomerLogsBtn) {
        resetCustomerLogsBtn.addEventListener("click", async () => {
            if (confirm("お客様用操作ログをすべてリセットしますか？")) {
                try {
                    const snap = await getDocs(collection(db, "action_logs"));
                    for (const d of snap.docs) {
                        const uuid = d.data().uuid || "";
                        if (!uuid.startsWith("staff")) {
                            await deleteDoc(doc(db, "action_logs", d.id));
                        }
                    }
                    alert("お客様用操作ログをリセットしました！");
                    loadCustomerActionLogs();
                } catch (e) {
                    console.error(e);
                    alert("リセットに失敗しました。");
                }
            }
        });
    }
});

// 🕒 年月日と時間が両方表示されるフォーマット関数
function formatTimestamp(ts) {
    if (!ts) return '日時不明';
    let date;
    if (typeof ts.toDate === 'function') date = ts.toDate();
    else if (ts instanceof Date) date = ts;
    else date = new Date(ts);
    if (isNaN(date.getTime())) return '日時不明';
    
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function generateRandomToken() {
    const now = new Date();
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    const blockIndex = Math.floor(totalMinutes / 5);
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate() + blockIndex;
    const x = Math.sin(seed) * 10000;
    const randomNum = Math.floor((x - Math.floor(x)) * 900000) + 100000;
    const remainSec = 300 - ((totalMinutes % 5) * 60 + now.getSeconds());
    return { token: String(randomNum), remainSec };
}

function updateTokenDisplay() {
    const { token, remainSec } = generateRandomToken();
    const tokenBox = document.getElementById("token-box");
    const timerBox = document.getElementById("countdown-timer");
    if (tokenBox) tokenBox.textContent = token;
    if (timerBox) {
        const min = Math.floor(remainSec / 60);
        const sec = remainSec % 60;
        timerBox.textContent = `⏳ 次のコード更新まで: ${min}分${String(sec).padStart(2, '0')}秒`;
    }
}
setInterval(updateTokenDisplay, 1000);
updateTokenDisplay();

async function loadResetShopsView() {
    if (localStorage.getItem("token_authenticated") !== "true") return;
    const container = document.getElementById("reset-shops-container");
    if (!container) return;
    try {
        const shopsSnapshot = await getDocs(collection(db, "shops"));
        if (shopsSnapshot.empty) {
            container.innerHTML = "<p style='color: #666; text-align: center;'>店舗データがありません。</p>";
            return;
        }
        let html = "";
        shopsSnapshot.forEach(shopDoc => {
            const shopId = shopDoc.id;
            const shopData = shopDoc.data();
            const shopName = shopData.name || shopData.shopName || shopId;
            html += `
                <div style="background: #fdfdfd; border: 1px solid #ddd; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <strong>${shopName}</strong>
                    <div style="display: flex; gap: 10px; margin-top: 8px;">
                        <button class="danger-btn reset-history-btn" data-shopid="${shopId}" data-status="completed" style="background: #17a2b8; flex: 1; padding: 8px; font-size: 12px;">✅ 受付完了履歴をリセット</button>
                        <button class="danger-btn reset-history-btn" data-shopid="${shopId}" data-status="cancelled" style="background: #dc3545; flex: 1; padding: 8px; font-size: 12px;">❌ キャンセル履歴をリセット</button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        container.querySelectorAll(".reset-history-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const targetShopId = e.target.getAttribute("data-shopid");
                const targetStatus = e.target.getAttribute("data-status");
                const statusName = targetStatus === 'completed' ? '受付完了履歴' : 'キャンセル/期限切れ履歴';
                if (confirm(`本当にこの店舗の【${statusName}】をすべて削除してリセットしますか？`)) {
                    let qRef = targetStatus === 'completed' ? 
                        query(collection(db, "queues"), where("shopId", "==", targetShopId), where("status", "==", "completed")) :
                        query(collection(db, "queues"), where("shopId", "==", targetShopId), where("status", "in", ["cancelled", "expired"]));
                    const snap = await getDocs(qRef);
                    for (const d of snap.docs) {
                        await deleteDoc(doc(db, "queues", d.id));
                    }
                    alert(`${statusName}のリセットが完了しました！`);
                }
            });
        });
    } catch (e) {
        container.innerHTML = "<p style='color: red;'>店舗情報の取得に失敗しました。</p>";
    }
}

async function loadCustomerDevices() {
    if (localStorage.getItem("token_authenticated") !== "true") return;
    const container = document.getElementById("customer-device-list-container");
    if (!container) return;
    try {
        const snapshot = await getDocs(collection(db, "queues"));
        const uuids = new Set();
        snapshot.forEach(d => {
            if (d.data().deviceUuid && !d.data().deviceUuid.startsWith("staff")) {
                uuids.add(d.data().deviceUuid);
            }
        });
        if (uuids.size === 0) {
            container.innerHTML = "<p style='color: #666; text-align: center;'>お客様の端末履歴はありません。</p>";
            return;
        }
        let html = "";
        uuids.forEach(uuid => {
            html += `<div class="device-item"><div><strong>お客様端末UUID:</strong> <code style="background:#eee; padding:2px 4px; border-radius:4px;">${uuid}</code></div></div>`;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = "<p style='color: red;'>取得に失敗しました。</p>";
    }
}

async function loadStaffActionLogs() {
    if (localStorage.getItem("token_authenticated") !== "true") return;
    const container = document.getElementById("staff-action-log-container");
    if (!container) return;
    try {
        const snap = await getDocs(collection(db, "action_logs"));
        let logsList = [];
        snap.forEach(d => {
            const data = d.data();
            const uuid = data.uuid || "";
            if (uuid.startsWith("staff")) {
                logsList.push({ id: d.id, ...data });
            }
        });

        if (logsList.length === 0) {
            container.innerHTML = "<p style='color: #666;'>スタッフ用ログはまだありません。</p>";
            return;
        }

        logsList.sort((a, b) => {
            const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeB - timeA;
        });

        let html = "";
        logsList.forEach(data => {
            const timeStr = formatTimestamp(data.createdAt);
            const fullUuid = data.uuid || '不明';
            const shortUuid = fullUuid.slice(0, 10) + '...';
            html += `<div style="padding: 6px 0; border-bottom: 1px solid #eaeaea;">[${timeStr}] 端末: <code class="log-uuid-link" data-fulluuid="${fullUuid}" style="background:#e2f0fb; color:#0056b3; padding:2px 6px; border-radius:4px; cursor:pointer; font-weight:bold;" title="クリックしてこのスタッフ端末をハイライト">${shortUuid}</code> — <strong>${data.action || ''}</strong> (${data.details || ''})</div>`;
        });
        container.innerHTML = html;

        container.querySelectorAll(".log-uuid-link").forEach(codeEl => {
            codeEl.addEventListener("click", () => {
                const targetUuid = codeEl.getAttribute("data-fulluuid");
                const deviceCards = document.querySelectorAll(".staff-device-card");
                
                let found = false;
                deviceCards.forEach(card => {
                    const cardId = card.getAttribute("data-id");
                    if (cardId === targetUuid || cardId.startsWith(targetUuid.replace('...', ''))) {
                        found = true;
                        card.scrollIntoView({ behavior: "smooth", block: "center" });
                        const originalBg = card.style.background;
                        card.style.background = "#fff3cd";
                        card.style.borderColor = "#ffc107";
                        card.style.transition = "background 0.5s ease";
                        setTimeout(() => {
                            card.style.background = originalBg;
                            card.style.borderColor = card.getAttribute("data-islocked") === "true" ? "#dc3545" : "#ddd";
                        }, 2000);
                    }
                });

                if (!found) {
                    alert(`該当するスタッフ端末ID「${targetUuid}」は現在ログインしていないか、見つかりませんでした。`);
                }
            });
        });

    } catch (e) {
        container.innerHTML = "ログの取得に失敗しました。";
    }
}

async function loadCustomerActionLogs() {
    if (localStorage.getItem("token_authenticated") !== "true") return;
    const container = document.getElementById("customer-action-log-container");
    if (!container) return;
    try {
        const snap = await getDocs(collection(db, "action_logs"));
        let logsList = [];
        snap.forEach(d => {
            const data = d.data();
            const uuid = data.uuid || "";
            if (!uuid.startsWith("staff")) {
                logsList.push({ id: d.id, ...data });
            }
        });

        if (logsList.length === 0) {
            container.innerHTML = "<p style='color: #666;'>お客様用ログはまだありません。</p>";
            return;
        }

        logsList.sort((a, b) => {
            const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeB - timeA;
        });

        let html = "";
        logsList.forEach(data => {
            const timeStr = formatTimestamp(data.createdAt);
            const fullUuid = data.uuid || '不明';
            const shortUuid = fullUuid.length > 10 ? fullUuid.slice(0, 10) + '...' : fullUuid;
            html += `<div style="padding: 6px 0; border-bottom: 1px solid #eaeaea;">[${timeStr}] 端末UUID: <code style="background:#eee; padding:2px 4px; border-radius:4px;">${shortUuid}</code> — <strong>${data.action || ''}</strong> (${data.details || ''})</div>`;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = "ログの取得に失敗しました。";
    }
}

onSnapshot(collection(db, "action_logs"), () => {
    if (localStorage.getItem("token_authenticated") === "true") {
        loadStaffActionLogs();
        loadCustomerActionLogs();
    }
});

async function loadActiveSessions() {
    if (localStorage.getItem("token_authenticated") !== "true") return;
    const container = document.getElementById("device-list-container");
    if (!container) return;
    try {
        const snapshot = await getDocs(collection(db, "staff_sessions"));
        if (snapshot.empty) {
            container.innerHTML = "<p style='color: #666; text-align: center;'>現在ログイン中のスタッフ端末はありません。</p>";
            return;
        }
        let html = "";
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const sessionId = docSnap.id;
            const loginTime = formatTimestamp(data.loginAt);
            const isLocked = data.isLocked === true;

            html += `
                <div class="device-item staff-device-card" data-id="${sessionId}" data-islocked="${isLocked}" style="cursor: pointer; background: ${isLocked ? '#ffebee' : '#fdfdfd'}; border: 2px solid ${isLocked ? '#dc3545' : '#ddd'};">
                    <div>
                        <strong>スタッフ端末ID:</strong> <code style="background:#eee; padding:2px 4px; border-radius:4px;">${sessionId}</code><br>
                        <span style="font-size: 12px; color: #555;">ログイン時刻: ${loginTime} | 状態: <strong>${isLocked ? '🔒 ロック中' : '🟢 通常'}</strong></span>
                    </div>
                    <button class="danger-btn kick-btn" data-id="${sessionId}">強制ログアウト</button>
                </div>
            `;
        });
        container.innerHTML = html;

        container.querySelectorAll(".staff-device-card").forEach(card => {
            card.addEventListener("click", async (e) => {
                if (e.target.tagName === "BUTTON") return;
                const targetId = card.getAttribute("data-id");
                const sessionDoc = await getDoc(doc(db, "staff_sessions", targetId));
                if (sessionDoc.exists()) {
                    const currentLock = sessionDoc.data().isLocked === true;
                    const nextLockState = !currentLock;
                    if (confirm(`このスタッフ端末を【${nextLockState ? 'ロック' : 'ロック解除'}】しますか？`)) {
                        await updateDoc(doc(db, "staff_sessions", targetId), { isLocked: nextLockState });
                        alert(nextLockState ? "端末をロックしました。" : "ロックを解除しました。");
                        loadActiveSessions();
                    }
                }
            });
        });

        container.querySelectorAll(".kick-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const targetId = e.target.getAttribute("data-id");
                if (confirm("この端末を強制ログアウトさせますか？")) {
                    await deleteDoc(doc(db, "staff_sessions", targetId));
                    alert("強制ログアウトしました。");
                    loadActiveSessions();
                }
            });
        });
    } catch (err) {
        container.innerHTML = "<p style='color: red;'>端末情報の取得に失敗しました。</p>";
    }
}

onSnapshot(collection(db, "staff_sessions"), () => { 
    if (localStorage.getItem("token_authenticated") === "true") {
        loadActiveSessions(); 
    }
});