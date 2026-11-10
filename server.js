const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const API_BASE = 'https://wtxmd52.tele68.com';
const LOGIN_API = 'https://apifo88daigia.tele68.com';

const USERNAME = 'Accclone12';
const PASSWORD = 'viet11';

let currentToken = null;
let currentAT = null;
let tokenExpiry = null;
let currentNickname = null;
let currentMoney = 0;

function md5(string) {
    return crypto.createHash('md5').update(string).digest('hex');
}

async function loginAndGetToken() {
    try {
        // Bước 1: Mã hóa MD5 mật khẩu
        const pwMd5 = md5(PASSWORD);
        
        // Bước 2: Gọi API đăng nhập
        const url = `${LOGIN_API}/api?c=3&un=${USERNAME}&pw=${pwMd5}&cp=R&cl=R&pf=web&at=`;
        console.log(`🔍 Đang login: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        console.log('📦 Login response:', JSON.stringify(data, null, 2));
        
        if (!data.success) {
            throw new Error(`Lỗi Game: ${data.message || 'Sai thông tin'}`);
        }
        
        // Bước 3: Lấy sessionKey và giải mã
        let sessionKey = data.sessionKey;
        while (sessionKey.length % 4 !== 0) {
            sessionKey += '=';
        }
        const sessionData = JSON.parse(Buffer.from(sessionKey, 'base64').toString('utf-8'));
        const nickname = sessionData.nickname || sessionData.nickName;
        const accessToken = data.accessToken;
        
        console.log(`✅ Nickname: ${nickname}`);
        console.log(`✅ AccessToken: ${accessToken.substring(0, 30)}...`);
        
        // Bước 4: Lấy JWT token từ Lobby
        const lobbyUrl = 'https://wlb.tele68.com/v1/lobby/auth/login?cp=R&cl=R&pf=web&at=';
        const lobbyResponse = await fetch(lobbyUrl, {
            method: 'POST',
            headers: {
                'authority': 'wlb.tele68.com',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                nickName: nickname,
                accessToken: accessToken
            })
        });
        
        if (!lobbyResponse.ok) throw new Error(`Lobby HTTP ${lobbyResponse.status}`);
        const lobbyData = await lobbyResponse.json();
        
        console.log('📦 Lobby response:', JSON.stringify(lobbyData, null, 2));
        
        const token = lobbyData.token;
        if (!token) {
            throw new Error('Lobby không trả về JWT token');
        }
        
        // Lấy AT từ token hoặc từ response
        let at = token;
        if (lobbyData.at) {
            at = lobbyData.at;
        } else if (lobbyData.accessToken) {
            at = lobbyData.accessToken;
        }
        
        currentToken = token;
        currentAT = at;
        currentNickname = nickname;
        currentMoney = lobbyData.remoteLoginResp?.money || 0;
        tokenExpiry = Date.now() + 8 * 60 * 60 * 1000;
        
        console.log('✅ Login thành công!');
        console.log(`💰 Money: ${currentMoney}`);
        console.log(`🔑 Token: ${token.substring(0, 50)}...`);
        console.log(`🔑 AT: ${at.substring(0, 50)}...`);
        
        return true;
        
    } catch (error) {
        console.error('❌ Login thất bại:', error.message);
        return false;
    }
}

async function ensureToken() {
    if (!currentToken || !tokenExpiry || Date.now() >= tokenExpiry) {
        console.log('🔄 Token hết hạn, đăng nhập lại...');
        await loginAndGetToken();
    }
    return currentToken !== null;
}

async function fetchAPI(endpoint, token) {
    const url = `${API_BASE}${endpoint}`;
    console.log(`📡 Gọi API: ${url}`);
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

app.get('/', async (req, res) => {
    try {
        const tokenValid = await ensureToken();
        if (!tokenValid) {
            throw new Error('Không thể đăng nhập');
        }

        const token = currentToken;
        const at = currentAT;

        const sessionsData = await fetchAPI('/v1/txmd5/sessions', token);
        if (!sessionsData.list || sessionsData.list.length === 0) {
            throw new Error('Không có phiên nào');
        }

        const currentSessionId = sessionsData.list[0].id;
        const previousSessionId = currentSessionId - 1;
        const nextSessionId = currentSessionId + 1;

        let previousData = null;
        let previousMd5 = '---';
        let previousRaw = 'Chưa có RAW';
        let previousComputed = '---';
        let previousStatus = 'WAITING';
        let previousStatusMessage = '⏳ CHỜ GAME GỬI MD5 RAW';
        
        try {
            previousData = await fetchAPI(`/v1/txmd5/session-summary?sessionId=${previousSessionId}&cp=R&cl=R&pf=web&at=${at}`, token);
            if (previousData) {
                previousMd5 = previousData.md5 || '---';
                previousRaw = previousData.md5Raw || 'Chưa có RAW';
                if (previousData.md5Raw && previousData.md5 && previousData.md5 !== '---') {
                    previousComputed = md5(previousData.md5Raw);
                    if (previousComputed === previousData.md5) {
                        previousStatus = 'VALID';
                        previousStatusMessage = '✅ MINH BẠCH - KHỚP';
                    } else {
                        previousStatus = 'INVALID';
                        previousStatusMessage = '❌ BỊP - KHÔNG KHỚP';
                    }
                }
            }
        } catch (e) {
            console.log('⚠️ Không lấy được phiên trước:', e.message);
        }

        const currentData = await fetchAPI(`/v1/txmd5/session-summary?sessionId=${currentSessionId}&cp=R&cl=R&pf=web&at=${at}`, token);
        let currentMd5 = currentData.md5 || '---';
        let currentRaw = currentData.md5Raw || 'Chưa có RAW';
        let currentComputed = '---';
        let currentStatus = 'WAITING';
        let currentStatusMessage = '⏳ CHỜ GAME GỬI MD5 RAW';

        if (currentData.md5Raw && currentData.md5 && currentData.md5 !== '---') {
            currentComputed = md5(currentData.md5Raw);
            if (currentComputed === currentData.md5) {
                currentStatus = 'VALID';
                currentStatusMessage = '✅ MINH BẠCH - KHỚP';
            } else {
                currentStatus = 'INVALID';
                currentStatusMessage = '❌ BỊP - KHÔNG KHỚP';
            }
        }

        let nextData = null;
        let nextMd5 = 'Chưa có MD5 mới';
        try {
            nextData = await fetchAPI(`/v1/txmd5/session-summary?sessionId=${nextSessionId}&cp=R&cl=R&pf=web&at=${at}`, token);
            if (nextData && nextData.md5) {
                nextMd5 = nextData.md5;
            }
        } catch (e) {
            console.log('⚠️ Không lấy được phiên tiếp theo:', e.message);
        }

        res.json({
            success: true,
            data: {
                loginInfo: {
                    username: USERNAME,
                    nickname: currentNickname,
                    money: currentMoney,
                    token: currentToken,
                    at: currentAT,
                    tokenExpiry: tokenExpiry
                },
                previousSession: {
                    id: previousSessionId,
                    md5Game: previousMd5,
                    md5Raw: previousRaw,
                    md5Computed: previousComputed,
                    status: previousStatus,
                    statusMessage: previousStatusMessage
                },
                currentSession: {
                    id: currentSessionId,
                    md5Game: currentMd5,
                    md5Raw: currentRaw,
                    md5Computed: currentComputed,
                    status: currentStatus,
                    statusMessage: currentStatusMessage
                },
                nextSession: {
                    id: nextSessionId,
                    md5Game: nextMd5
                },
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`🔄 Đang đăng nhập với tài khoản: ${USERNAME}`);
    await loginAndGetToken();
});

setInterval(async () => {
    console.log('🔄 Tự động refresh token...');
    await loginAndGetToken();
}, 7 * 60 * 60 * 1000);
