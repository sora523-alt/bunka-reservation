import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, deleteDoc, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// 💡 パスワードを平文で書かず、Base64等でエンコードした状態で保持
// "20010904" -> "MjAwMTA5MDQ="
// "bunka2026" -> "YnVua2EyMDI2"
const ENCODED_MASTER_PASS = "MjAwMTA5MDQ=";
const ENCODED_DEFAULT_CUSTOMER_PASS = "YnVua2EyMDI2=";

function decodePass(encodedStr) {
    try {
        return atob(encodedStr);
    } catch (e) {
        return "";
    }
}

// 🔒 token.html 専用のパスワード認証
document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("token-auth-overlay");
    const submitBtn = document.getElementById("token-submit-btn");
    const passInput = document.getElementById("token-password-input");
    const errorMsg = document.getElementById("token-error-msg");

    if (submitBtn) {
        submitBtn.addEventListener("click", () => {
            const inputVal = passInput.value.trim();
            const correctPass = decodePass(ENCODED_MASTER_PASS);

            if (inputVal === correctPass) {
                overlay.style.display = "none";
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

    // 🔑 お客様用パスワードのロードと保存処理
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

            if (confirm(`お客様用パスワードを「${newPass}」に変更しますか？\n（変更すると、現在ログイン中のお客様は自動的にログアウトされます）`)) {
                try {
                    await setDoc(doc(db, "settings", "app_config"), {
                        customerPassword: newPass,
                        updatedAt: new Date().toISOString()
                    });
                    alert("お客様用パスワードを変更しました！");
                } catch (e) {
                    console.error("保存エラー詳細:", e);
                    alert("変更に失敗しました。エラー: " + e.message);
                }
            }
        });
    }
});

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

onSnapshot(collection(db, "staff_sessions"), () => {
    loadActiveSessions();
});