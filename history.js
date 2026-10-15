import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, deleteDoc, doc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let historyTab = 'completed';
let searchQuery = ''; 

async function loadHistoryView() {
    const container = document.getElementById("history-container");
    if (!container) return;
    
    // 💡 描画前に毎回コンテナを完全に空にして二重描画を防止
    container.innerHTML = "";

    try {
        const shopsSnapshot = await getDocs(collection(db, "shops"));
        const processedShopNames = new Set();

        for (const shopDoc of shopsSnapshot.docs) {
            const shopData = shopDoc.data();
            const shopId = shopDoc.id;
            const rawShopName = shopData.name || shopData.shopName || shopId;
            const normalizedName = rawShopName.trim().replace(/\s+/g, '').toLowerCase();

            if (processedShopNames.has(normalizedName)) continue;
            processedShopNames.add(normalizedName);

            const shopCard = document.createElement("div");
            shopCard.className = "card";

            const qCompleted = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "==", "completed"));
            const qCancelled = query(collection(db, "queues"), where("shopId", "==", shopId), where("status", "in", ["cancelled", "expired"]));

            const [completedSnap, cancelledSnap] = await Promise.all([
                getDocs(qCompleted),
                getDocs(qCancelled)
            ]);

            const completedDocIds = [];
            const cancelledDocIds = [];
            
            const completedItemsHtmlArray = [];
            const cancelledItemsHtmlArray = [];

            const keyword = searchQuery.toLowerCase().trim();

            completedSnap.forEach((qDoc) => {
                const docId = qDoc.id;
                if (completedDocIds.includes(docId)) return;

                const qData = qDoc.data();
                const idShort = docId.slice(-4).toUpperCase();
                const typeText = qData.type === "timeslot" ? `時間予約 (${qData.date || ''} ${qData.timeSlot})` : "当日順番待ち";
                const partySizeText = qData.partySize ? ` (${qData.partySize}人)` : " (1人)";
                const createdTime = formatTimestamp(qData.createdAt);
                const completedTime = formatTimestamp(qData.completedAt);

                const searchTarget = `${docId} ${idShort} ${typeText} ${qData.date || ''} ${qData.timeSlot || ''}`.toLowerCase();
                if (keyword && !searchTarget.includes(keyword)) return;

                completedDocIds.push(docId);

                completedItemsHtmlArray.push(`
                    <div style="background: #f8f9fa; border: 1px solid #bce8f1; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 5px solid #17a2b8;">
                        <span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">受付完了</span>
                        <strong>${typeText}</strong>${partySizeText} — ID: <strong>${idShort}</strong><br>
                        <span style="font-size: 13px; color: #333; margin-top: 4px; display: block;">
                            🕒 <strong>予約時間:</strong> ${createdTime} ➔ 🏁 <strong>案内完了時間:</strong> <span style="color: #007bff; font-weight: bold;">${completedTime}</span>
                        </span>
                    </div>
                `);
            });

            cancelledSnap.forEach((qDoc) => {
                const docId = qDoc.id;
                if (cancelledDocIds.includes(docId)) return;

                const qData = qDoc.data();
                const idShort = docId.slice(-4).toUpperCase();
                const typeText = qData.type === "timeslot" ? `時間予約 (${qData.date || ''} ${qData.timeSlot})` : "当日順番待ち";
                const partySizeText = qData.partySize ? ` (${qData.partySize}人)` : " (1人)";
                const createdTime = formatTimestamp(qData.createdAt);
                const cancelledTime = formatTimestamp(qData.cancelledAt);
                const statusLabel = qData.status === "expired" ? "期限切れ" : "キャンセル";

                const searchTarget = `${docId} ${idShort} ${typeText} ${qData.date || ''} ${qData.timeSlot || ''} ${statusLabel}`.toLowerCase();
                if (keyword && !searchTarget.includes(keyword)) return;

                cancelledDocIds.push(docId);

                cancelledItemsHtmlArray.push(`
                    <div style="background: #fff5f5; border: 1px solid #ffccd5; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 5px solid #ff4d4d;">
                        <span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">${statusLabel}</span>
                        <strong>${typeText}</strong>${partySizeText} — ID: <strong>${idShort}</strong><br>
                        <span style="font-size: 13px; color: #333; margin-top: 4px; display: block;">
                            🕒 <strong>予約時間:</strong> ${createdTime} ➔ ❌ <strong>キャンセル時間:</strong> <span style="color: #d32f2f; font-weight: bold;">${cancelledTime}</span>
                        </span>
                    </div>
                `);
            });

            const completedListHtml = completedItemsHtmlArray.length > 0 ? completedItemsHtmlArray.join("") : "<p style='color: #666; padding: 10px;'>条件に一致する受付完了履歴はありません</p>";
            const cancelledListHtml = cancelledItemsHtmlArray.length > 0 ? cancelledItemsHtmlArray.join("") : "<p style='color: #666; padding: 10px;'>条件に一致するキャンセル履歴はありません</p>";

            let activeTabContentHtml = "";
            let currentResetTargetIds = [];
            let resetBtnText = "";

            if (historyTab === 'completed') {
                activeTabContentHtml = `
                    <h3 style="color: #17a2b8; margin-top: 0;">✅ 受付履歴（案内完了）</h3>
                    ${completedListHtml}
                `;
                currentResetTargetIds = completedDocIds;
                resetBtnText = "この店舗の「表示中の受付履歴」をすべてリセット（削除）";
            } else {
                activeTabContentHtml = `
                    <h3 style="color: #dc3545; margin-top: 0;">❌ キャンセル履歴</h3>
                    ${cancelledListHtml}
                `;
                currentResetTargetIds = cancelledDocIds;
                resetBtnText = "この店舗の「表示中のキャンセル履歴」をすべてリセット（削除）";
            }

            shopCard.innerHTML = `
                <h2>${rawShopName}</h2>
                
                <div style="margin-bottom: 15px;">
                    <input type="text" id="history-search-${shopId}" value="${searchQuery}" placeholder="🔍 ID（下4桁など）や日付で検索..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; font-size: 14px;">
                </div>

                <div style="display: flex; gap: 8px; margin-bottom: 15px; border-bottom: 2px solid #eee; padding-bottom: 10px;">
                    <button type="button" class="history-sub-tab" data-tab="completed" style="padding: 8px 16px; background: ${historyTab === 'completed' ? '#17a2b8' : '#f0f0f0'}; color: ${historyTab === 'completed' ? 'white' : '#333'}; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                        ✅ 受付履歴
                    </button>
                    <button type="button" class="history-sub-tab" data-tab="cancelled" style="padding: 8px 16px; background: ${historyTab === 'cancelled' ? '#dc3545' : '#f0f0f0'}; color: ${historyTab === 'cancelled' ? 'white' : '#333'}; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                        ❌ キャンセル履歴
                    </button>
                </div>

                <div id="history-tab-content" style="margin-bottom: 20px;">
                    ${activeTabContentHtml}
                </div>

                <div style="border-top: 1px dashed #ddd; padding-top: 15px; background: #fff8f8; padding: 12px; border-radius: 6px;">
                    <button type="button" id="reset-btn-${shopId}" style="background: #dc3545; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-size: 13px; font-weight: bold; width: 100%;">
                        🗑️ ${resetBtnText}
                    </button>
                </div>
            `;

            container.appendChild(shopCard);

            const searchInput = shopCard.querySelector(`#history-search-${shopId}`);
            if (searchInput) {
                searchInput.addEventListener("input", (e) => {
                    searchQuery = e.target.value;
                    loadHistoryView();
                });
            }

            shopCard.querySelectorAll(".history-sub-tab").forEach(tabBtn => {
                tabBtn.addEventListener("click", (e) => {
                    historyTab = e.target.getAttribute("data-tab");
                    loadHistoryView();
                });
            });

            const resetBtn = shopCard.querySelector(`#reset-btn-${shopId}`);
            resetBtn.addEventListener("click", async () => {
                const targetName = historyTab === 'completed' ? '受付履歴' : 'キャンセル履歴';
                if (confirm(`本当に「${rawShopName}」の${targetName}をすべて削除してリセットしますか？`)) {
                    try {
                        for (const docId of currentResetTargetIds) {
                            await deleteDoc(doc(db, "queues", docId));
                        }
                        alert(`${targetName}をリセットしました！`);
                        loadHistoryView();
                    } catch (err) {
                        console.error("リセットエラー:", err);
                        alert("リセットに失敗しました。");
                    }
                }
            });
        }
    } catch (e) {
        console.error("エラー:", e);
        container.innerHTML = "データの読み込みに失敗しました。";
    }
}

loadHistoryView();

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
    loadHistoryView();
    updateLastRefreshTime();
});

setInterval(() => {
    loadHistoryView();
    updateLastRefreshTime();
}, 30000);