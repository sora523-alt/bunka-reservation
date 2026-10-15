import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, deleteDoc, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// ==========================================
// 📱 ログイン端末（セッション）の一覧表示と強制ログアウト
// ==========================================
async function loadActiveSessions() {
    const container = document.getElementById("device-list-container");
    if (!container) return;

    try {
        const snapshot = await getDocs(collection(db, "staff_sessions"));
        if (snapshot.empty) {
            container.innerHTML = "<p style='color: #666; text-align: center;'>現在ログイン中の端末はありません。</p>";
            return;
        }

        let html = "";
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const sessionId = docSnap.id;
            const loginTime = data.loginAt ? new Date(data.loginAt.toDate ? data.loginAt.toDate() : data.loginAt).toLocaleTimeString() : '不明';

            html += `
                <div class="device-item">
                    <div>
                        <strong>端末ID:</strong> <code style="background:#eee; padding:2px 4px; border-radius:4px;">${sessionId.slice(0, 12)}...</code><br>
                        <span style="font-size: 12px; color: #555;">ログイン時刻: ${loginTime}</span>
                    </div>
                    <button class="danger-btn kick-btn" data-id="${sessionId}">強制ログアウト</button>
                </div>
            `;
        });

        container.innerHTML = html;

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
        console.error(err);
        container.innerHTML = "<p style='color: red;'>端末情報の取得に失敗しました。</p>";
    }
}

loadActiveSessions();

// 💡 Firestoreのセッション変更をリアルタイムで検知してリストを即座に再描画
onSnapshot(collection(db, "staff_sessions"), () => {
    loadActiveSessions();
});