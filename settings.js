import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, updateDoc, doc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

function formatAutoDate(inputStr) {
    const clean = inputStr.replace(/\D/g, '');
    if (clean.length === 8) {
        const y = clean.slice(0, 4);
        const m = parseInt(clean.slice(4, 6), 10);
        const d = parseInt(clean.slice(6, 8), 10);
        return `${y}年${m}月${d}日`;
    }
    return inputStr.trim();
}

let selectedShopId = null;
let activeSettingDate = null;

async function loadSettingsView() {
    const container = document.getElementById("settings-container");
    if (!container) return;
    container.innerHTML = "";

    const todayStr = getTodayDateString();

    try {
        const shopsSnapshot = await getDocs(collection(db, "shops"));
        if (shopsSnapshot.empty) {
            container.innerHTML = "<p>店舗データがありません。</p>";
            return;
        }

        if (!selectedShopId) {
            selectedShopId = shopsSnapshot.docs[0].id;
        }

        let shopSelectorHtml = `<div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">`;
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
        shopsSnapshot.docs.forEach(d => {
            if (d.id === selectedShopId) shopData = d.data();
        });

        const dateSlotsMap = shopData.dateSlots || {
            [todayStr]: shopData.timeSlots || { "10:00-10:30": 5, "11:00-11:30": 5 }
        };

        const availableDates = Object.keys(dateSlotsMap);
        if (!activeSettingDate || !availableDates.includes(activeSettingDate)) {
            activeSettingDate = availableDates.includes(todayStr) ? todayStr : availableDates[0];
        }

        const autoExpireMinutes = shopData.autoExpireMinutes !== undefined ? shopData.autoExpireMinutes : 1;
        const minutesPerGroup = shopData.minutesPerGroup !== undefined ? shopData.minutesPerGroup : 10;
        const standardGroupSize = shopData.standardGroupSize !== undefined ? shopData.standardGroupSize : 4;

        let slotsSettingsHtml = "";
        const currentSlots = dateSlotsMap[activeSettingDate] || {};
        for (const [time, limit] of Object.entries(currentSlots)) {
            slotsSettingsHtml += `
                <div class="slot-row" style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
                    <input type="text" class="slot-time-input" value="${time}" placeholder="例: 14:00-14:30" style="width: 110px; padding: 6px;">
                    <span>定員:</span>
                    <input type="number" class="slot-limit-input" value="${limit}" style="width: 60px; padding: 6px;"> 人
                    <button type="button" class="del-slot-btn" style="background:#ff4d4d; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">削除</button>
                </div>
            `;
        }

        let dateTabsHtml = `<div style="display: flex; gap: 8px; margin-bottom: 15px; flex-wrap: wrap; align-items: center;">`;
        availableDates.forEach(dStr => {
            const isAct = dStr === activeSettingDate;
            dateTabsHtml += `<button type="button" class="date-tab-btn" data-date="${dStr}" style="padding: 6px 12px; background: ${isAct ? '#28a745' : '#e0e0e0'}; color: ${isAct ? 'white' : '#333'}; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">📅 ${dStr}</button>`;
        });
        dateTabsHtml += `</div>`;

        let deleteDateButtonHtml = "";
        if (availableDates.length > 1) {
            deleteDateButtonHtml = `<button type="button" id="delete-active-date-btn" style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; margin-bottom: 15px;">🗑️ 選択中の日付（${activeSettingDate}）を削除する</button>`;
        }

        const mainCard = document.createElement("div");
        mainCard.className = "card";
        mainCard.innerHTML = `
            <h2>店舗選択: ${shopData.name}</h2>
            ${shopSelectorHtml}

            <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">

            <h3 style="color: #0056b3;">⚙️ 運用・タイムスロット設定</h3>
            <div style="margin-top: 15px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <div>
                    <label><strong>基準人数:</strong></label><br>
                    <input type="number" id="group-size-input" value="${standardGroupSize}" style="width: 80px; padding: 6px; margin-top: 4px;"> 人 あたり
                </div>
                <div>
                    <label><strong>かかる時間:</strong></label><br>
                    <input type="number" id="time-per-group-input" value="${minutesPerGroup}" style="width: 80px; padding: 6px; margin-top: 4px;"> 分
                </div>
            </div>

            <div style="margin-top: 20px; background: #fffde7; padding: 12px; border-radius: 6px; border: 1px solid #ffe082;">
                <label><strong style="color: #856404;">📢 呼び出し後のご案内猶予時間（自動キャンセル時間）:</strong></label><br>
                <input type="number" id="expire-input" value="${autoExpireMinutes}" style="width: 80px; padding: 6px; margin-top: 6px;"> 分
            </div>

            <div style="margin-top: 20px;">
                <h4 style="margin-top: 0;">📅 設定する日付の選択</h4>
                ${dateTabsHtml}
                ${deleteDateButtonHtml}
                
                <div style="display: flex; gap: 8px; margin-bottom: 15px; align-items: center; flex-wrap: wrap;">
                    <input type="text" id="new-date-input" placeholder="例: 20261016" style="padding: 6px; width: 160px;">
                    <button type="button" id="add-date-btn" style="background: #17a2b8; color: white; border: none; padding: 7px 14px; border-radius: 4px; cursor: pointer; font-weight: bold;">＋ 新しい日付を追加</button>
                </div>
            </div>

            <h4 style="margin-top: 25px;">⏰ 【${activeSettingDate}】の時間予約枠と定員の編集</h4>
            <div id="slots-editor">
                ${slotsSettingsHtml}
            </div>
            <button id="add-slot-row-btn" style="background: #17a2b8; color:white; border:none; margin-top: 10px; padding: 6px 12px; border-radius: 4px; cursor: pointer;">＋ 時間枠を手動で追加する</button>

            <button id="save-settings-btn" style="background: #28a745; color:white; border:none; margin-top: 25px; width:100%; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 16px;">設定を保存する</button>
        `;

        container.appendChild(mainCard);

        mainCard.querySelectorAll(".shop-select-tab").forEach(btn => {
            btn.addEventListener("click", (e) => {
                selectedShopId = e.target.getAttribute("data-shopid");
                loadSettingsView();
            });
        });

        mainCard.querySelectorAll(".date-tab-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                activeSettingDate = e.target.getAttribute("data-date");
                loadSettingsView();
            });
        });

        const deleteDateBtn = mainCard.querySelector("#delete-active-date-btn");
        if (deleteDateBtn) {
            deleteDateBtn.addEventListener("click", async () => {
                if (confirm(`本当に日付「${activeSettingDate}」を削除しますか？`)) {
                    delete dateSlotsMap[activeSettingDate];
                    const remainingDates = Object.keys(dateSlotsMap);
                    activeSettingDate = remainingDates.length > 0 ? remainingDates[0] : null;
                    await updateDoc(doc(db, "shops", selectedShopId), { dateSlots: dateSlotsMap });
                    alert("日付を削除しました！");
                    loadSettingsView();
                }
            });
        }

        const addDateBtn = mainCard.querySelector("#add-date-btn");
        if (addDateBtn) {
            addDateBtn.addEventListener("click", () => {
                const rawInput = mainCard.querySelector("#new-date-input").value;
                const formattedDate = formatAutoDate(rawInput);
                if (!formattedDate || formattedDate.length < 5) {
                    alert("有効な日付を入力してください（例: 20261016）。");
                    return;
                }
                if (!dateSlotsMap[formattedDate]) {
                    dateSlotsMap[formattedDate] = {};
                    activeSettingDate = formattedDate;
                    updateDoc(doc(db, "shops", selectedShopId), { dateSlots: dateSlotsMap }).then(() => {
                        alert(`新しい日付「${formattedDate}」を追加しました！`);
                        loadSettingsView();
                    });
                } else {
                    alert("その日付はすでに存在します。");
                }
            });
        }

        const addSlotBtn = mainCard.querySelector("#add-slot-row-btn");
        if (addSlotBtn) {
            addSlotBtn.addEventListener("click", () => {
                const editor = mainCard.querySelector("#slots-editor");
                const newRow = document.createElement("div");
                newRow.className = "slot-row";
                newRow.style.cssText = "display: flex; gap: 10px; align-items: center; margin-bottom: 8px;";
                newRow.innerHTML = `
                    <input type="text" class="slot-time-input" value="" placeholder="例: 14:00-14:30" style="width: 110px; padding: 6px;">
                    <span>定員:</span>
                    <input type="number" class="slot-limit-input" value="5" style="width: 60px; padding: 6px;"> 人
                    <button type="button" class="del-slot-btn" style="background:#ff4d4d; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">削除</button>
                `;
                editor.appendChild(newRow);
                bindDeleteButtons(newRow);
            });
        }

        function bindDeleteButtons(targetArea) {
            targetArea.querySelectorAll(".del-slot-btn").forEach(btn => {
                btn.onclick = (e) => {
                    e.target.closest(".slot-row").remove();
                };
            });
        }
        bindDeleteButtons(mainCard);

        const saveSettingsBtn = mainCard.querySelector("#save-settings-btn");
        saveSettingsBtn.addEventListener("click", async () => {
            const rows = mainCard.querySelectorAll(".slot-row");
            const newTimeSlots = {};
            rows.forEach(row => {
                const time = row.querySelector(".slot-time-input").value.trim();
                const limit = parseInt(row.querySelector(".slot-limit-input").value) || 0;
                if (time) newTimeSlots[time] = limit;
            });

            dateSlotsMap[activeSettingDate] = newTimeSlots;

            const newGroupSize = parseInt(mainCard.querySelector("#group-size-input").value) || 4;
            const newMinutesPerGroup = parseInt(mainCard.querySelector("#time-per-group-input").value) || 10;
            const newExpireMinutes = parseInt(mainCard.querySelector("#expire-input").value);

            try {
                await updateDoc(doc(db, "shops", selectedShopId), {
                    dateSlots: dateSlotsMap,
                    timeSlots: dateSlotsMap[todayStr] || newTimeSlots,
                    standardGroupSize: newGroupSize,
                    minutesPerGroup: newMinutesPerGroup,
                    autoExpireMinutes: isNaN(newExpireMinutes) ? 1 : newExpireMinutes
                });
                alert("店舗の設定を保存しました！");
                loadSettingsView();
            } catch (err) {
                alert("保存に失敗しました。");
            }
        });

    } catch (e) {
        console.error("エラー:", e);
        container.innerHTML = "データの読み込みに失敗しました。";
    }
}

loadSettingsView();

function updateLastRefreshTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const updateEl = document.getElementById('last-updated');
    if (updateEl) {
        updateEl.textContent = `最終更新: ${timeString}`;
    }
}

updateLastRefreshTime();
onSnapshot(collection(db, "shops"), () => { loadSettingsView(); updateLastRefreshTime(); });