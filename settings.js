import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, updateDoc, doc, setDoc, getDoc, serverTimestamp, onSnapshot, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// 💡 操作ログを記録するヘルパー関数
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

// 🔒 管理画面からの強制ログアウトおよびオレンジ色ロックを監視・制御
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
                await logAction("スタッフログイン(設定画面)", `端末ID: ${staffSessionId} が設定画面にログインしました`);
                document.getElementById("auth-overlay").style.display = "none";
                loadSettingsView();
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

function updateLastRefreshTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const updateEl = document.getElementById('last-updated');
    if (updateEl) {
        updateEl.textContent = `最終更新: ${timeString}`;
    }
}

let selectedShopId = null;
let activeSettingDate = null;

async function loadSettingsView() {
    const isAuth = await checkStaffAuth();
    if (!isAuth) return;

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

        if (!selectedShopId) selectedShopId = shopsSnapshot.docs[0].id;

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
        shopsSnapshot.docs.forEach(d => { if (d.id === selectedShopId) shopData = d.data(); });

        const dateSlotsMap = shopData.dateSlots || {
            [todayStr]: shopData.timeSlots || { "10:00-10:30": 5, "11:00-11:30": 5 }
        };

        const availableDates = Object.keys(dateSlotsMap);
        if (!activeSettingDate || !availableDates.includes(activeSettingDate)) {
            activeSettingDate = availableDates.includes(todayStr) ? todayStr : availableDates[0];
        }

        const autoExpireMinutes = shopData.autoExpireMinutes !== undefined ? shopData.autoExpireMinutes : 1; 
        const timeslotExpireMinutes = shopData.timeslotExpireMinutes !== undefined ? shopData.timeslotExpireMinutes : 10; 
        const closeBeforeMinutes = shopData.closeBeforeMinutes !== undefined ? shopData.closeBeforeMinutes : 0; 
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
            <div style="margin-top: 15px; display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                <div>
                    <label><strong>基準人数:</strong></label><br>
                    <input type="number" id="group-size-input" value="${standardGroupSize}" style="width: 80px; padding: 6px; margin-top: 4px;"> 人
                </div>
                <div>
                    <label><strong>1組の時間:</strong></label><br>
                    <input type="number" id="time-per-group-input" value="${minutesPerGroup}" style="width: 80px; padding: 6px; margin-top: 4px;"> 分
                </div>
            </div>

            <div style="margin-top: 20px; background: #fffde7; padding: 12px; border-radius: 6px; border: 1px solid #ffe082;">
                <label><strong style="color: #856404;">📢 当日順番待ち：呼び出し後のご案内猶予時間（自動キャンセル時間）:</strong></label><br>
                <input type="number" id="expire-input" value="${autoExpireMinutes}" style="width: 80px; padding: 6px; margin-top: 6px;"> 分
            </div>

            <div style="margin-top: 15px; background: #e8f4fd; padding: 12px; border-radius: 6px; border: 1px solid #b8daff;">
                <label><strong style="color: #004085;">⏳ 時間予約：終了時刻から何分過ぎたら自動キャンセルするか:</strong></label><br>
                <input type="number" id="timeslot-expire-input" value="${timeslotExpireMinutes}" style="width: 80px; padding: 6px; margin-top: 6px;"> 分 <span style="font-size:12px; color:#666;">(例: 17:00終了で10分なら17:10に無効化)</span>
            </div>

            <div style="margin-top: 15px; background: #f0f4f8; padding: 12px; border-radius: 6px; border: 1px solid #d1d9e0;">
                <label><strong style="color: #333;">⏰ 予約枠の事前締め切り設定:</strong></label><br>
                <input type="number" id="close-input" value="${closeBeforeMinutes}" style="width: 80px; padding: 6px; margin-top: 4px;"> 分前になったら、その予約枠を自動的に非表示にして締め切る(開始時刻基準) <span style="font-size:12px; color:#666;">(0で直前まで受付)</span>
            </div>

            <div style="margin-top: 20px; border-top: 1px dashed #ccc; padding-top: 15px;">
                <h4 style="margin-top: 0;">📅 設定する日付の選択</h4>
                ${dateTabsHtml}
                ${deleteDateButtonHtml}
                
                <div style="display: flex; gap: 8px; margin-bottom: 15px; align-items: center; flex-wrap: wrap;">
                    <input type="text" id="new-date-input" placeholder="例: 20261016" style="padding: 6px; width: 160px;">
                    <button type="button" id="add-date-btn" style="background: #17a2b8; color: white; border: none; padding: 7px 14px; border-radius: 4px; cursor: pointer; font-weight: bold;">＋ 新しい日付を追加</button>
                </div>
            </div>

            <div style="background: #f8f9fa; border: 1px solid #ccc; padding: 15px; border-radius: 6px; margin-top: 15px;">
                <h4 style="margin-top: 0; color: #007bff;">🪄 【${activeSettingDate}】の枠を一括自動生成</h4>
                <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 10px;">
                    <div>
                        <label style="font-size: 12px;">開始時刻:</label><br>
                        <input type="time" id="gen-start" value="10:00" style="padding: 6px;">
                    </div>
                    <div>
                        <label style="font-size: 12px;">終了時刻:</label><br>
                        <input type="time" id="gen-end" value="16:00" style="padding: 6px;">
                    </div>
                    <div>
                        <label style="font-size: 12px;">間隔(分):</label><br>
                        <input type="number" id="gen-interval" value="30" style="width: 70px; padding: 6px;">
                    </div>
                    <div>
                        <label style="font-size: 12px;">各枠の定員:</label><br>
                        <input type="number" id="gen-limit" value="5" style="width: 70px; padding: 6px;">
                    </div>
                </div>
                <button type="button" id="generate-slots-btn" style="background: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; font-weight: bold; cursor: pointer;">この条件で枠を一括生成する</button>
            </div>

            <h4 style="margin-top: 25px;">⏰ 【${activeSettingDate}】の時間予約枠と定員の編集</h4>
            <div id="slots-editor">
                ${slotsSettingsHtml}
            </div>
            <button id="add-slot-row-btn" style="background: #17a2b8; color:white; border:none; margin-top: 10px; padding: 6px 12px; border-radius: 4px; cursor: pointer;">＋ 時間枠を手動で追加する</button>

            <button id="save-settings-btn" style="background: #28a745; color:white; border:none; margin-top: 25px; width:100%; padding: 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 16px;">設定を保存する</button>
        `;

        container.appendChild(mainCard);

        updateLastRefreshTime();

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

        const deleteActiveDateBtn = mainCard.querySelector("#delete-active-date-btn");
        if (deleteActiveDateBtn) {
            deleteActiveDateBtn.addEventListener("click", async () => {
                if (availableDates.length <= 1) {
                    alert("最低1つの日付が必要なため削除できません。");
                    return;
                }

                if (confirm(`本当に「${activeSettingDate}」の設定を削除しますか？`)) {
                    delete dateSlotsMap[activeSettingDate];
                    
                    const remainingDates = Object.keys(dateSlotsMap);
                    activeSettingDate = remainingDates[0];

                    try {
                        await updateDoc(doc(db, "shops", selectedShopId), {
                            dateSlots: dateSlotsMap,
                            timeSlots: dateSlotsMap[todayStr] || dateSlotsMap[activeSettingDate] || {}
                        });
                        await logAction("店舗設定削除", `店舗: ${shopData.name} の日付設定(${activeSettingDate})を削除しました`);
                        alert(`「${activeSettingDate}」を削除しました。`);
                        loadSettingsView();
                    } catch (err) {
                        console.error(err);
                        alert("日付の削除に失敗しました。");
                    }
                }
            });
        }

        const addDateBtn = mainCard.querySelector("#add-date-btn");
        if (addDateBtn) {
            addDateBtn.addEventListener("click", async () => {
                const inputVal = mainCard.querySelector("#new-date-input").value.trim();
                const formattedDate = formatAutoDate(inputVal);

                if (!formattedDate) {
                    alert("有効な日付を入力してください（例: 20261016 または 2026年10月16日）。");
                    return;
                }

                if (dateSlotsMap[formattedDate]) {
                    alert("すでに登録されている日付です。");
                    return;
                }

                dateSlotsMap[formattedDate] = { "10:00-10:30": 5, "11:00-11:30": 5 };
                activeSettingDate = formattedDate;

                try {
                    await updateDoc(doc(db, "shops", selectedShopId), {
                        dateSlots: dateSlotsMap
                    });
                    await logAction("店舗設定追加", `店舗: ${shopData.name} に新しい日付(${formattedDate})を追加しました`);
                    alert(`新しい日付「${formattedDate}」を追加しました！`);
                    loadSettingsView();
                } catch (e) {
                    console.error(e);
                    alert("日付の追加に失敗しました。");
                }
            });
        }

        const generateBtn = mainCard.querySelector("#generate-slots-btn");
        if (generateBtn) {
            generateBtn.addEventListener("click", () => {
                const startTimeStr = mainCard.querySelector("#gen-start").value;
                const endTimeStr = mainCard.querySelector("#gen-end").value;
                const interval = parseInt(mainCard.querySelector("#gen-interval").value) || 30;
                const defaultLimit = parseInt(mainCard.querySelector("#gen-limit").value) || 5;

                if (!startTimeStr || !endTimeStr) {
                    alert("開始時刻と終了時刻を入力してください。");
                    return;
                }

                const [startH, startM] = startTimeStr.split(":").map(Number);
                const [endH, endM] = endTimeStr.split(":").map(Number);

                let curMin = startH * 60 + startM;
                const endMin = endH * 60 + endM;

                if (curMin >= endMin) {
                    alert("終了時刻は開始時刻より後に設定してください。");
                    return;
                }

                const editor = mainCard.querySelector("#slots-editor");
                editor.innerHTML = "";

                while (curMin + interval <= endMin) {
                    const h1 = Math.floor(curMin / 60).toString().padStart(2, '0');
                    const m1 = (curMin % 60).toString().padStart(2, '0');
                    
                    const nextMin = curMin + interval;
                    const h2 = Math.floor(nextMin / 60).toString().padStart(2, '0');
                    const m2 = (nextMin % 60).toString().padStart(2, '0');

                    const timeSlotStr = `${h1}:${m1}-${h2}:${m2}`;

                    const newRow = document.createElement("div");
                    newRow.className = "slot-row";
                    newRow.style.cssText = "display: flex; gap: 10px; align-items: center; margin-bottom: 8px;";
                    newRow.innerHTML = `
                        <input type="text" class="slot-time-input" value="${timeSlotStr}" style="width: 110px; padding: 6px;">
                        <span>定員:</span>
                        <input type="number" class="slot-limit-input" value="${defaultLimit}" style="width: 60px; padding: 6px;"> 人
                        <button type="button" class="del-slot-btn" style="background:#ff4d4d; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">削除</button>
                    `;
                    editor.appendChild(newRow);
                    bindDeleteButtons(newRow);

                    curMin = nextMin;
                }

                alert("タイムスロットを一括生成しました！「設定を保存する」を押して確定させてください。");
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

            const newGroupSize = parseInt(mainCard.querySelector("#group-size-input").value) || 4;
            const newMinutesPerGroup = parseInt(mainCard.querySelector("#time-per-group-input").value) || 10;
            const newExpireMinutes = parseInt(mainCard.querySelector("#expire-input").value);
            const newExpireVal = isNaN(newExpireMinutes) ? 1 : newExpireMinutes;
            const newTimeslotExpireMinutes = parseInt(mainCard.querySelector("#timeslot-expire-input").value);
            const newTimeslotExpireVal = isNaN(newTimeslotExpireMinutes) ? 10 : newTimeslotExpireMinutes;
            const newCloseMinutes = parseInt(mainCard.querySelector("#close-input").value) || 0;

            const changes = [];
            if (standardGroupSize !== newGroupSize) {
                changes.push(`基準人数: ${standardGroupSize}人 ➔ ${newGroupSize}人`);
            }
            if (minutesPerGroup !== newMinutesPerGroup) {
                changes.push(`1組の時間: ${minutesPerGroup}分 ➔ ${newMinutesPerGroup}分`);
            }
            if (autoExpireMinutes !== newExpireVal) {
                changes.push(`呼び出し猶予: ${autoExpireMinutes}分 ➔ ${newExpireVal}分`);
            }
            if (timeslotExpireMinutes !== newTimeslotExpireVal) {
                changes.push(`予約枠猶予: ${timeslotExpireMinutes}分 ➔ ${newTimeslotExpireVal}分`);
            }
            if (closeBeforeMinutes !== newCloseMinutes) {
                changes.push(`事前締め切り: ${closeBeforeMinutes}分前 ➔ ${newCloseMinutes}分前`);
            }

            const oldSlots = currentSlots || {};
            const addedSlots = [];
            const removedSlots = [];
            const modifiedSlots = [];

            for (const [time, limit] of Object.entries(newTimeSlots)) {
                if (!(time in oldSlots)) {
                    addedSlots.push(`${time}(定員${limit}人)`);
                } else if (oldSlots[time] !== limit) {
                    modifiedSlots.push(`${time}(${oldSlots[time]}人➔${limit}人)`);
                }
            }
            for (const time of Object.keys(oldSlots)) {
                if (!(time in newTimeSlots)) {
                    removedSlots.push(time);
                }
            }

            if (addedSlots.length > 0) changes.push(`枠追加: [${addedSlots.join(', ')}]`);
            if (removedSlots.length > 0) changes.push(`枠削除: [${removedSlots.join(', ')}]`);
            if (modifiedSlots.length > 0) changes.push(`枠定員変更: [${modifiedSlots.join(', ')}]`);

            const diffText = changes.length > 0 ? changes.join(" / ") : "設定値の変更なし（保存実行）";

            dateSlotsMap[activeSettingDate] = newTimeSlots;

            try {
                await updateDoc(doc(db, "shops", selectedShopId), {
                    dateSlots: dateSlotsMap,
                    timeSlots: dateSlotsMap[todayStr] || newTimeSlots,
                    standardGroupSize: newGroupSize,
                    minutesPerGroup: newMinutesPerGroup,
                    autoExpireMinutes: newExpireVal,
                    timeslotExpireMinutes: newTimeslotExpireVal,
                    closeBeforeMinutes: newCloseMinutes
                });

                await logAction("店舗設定変更", `店舗: ${shopData.name} (${activeSettingDate}) の設定を変更しました ➔ 【 ${diffText} 】`);
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

checkStaffAuth().then(authed => {
    if (authed) {
        loadSettingsView();
    }
});