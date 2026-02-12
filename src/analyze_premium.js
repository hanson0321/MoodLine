
// DOM Elements
const fileInput = document.getElementById('fileInput');
const loadingDiv = document.getElementById('loading');
const dashboardDiv = document.getElementById('dashboard');
const errorDiv = document.getElementById('error');

let currentAnalysis = null;
let isPrivacyMode = false;

// Event Listeners
if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
}

// Global Counter Logic (using a public API + Local Storage fallback)
const COUNTER_NAMESPACE = "moodline_yuheng_v1";
const COUNTER_KEY = "global_analyses";

document.addEventListener('DOMContentLoaded', () => {
    // Show cached count first to avoid flicker to 51
    const cached = localStorage.getItem('moodline_total_analyses');
    if (cached) {
        document.getElementById('totalAnalyses').textContent = cached;
    }

    fetch(`https://api.counterapi.dev/v1/${COUNTER_NAMESPACE}/${COUNTER_KEY}?t=${Date.now()}`)
        .then(res => res.json())
        .then(data => {
            const count = (data.count || 0) + 51;
            const finalCount = count.toLocaleString();
            document.getElementById('totalAnalyses').textContent = finalCount;
            localStorage.setItem('moodline_total_analyses', finalCount);
        })
        .catch(() => {
            if (!cached) document.getElementById('totalAnalyses').textContent = "51";
        });
});

function incrementCounter() {
    fetch(`https://api.counterapi.dev/v1/${COUNTER_NAMESPACE}/${COUNTER_KEY}/up?t=${Date.now()}`)
        .then(res => res.json())
        .then(data => {
            const count = (data.count || 0) + 51;
            const finalCount = count.toLocaleString();
            document.getElementById('totalAnalyses').textContent = finalCount;
            localStorage.setItem('moodline_total_analyses', finalCount);
        })
        .catch(err => console.error("Counter error:", err));
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    loadingDiv.classList.remove('hidden');
    dashboardDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const text = e.target.result;
            const chatData = parseChat(text);
            if (!chatData || chatData.messages.length === 0) {
                throw new Error("No messages found or invalid format.");
            }
            currentAnalysis = analyzeChat(chatData);
            if (!currentAnalysis) {
                throw new Error("無法分析數據：請確認檔案中有至少兩位參與者的對話。");
            }
            renderDashboard(currentAnalysis);
            incrementCounter(); // Increment on success

            loadingDiv.classList.add('hidden');
            dashboardDiv.classList.remove('hidden');
            const tutorial = document.getElementById('tutorialSection');
            if (tutorial) tutorial.classList.add('hidden');
        } catch (err) {
            console.error("Analysis Error:", err);
            loadingDiv.classList.add('hidden');
            errorDiv.innerHTML = `<strong>解析失敗</strong><br>細節：${err.message}<br><small>請確認檔案格式是否正確（LINE > 設定 > 傳送聊天紀錄）</small>`;
            errorDiv.classList.remove('hidden');
        }
    };
    reader.readAsText(file);
}

// ---------------------------------------------------------
// PARSING
// ---------------------------------------------------------
function parseChat(text) {
    const lines = text.split('\n');
    const messages = [];
    const participants = new Set();

    const dateRegex = /^(\d{4})[\/.](0?[1-9]|1[0-2])[\/.](0?[1-9]|[12][0-9]|3[01])\s*[（(].*[）)]/;
    const msgRegex = /^(\d{1,2}:\d{2}|(?:上午|下午)\d{2}:\d{2})\t(?:([^\t]+)\t)?(.*)$/;

    let currentDate = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
            currentDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
            continue;
        }

        const msgMatch = line.match(msgRegex);
        if (msgMatch && currentDate) {
            const timeStr = msgMatch[1];
            const name = msgMatch[2] || "系統訊息";
            const content = msgMatch[3];

            let hours, minutes;
            if (timeStr.includes('上午') || timeStr.includes('下午')) {
                const isPM = timeStr.includes('下午');
                const tStr = timeStr.replace(/(上午|下午)/, '');
                const tParts = tStr.split(':');
                hours = parseInt(tParts[0]);
                minutes = parseInt(tParts[1]);
                if (isPM && hours < 12) hours += 12;
                if (!isPM && hours === 12) hours = 0;
            } else {
                const tParts = timeStr.split(':');
                hours = parseInt(tParts[0]);
                minutes = parseInt(tParts[1]);
            }

            const timestamp = new Date(`${currentDate}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);

            messages.push({
                timestamp: timestamp,
                sender: name,
                content: content,
                type: getMessageType(content)
            });
            if (name !== "系統訊息") participants.add(name);
        }
    }

    return {
        messages: messages,
        participants: Array.from(participants)
    };
}

function getMessageType(content) {
    if (content.startsWith('[貼圖]')) return 'sticker';
    if (content.startsWith('[照片]')) return 'image';
    if (content.startsWith('[影片]')) return 'video';
    if (content.startsWith('[檔案]')) return 'file';
    if (content.includes('通話時間')) return 'call';
    if (content.includes('未接來電') || content.includes('取消通話')) return 'missed_call';
    return 'text';
}

// ---------------------------------------------------------
// ANALYSIS
// ---------------------------------------------------------
function analyzeChat(data) {
    const { messages, participants } = data;
    if (participants.length < 2) return null;

    const stats = {};
    participants.forEach(p => {
        stats[p] = {
            messageCount: 0,
            wordCount: 0,
            stickerCount: 0,
            initiations: 0,
            replyTimes: [],
            keywords: {
                ambiguous: 0,
                emotionaly_pos: 0,
                emotionaly_neg: 0
            },
            modalParticles: 0,
            lateNightCount: 0,
            dailyCounts: {},
            streak: { current: 0, max: 0 },
            initiations_long_gap: 0,
            greetings: { morning: 0, night: 0 },
            mediaCount: 0,
            laughter: 0,
            longestMsg: { content: "", length: 0 },
            slowReplies: 0,
            replyCount: 0,
            timeDistribution: { morning: 0, afternoon: 0, evening: 0, late: 0 },
            callCount: 0,
            callDuration: 0,
            missedCalls: 0,
            dailyCallDuration: {},
            dailyCallCount: {},
            wordFrequency: {},
            hourlyFreq: new Array(24).fill(0),
            quickResponses: 0,
            uniqueKeywords: [],
            replyDist: { m5: 0, m30: 0, h1: 0, slow: 0 },
            personality: { label: "", desc: "" }
        };
    });

    const SLEEP_START = 1;
    const SLEEP_END = 8;

    function getEffectiveDiff(start, end) {
        let totalMs = end - start;
        if (totalMs <= 0) return 0;
        const SLEEP_START_H = 1;
        const SLEEP_END_H = 8;
        const SLEEP_DURATION_H = SLEEP_END_H - SLEEP_START_H;
        let sleepMs = 0;
        let temp = new Date(start);
        temp.setMilliseconds(0);
        temp.setSeconds(0);
        temp.setMinutes(0);
        if (totalMs > 48 * 3600 * 1000) {
            let fullDays = Math.floor(totalMs / (24 * 3600 * 1000)) - 1;
            if (fullDays > 0) {
                sleepMs += fullDays * SLEEP_DURATION_H * 3600 * 1000;
                temp.setTime(temp.getTime() + fullDays * 24 * 3600 * 1000);
            }
        }
        while (temp < end) {
            let h = temp.getHours();
            if (h >= SLEEP_START_H && h < SLEEP_END_H) {
                let hourStart = new Date(temp);
                let hourEnd = new Date(temp);
                hourEnd.setHours(h + 1, 0, 0, 0);
                let overlapStart = Math.max(start, hourStart);
                let overlapEnd = Math.min(end, hourEnd);
                if (overlapEnd > overlapStart) sleepMs += (overlapEnd - overlapStart);
            }
            temp.setHours(temp.getHours() + 1);
        }
        return Math.max(0, totalMs - sleepMs);
    }

    const GAP_THRESHOLD = 60 * 60 * 1000;
    let lastMsgTime = null;
    let lastSender = null;

    messages.forEach((msg) => {
        const p = msg.sender;
        if (!stats[p]) return;
        stats[p].messageCount++;
        if (msg.type === 'sticker') stats[p].stickerCount++;
        else if (msg.type === 'image' || msg.type === 'video') stats[p].mediaCount++;
        else if (msg.type === 'call') {
            stats[p].callCount++;
            let durationSec = 0;
            const hmsMatch = msg.content.match(/通話時間\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
            if (hmsMatch) {
                const parts = hmsMatch[1].split(':').reverse();
                if (parts[0]) durationSec += parseInt(parts[0]);
                if (parts[1]) durationSec += parseInt(parts[1]) * 60;
                if (parts[2]) durationSec += parseInt(parts[2]) * 3600;
            } else {
                const hMatch = msg.content.match(/(\d+)小時/);
                const mMatch = msg.content.match(/(\d+)分/);
                const sMatch = msg.content.match(/(\d+)秒/);
                if (hMatch) durationSec += parseInt(hMatch[1]) * 3600;
                if (mMatch) durationSec += parseInt(mMatch[1]) * 60;
                if (sMatch) durationSec += parseInt(sMatch[1]);
            }
            stats[p].callDuration += durationSec;
            const dateKey = msg.timestamp.toISOString().split('T')[0];
            stats[p].dailyCallDuration[dateKey] = (stats[p].dailyCallDuration[dateKey] || 0) + durationSec;
            stats[p].dailyCallCount[dateKey] = (stats[p].dailyCallCount[dateKey] || 0) + 1;
        } else if (msg.type === 'missed_call') {
            stats[p].missedCalls++;
        }

        if (msg.type === 'text' && !msg.content.includes('已收回訊息')) {
            stats[p].wordCount += msg.content.length;
            if (/下次|要不要|那個|早安|晚安|想你|愛你|想見|陪我|在幹嘛|到家|去哪|特別|秘密|只有你|想聽|見面|一起|喜歡|可愛|漂亮|帥|親親|牽手|擁抱|害羞|臉紅|夢到|想看你|想陪你|等我|送你|帶你去|專屬|唯一|最重要的|心動|浪漫|約會|出門|散步|看電影|吃飯|喝酒|微醺|撒嬌|壞壞|故意|調皮|聲音|電話|視訊|睡不著|不想掛|捨不得|明天見/.test(msg.content)) stats[p].keywords.ambiguous++;
            if (/嘛|呢|吧|喔|恩|ww|XD/.test(msg.content)) stats[p].modalParticles++;
            if (/沒事|抱抱|惜惜|乖|加油|辛苦|厲害|很棒|沒關係|有我在|放心|貼心|喜歡你|謝謝你|辛苦了|摸摸|重視|在乎|支持|懂你|理解|認同|尊重|信任|驕傲|平安|健康|溫暖|快樂|開心|驚喜|禮物|用心|感動|值得|相信你|依靠|肩膀|家人|陪伴|守護|包容|耐心|細心|勇敢|自信|正向|希望|美好|幸運|緣分|珍惜|感謝有你|真好|穩定|默契|別哭|微笑|陽光/.test(msg.content)) stats[p].keywords.emotionaly_pos++;
            if (/好累|煩|哭|難過|討厭|怎麼辦|壓力|想死|救命|傻眼|無語|生氣|委屈|不想|悶|不開心|心煩|絕望|爛|差|慘|倒楣|痛苦|難受|焦慮|崩潰|負擔|負能量|懶得|好宅|沒動力|孤單|寂寞|空虛|無聊|想哭|沒人理|被無視|放鴿子|遲到|太久|失望|難猜|誤會|爭吵|冷戰|分開|累死|加班|上課|報告|考試|沒錢|窮|病|痛|感冒|睡不好|負面|沒用|廢/.test(msg.content)) stats[p].keywords.emotionaly_neg++;
            if (/(早安|早啊|早上好)/.test(msg.content)) stats[p].greetings.morning++;
            if (/(晚安|睡囉|先睡)/.test(msg.content)) stats[p].greetings.night++;
            if (/(哈哈|笑死|XD|ww)/i.test(msg.content)) stats[p].laughter++;
            if (msg.content.length > stats[p].longestMsg.length) {
                stats[p].longestMsg = { content: msg.content, length: msg.content.length };
            }
            const words = msg.content.match(/[\u4e00-\u9fa5]{2,5}/g);
            if (words) {
                words.forEach(w => {
                    stats[p].wordFrequency[w] = (stats[p].wordFrequency[w] || 0) + 1;
                });
            }
        }
        const hour = msg.timestamp.getHours();
        stats[p].hourlyFreq[hour]++;
        if (hour >= 22 || hour < 4) stats[p].lateNightCount++;
        const dateKey = msg.timestamp.toISOString().split('T')[0];
        stats[p].dailyCounts[dateKey] = (stats[p].dailyCounts[dateKey] || 0) + 1;
        if (hour >= 5 && hour < 12) stats[p].timeDistribution.morning++;
        else if (hour >= 12 && hour < 18) stats[p].timeDistribution.afternoon++;
        else if (hour >= 18 && hour < 22) stats[p].timeDistribution.evening++;
        else stats[p].timeDistribution.late++;

        if (lastMsgTime) {
            const diff = msg.timestamp - lastMsgTime;
            const effectiveDiff = getEffectiveDiff(lastMsgTime, msg.timestamp);
            const effectiveDiffMins = effectiveDiff / 1000 / 60;
            if (lastSender !== p) {
                stats[p].replyCount++;
                const diffMins = effectiveDiffMins;
                if (diffMins <= 5) stats[p].replyDist.m5++;
                else if (diffMins <= 30) stats[p].replyDist.m30++;
                else if (diffMins <= 60) stats[p].replyDist.h1++;
                else stats[p].replyDist.slow++;
                if (diff < 5 * 60 * 1000) stats[p].quickResponses++;
                if (diff < GAP_THRESHOLD) stats[p].replyTimes.push(diff);
                else stats[p].initiations++;
                if (effectiveDiffMins > 360) stats[p].initiations_long_gap++;
                if (effectiveDiffMins > 60) stats[p].slowReplies++;
            } else {
                if (effectiveDiffMins > 60) {
                    stats[p].initiations++;
                    if (effectiveDiffMins > 360) stats[p].initiations_long_gap++;
                }
            }
        } else {
            stats[p].initiations++;
        }
        lastMsgTime = msg.timestamp;
        lastSender = p;
    });

    participants.forEach(p => {
        const s = stats[p];
        const dates = Object.keys(s.dailyCounts).sort();
        let currentStreak = 0, maxStreak = 0, prevDate = null;
        dates.forEach(d => {
            if (!prevDate) currentStreak = 1;
            else {
                const dayDiff = (new Date(d) - new Date(prevDate)) / (1000 * 60 * 60 * 24);
                if (dayDiff === 1) currentStreak++;
                else { maxStreak = Math.max(maxStreak, currentStreak); currentStreak = 1; }
            }
            prevDate = d;
        });
        s.streak.max = Math.max(maxStreak, currentStreak);
        s.avgReplyTime = s.replyTimes.length ? (s.replyTimes.reduce((a, b) => a + b, 0) / s.replyTimes.length / 1000 / 60) : 0;
        s.quickResponseRate = s.replyCount ? Math.round((s.quickResponses / s.replyCount) * 100) : 0;
        const totalWords = Object.values(stats).reduce((a, v) => a + v.wordCount, 0);
        const wordScore = totalWords ? (s.wordCount / totalWords) * 100 : 50;
        const totalMedia = Object.values(stats).reduce((a, v) => a + v.mediaCount, 0);
        const mediaScore = totalMedia ? (s.mediaCount / totalMedia) * 100 : 50;
        s.lovesickScore = Math.round((wordScore * 0.4) + (mediaScore * 0.4) + (s.quickResponseRate * 0.2));

        if (s.lovesickScore <= 35) { s.lovesickLevel = "人間清醒"; s.lovesickDesc = "社交客氣，毫無波瀾。回覆速度、投入程度與主動頻率均保持在安全邊界。"; }
        else if (s.lovesickScore <= 55) { s.lovesickLevel = "好感曖昧"; s.lovesickDesc = "會主動開話題或分享生活，雙方互動熱絡且有來有往。"; }
        else if (s.lovesickScore <= 75) { s.lovesickLevel = "深陷其中"; s.lovesickDesc = "訊息秒回，情緒被對方牽著走。投入大量的字數與生活碎片，明顯偏向對方的重心。"; }
        else { s.lovesickLevel = "末期暈船"; s.lovesickDesc = "自我攻略，沒救了請送醫。極度卑微的回覆速度與單方面的輸出，情感天平嚴重傾斜。"; }

        const others = participants.filter(o => o !== p);
        const unique = [];
        for (let word in s.wordFrequency) {
            let isUnique = true;
            others.forEach(o => {
                if ((stats[o].wordFrequency[word] || 0) > s.wordFrequency[word] * 0.3) isUnique = false;
            });
            if (isUnique && s.wordFrequency[word] >= 2) unique.push(word);
        }
        s.uniqueKeywords = unique.sort((a, b) => s.wordFrequency[b] - s.wordFrequency[a]).slice(0, 5);

        if (s.stickerCount > s.messageCount * 0.4) s.personality = { label: "貼圖溝通藝術家", desc: "能用貼圖解決的絕對不打字。擅長用可愛或毒舌的插圖來表達細膩情緒。" };
        else if (s.avgReplyTime < 3 && s.replyCount > 50) s.personality = { label: "訊息秒回守護者", desc: "手機幾乎不離手，對另一半的訊息永遠保持最高權限與光速響應。" };
        else if (s.lateNightCount > s.messageCount * 0.5) s.personality = { label: "溫柔深夜靈魂", desc: "白天或許安靜，但在繁星璀璨的深夜才是最感性且話最多的時刻。" };
        else if (s.wordCount / s.messageCount > 30) s.personality = { label: "真誠長文創作者", desc: "每一條訊息都像是一封情書。不愛瑣碎，只願用真摯的長文訴說心底話。" };
        else if (s.callCount > 10) s.personality = { label: "通話行動派", desc: "比起等待文字跳動，更喜歡直接撥通電話，傳隔著螢幕的情緒。" };
        else s.personality = { label: "穩定情感維護者", desc: "表現均衡且穩定。不急不躁，用最自然的方式維護著這段對話的熱度。" };
    });

    return {
        stats: stats,
        participants: participants,
        globalStats: {
            totalMessages: messages.length,
            totalWords: Object.values(stats).reduce((a, v) => a + v.wordCount, 0),
            totalMedia: Object.values(stats).reduce((a, v) => a + v.mediaCount + v.stickerCount, 0),
            startDate: messages[0].timestamp,
            endDate: messages[messages.length - 1].timestamp,
            totalDays: Math.ceil((messages[messages.length - 1].timestamp - messages[0].timestamp) / (1000 * 60 * 60 * 24)) + 1
        }
    };
}

// ---------------------------------------------------------
// RENDERING
// ---------------------------------------------------------
function renderDashboard(data) {
    const { participants, stats } = data;
    let p1 = participants[0], p2 = participants[1];
    const container = document.getElementById('dashboard-content');
    container.innerHTML = '';

    // Privacy Masking Logic
    const dName = (name, placeholder) => isPrivacyMode ? placeholder : name;
    const displayName1 = dName(p1, "使用者 A");
    const displayName2 = dName(p2, "使用者 B");

    // 0. Privacy Toggle & Color Legend
    container.innerHTML += `
        <div class="reveal-init" style="text-align:center; margin-bottom:40px;">
            <button class="btn-privacy-toggle ${isPrivacyMode ? 'active' : ''}" onclick="togglePrivacyMode()">
                ${isPrivacyMode ? '🔓 關閉隱私遮罩' : '🔒 開啟隱私遮罩 (拍照宣傳用)'}
            </button>
            
            <div style="display:flex; justify-content:center; gap:32px; margin-top:20px; font-weight:700; font-size:1.1rem;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:20px; height:20px; border-radius:6px; background:var(--primary); box-shadow:0 0 15px var(--primary-glow);"></div>
                    <span style="color:var(--primary)">${displayName1}</span>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:20px; height:20px; border-radius:6px; background:var(--secondary); box-shadow:0 0 15px var(--secondary-glow);"></div>
                    <span style="color:var(--secondary)">${displayName2}</span>
                </div>
            </div>
        </div>
    `;

    // 1. Global Stats
    container.innerHTML += `
        <div class="reveal-init">
            <div class="card-premium" style="margin-bottom:32px; display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:32px; text-align:center;">
                <div>
                    <div style="font-size:1rem; color:var(--text-muted); margin-bottom:8px;">對話時間跨度</div>
                    <div style="font-weight:800; font-size:1.5rem; color:var(--text-main);">${data.globalStats.totalDays} 天</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">
                        ${data.globalStats.startDate.toLocaleDateString()} - ${data.globalStats.endDate.toLocaleDateString()}
                    </div>
                </div>
                <div>
                    <div style="font-size:1rem; color:var(--text-muted); margin-bottom:8px;">總訊息數量</div>
                    <div style="font-weight:800; font-size:1.5rem; color:var(--text-main);">${data.globalStats.totalMessages} 條</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">
                        日均 ${Math.round(data.globalStats.totalMessages / data.globalStats.totalDays)} 條
                    </div>
                </div>
                <div>
                    <div style="font-size:1rem; color:var(--text-muted); margin-bottom:8px;">貼圖總量</div>
                    <div style="font-weight:800; font-size:1.5rem; color:var(--text-main);">${Object.values(stats).reduce((a, v) => a + v.stickerCount, 0)} 個</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">聊天靈魂的展現</div>
                </div>
                <div>
                    <div style="font-size:1rem; color:var(--text-muted); margin-bottom:8px;">累積文字總量</div>
                    <div style="font-weight:800; font-size:1.5rem; color:var(--text-main);">${data.globalStats.totalWords} 字</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">約可換算成 ${Math.ceil(data.globalStats.totalWords / 400)} 篇小論文</div>
                </div>
            </div>
        </div>
    `;

    // 2. Metrics 
    container.innerHTML += `
        <div class="reveal-init">
            <div class="section-header">
                <h2 class="section-title">基礎數據分析</h2>
                <div class="section-line"></div>
            </div>
            <div class="metrics-row" style="margin-bottom:32px;">
                ${renderMetricPremium('訊息條數', stats[p1].messageCount, stats[p2].messageCount, stats[p1].messageCount, stats[p2].messageCount)}
                ${renderMetricPremium('總文字量', stats[p1].wordCount, stats[p2].wordCount, stats[p1].wordCount, stats[p2].wordCount)}
                ${renderMetricPremium('貼圖', stats[p1].stickerCount, stats[p2].stickerCount, stats[p1].stickerCount, stats[p2].stickerCount)}
                ${renderMetricPremium('照片/影片', stats[p1].mediaCount, stats[p2].mediaCount, stats[p1].mediaCount, stats[p2].mediaCount)}
                ${renderMetricPremium('秒回率', `${stats[p1].quickResponseRate}%`, `${stats[p2].quickResponseRate}%`, stats[p1].quickResponseRate, stats[p2].quickResponseRate)}
                ${renderMetricPremium('平均回覆時間', `${Math.round(stats[p1].avgReplyTime)}分`, `${Math.round(stats[p2].avgReplyTime)}分`, stats[p1].avgReplyTime, stats[p2].avgReplyTime, true)}
            </div>
        </div>
    `;

    // 2.5 Response Time Distribution
    container.innerHTML += `
        <div class="reveal-init">
            <div class="section-header">
                <h2 class="section-title">回覆速度分佈 <span style="font-size:0.6em; opacity:0.7; font-weight:400; margin-left:8px;">(已扣除睡眠時間)</span></h2>
                <div class="section-line"></div>
            </div>
            <div class="grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:24px; margin-bottom:32px;">
                <div class="card-premium">
                    <h3 style="margin-bottom:20px; color:var(--primary)">${p1} 的回覆節奏</h3>
                    <div style="height:250px;"><canvas id="replyDistChart1"></canvas></div>
                </div>
                <div class="card-premium">
                    <h3 style="margin-bottom:20px; color:var(--secondary)">${p2} 的回覆節奏</h3>
                    <div style="height:250px;"><canvas id="replyDistChart2"></canvas></div>
                </div>
            </div>
        </div>
    `;

    // 2. Trend & Hourly
    container.innerHTML += `
        <div class="reveal-init">
            <div class="section-header">
                <h2 class="section-title">對話活躍趨勢</h2>
                <div class="section-line"></div>
            </div>
            <div class="grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap:24px; margin-bottom:32px;">
                <div class="card-premium">
                    <h3 style="margin-bottom:20px;">每日訊息量走勢</h3>
                    <div style="height:300px;"><canvas id="trendChartFreq"></canvas></div>
                </div>
                <div class="card-premium">
                    <h3 style="margin-bottom:20px;">24小時活躍熱力圖</h3>
                    <div style="height:300px;"><canvas id="hourlyChart"></canvas></div>
                </div>
            </div>
        </div>
    `;

    // 3. Word Cloud
    container.innerHTML += `
        <div class="reveal-init">
            <div class="section-header">
                <h2 class="section-title">對話關鍵字</h2>
                <div class="section-line"></div>
            </div>
            <div class="card-premium" style="margin-bottom:32px; position:relative; padding-top: 60px;">
                <div id="wordFreqIndicator" style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); width:90%; font-size:1.2rem; font-weight:800; background:rgba(0, 210, 255, 0.2); border:2px solid var(--primary); padding:12px 20px; border-radius:16px; text-align:center; transition:all 0.3s; z-index:10;">
                    點擊單字庫：看誰才是話題主導者！
                </div>
                <div id="wordCloudContainer" style="display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:8px; padding:10px; min-height:200px; max-height:400px; overflow-y:auto;"></div>
            </div>
        </div>
    `;

    // 4. Call Analysis
    const tCallS = Object.values(stats).reduce((a, v) => a + v.callDuration, 0);
    const tCallC = Object.values(stats).reduce((a, v) => a + v.callCount, 0);
    const aCallS = tCallC ? tCallS / tCallC : 0;
    container.innerHTML += `
        <div class="reveal-init">
            <div class="section-header">
                <h2 class="section-title">通話數據分析</h2>
                <div class="section-line"></div>
            </div>
            <div class="card-premium" style="margin-bottom:24px; display:grid; grid-template-columns: 1fr 1fr; gap:32px; text-align:center;">
                <div>
                    <div style="font-size:0.875rem; color:var(--text-muted); margin-bottom:8px;">通話總時長</div>
                    <div style="font-weight:700; font-size:1.5rem; color:var(--primary)">${formatDuration(tCallS)}</div>
                </div>
                <div>
                    <div style="font-size:0.875rem; color:var(--text-muted); margin-bottom:8px;">單次平均通話時間</div>
                    <div style="font-weight:700; font-size:1.5rem; color:var(--secondary)">${formatDuration(Math.round(aCallS))}</div>
                </div>
            </div>
            <div class="call-analysis" style="margin-bottom:32px;">
                ${renderCallCard('撥打通話次數', stats[p1].callCount, stats[p2].callCount)}
                ${renderCallCard('個人通話時長', formatDuration(stats[p1].callDuration), formatDuration(stats[p2].callDuration))}
                ${renderCallCard('未接或取消', stats[p1].missedCalls, stats[p2].missedCalls)}
                <div class="card-premium" style="grid-column: span 2; margin-top:12px;">
                    <h3 style="margin-bottom:16px; font-size:0.9rem; color:var(--text-muted)">通話分佈趨勢</h3>
                    <div style="height:200px;"><canvas id="callChart"></canvas></div>
                </div>
            </div>
        </div>
    `;

    // 6. Insights
    container.innerHTML += `
        <div class="reveal-init">
            <div class="section-header">
                <h2 class="section-title">深度行為觀察</h2>
                <div class="section-line"></div>
            </div>
            <div class="grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap:24px; margin-bottom:32px;">
                <div class="card-premium">
                    <h3 style="margin-bottom:20px; color:var(--primary)">情感詞彙頻率</h3>
                    <div style="display:flex; flex-direction:column; gap:16px;">
                        ${renderKeywordRow('曖昧語氣', stats[p1].keywords.ambiguous, stats[p2].keywords.ambiguous)}
                        ${renderKeywordRow('情緒價值', stats[p1].keywords.emotionaly_pos, stats[p2].keywords.emotionaly_pos)}
                        ${renderKeywordRow('負能量', stats[p1].keywords.emotionaly_neg, stats[p2].keywords.emotionaly_neg)}
                        ${renderKeywordRow('深夜聊天量', stats[p1].lateNightCount, stats[p2].lateNightCount)}
                    </div>
                </div>
                <div class="card-premium">
                    <h3 style="margin-bottom:20px; color:var(--secondary)">對話行為數據</h3>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                        ${renderTrophyCard('持續對話天數', `${stats[p1].streak.max} 天`, `${stats[p2].streak.max} 天`)}
                        ${renderTrophyCard('專屬口頭禪', (stats[p1].uniqueKeywords.join(', ') || '尚無紀錄'), (stats[p2].uniqueKeywords.join(', ') || '尚無紀錄'))}
                        ${renderTrophyCard('大笑頻率', `${stats[p1].laughter} 次`, `${stats[p2].laughter} 次`)}
                        ${renderTrophyCard('超過1小時才回', `${stats[p1].slowReplies} 次`, `${stats[p2].slowReplies} 次`)}
                    </div>
                </div>
                <div class="card-premium" style="grid-column: span 2;">
                   <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px;">
                        ${renderLongMsg(displayName1, stats[p1].longestMsg)}
                        ${renderLongMsg(displayName2, stats[p2].longestMsg)}
                   </div>
                </div>
            </div>
        </div>
    `;

    // 8. Radar Analysis
    container.innerHTML += `
        <div class="reveal-init">
            <div class="section-header">
                <h2 class="section-title">對等性雷達洞察</h2>
                <div class="section-line"></div>
            </div>
            <div class="card-premium" style="margin-bottom:32px; display:flex; justify-content:center; align-items:center;">
                <div style="height:400px; width:100%; max-width:600px;"><canvas id="radarChart"></canvas></div>
            </div>
        </div>
    `;

    // 9. Score & Wrapped
    container.innerHTML += `
        <div class="reveal-init">
            <div class="section-header">
                <h2 class="section-title">綜合感應評分</h2>
                <div class="section-line"></div>
            </div>
            <div class="card-premium" style="margin-bottom:32px;">
                <div class="player-comparison">
                    ${renderPlayerBox(displayName1, stats[p1], 0)}
                    ${renderPlayerBox(displayName2, stats[p2], 1)}
                </div>
            </div>
        </div>

        <button class="btn-wrapped-share" onclick="showWrappedSummary('${p1}', '${p2}', ${JSON.stringify(stats).replace(/"/g, '&quot;')})">✨ 一鍵截圖分享</button>

        <div id="wrappedModal" onclick="closeWrapped()">
            <div class="wrapped-card" onclick="event.stopPropagation()">
                <div class="wrapped-decoration"></div>
                <div class="wrapped-header">MoodLine </div>
                <div id="wrappedContent"></div>
                <div class="wrapped-footer">此分析僅供參考，請珍惜身邊的人</div>
                <button style="margin-top:20px; padding:10px 20px; border-radius:30px; border:1px solid rgba(255,255,255,0.2); background:transparent; color:#fff; cursor:pointer;" onclick="closeWrapped()">關閉</button>
            </div>
        </div>
    `;

    initializeRevealObserver();
    renderTrendChart(displayName1, displayName2, stats, p1, p2);
    renderCallDetailChart(displayName1, displayName2, stats, p1, p2);
    renderWordCloud(stats);
    renderRadarChart(displayName1, displayName2, stats, p1, p2);
    renderHourlyChart(displayName1, displayName2, stats, p1, p2);
    renderReplyDistChart(displayName1, stats[p1], 'replyDistChart1', '#00d2ff');
    renderReplyDistChart(displayName2, stats[p2], 'replyDistChart2', '#9d50bb');
}

window.togglePrivacyMode = function () {
    isPrivacyMode = !isPrivacyMode;
    if (currentAnalysis) {
        renderDashboard(currentAnalysis);
    }
};

function initializeRevealObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('reveal-active');
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal-init').forEach(el => observer.observe(el));
}

function showWrappedSummary(p1, p2, stats) {
    const modal = document.getElementById('wrappedModal');
    const content = document.getElementById('wrappedContent');

    const s1 = stats[p1];
    const s2 = stats[p2];

    const displayName1 = isPrivacyMode ? "使用者 A" : p1;
    const displayName2 = isPrivacyMode ? "使用者 B" : p2;

    const totalMsg = s1.messageCount + s2.messageCount;
    const topP = s1.messageCount > s2.messageCount ? displayName1 : displayName2;

    const renderWrappedBar = (v1, v2, label) => {
        const total = v1 + v2;
        const p1Pct = total ? Math.round((v1 / total) * 100) : 50;
        const p2Pct = 100 - p1Pct;
        return `
            <div style="margin-top:10px;">
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px; opacity:0.8;">
                    <span>${label}</span>
                    <span class="${isPrivacyMode ? 'mask-text' : ''}">${v1} vs ${v2}</span>
                </div>
                <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:3px; display:flex; overflow:hidden;">
                    <div style="width:${p1Pct}%; background:var(--primary)"></div>
                    <div style="width:${p2Pct}%; background:var(--secondary)"></div>
                </div>
            </div>
        `;
    };

    content.innerHTML = `
        <!-- Color Legend -->
        <div style="display:flex; justify-content:center; gap:24px; margin-bottom:24px; font-size:0.8rem; font-weight:600;">
            <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:12px; height:12px; border-radius:3px; background:var(--primary)"></div>
                <span>${displayName1}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:12px; height:12px; border-radius:3px; background:var(--secondary)"></div>
                <span>${displayName2}</span>
            </div>
        </div>

        <div class="wrapped-stat-item">
            <div class="wrapped-stat-label">深度連結指數</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:10px;">
                <div style="text-align:center; padding:12px; background:rgba(0,210,255,0.1); border-radius:12px; border:1px solid rgba(0,210,255,0.2);">
                    <div style="font-size:0.7rem; opacity:0.7;">${displayName1}</div>
                    <div style="font-size:1.2rem; font-weight:800; color:var(--primary)">${s1.lovesickScore}%</div>
                    <div style="font-size:0.75rem; font-weight:600;">${s1.lovesickLevel}</div>
                </div>
                <div style="text-align:center; padding:12px; background:rgba(157,80,187,0.1); border-radius:12px; border:1px solid rgba(157,80,187,0.2);">
                    <div style="font-size:0.7rem; opacity:0.7;">${displayName2}</div>
                    <div style="font-size:1.2rem; font-weight:800; color:var(--secondary)">${s2.lovesickScore}%</div>
                    <div style="font-size:0.75rem; font-weight:600;">${s2.lovesickLevel}</div>
                </div>
            </div>
        </div>

        <div class="wrapped-stat-item">
            ${renderWrappedBar(s1.wordCount, s2.wordCount, '總文字量對比')}
            ${renderWrappedBar(s1.mediaCount, s2.mediaCount, '照片/影片分享對比')}
            ${renderWrappedBar(s1.stickerCount, s2.stickerCount, '貼圖使用頻率對比')}
        </div>

        <div class="wrapped-stat-item">
            <div class="wrapped-stat-label">關鍵洞察</div>
            <div style="font-size:0.85rem; line-height:1.6; margin-top:8px;">
                本階段共產生 <span class="${isPrivacyMode ? 'mask-text' : ''}" style="color:var(--primary); font-weight:700;">${totalMsg.toLocaleString()}</span> 則訊息。
                由 <span style="color:var(--secondary); font-weight:700;">${topP}</span> 擔任話題發起核心，
                雙方累積通話達 <span class="${isPrivacyMode ? 'mask-text' : ''}" style="color:var(--primary); font-weight:700;">${formatDuration(s1.callDuration + s2.callDuration)}</span>。
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function closeWrapped() { document.getElementById('wrappedModal').style.display = 'none'; }

function renderPlayerBox(name, s, index) {
    return `
        <div class="player-stat-box" id="player-box-${index}" style="padding: 10px; border-radius: 20px; transition: all 0.5s ease;">
            <div class="player-name">${name}</div>
            <div class="lovesick-index">
                <svg class="lovesick-circle" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8" />
                    <circle cx="50" cy="50" r="45" fill="none" stroke="var(--primary)" stroke-width="8" 
                        stroke-dasharray="${s.lovesickScore * 2.82} 282" stroke-linecap="round" />
                </svg>
                <div class="index-content">
                    <div class="index-value">${s.lovesickScore}%</div>
                    <div class="index-label">${s.lovesickLevel}</div>
                </div>
            </div>
            <div style="max-width:240px; margin:0 auto; font-size:0.875rem; color:#94a3b8; line-height:1.6;">${s.lovesickDesc}</div>
        </div>
    `;
}

function renderCallCard(label, v1, v2) {
    return `
        <div class="call-card">
            <div class="call-data">
                <div class="call-label">${label}</div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div class="call-value" style="color: var(--primary)">${v1}</div>
                    <div style="color: var(--text-muted); font-size: 0.75rem; margin: 0 10px;">對比</div>
                    <div class="call-value" style="color: var(--secondary)">${v2}</div>
                </div>
            </div>
        </div>
    `;
}

function renderMetricPremium(title, v1, v2, val1, val2) {
    const total = val1 + val2;
    const p1Pct = total ? Math.round((val1 / total) * 100) : 50;
    const p2Pct = 100 - p1Pct;
    return `
        <div class="metric-premium">
            <div class="metric-header" style="margin-bottom:12px;">
                <span class="metric-title">${title}</span>
                <div style="display:flex; gap:16px;">
                    <span style="font-weight: 700; color: var(--primary)">${v1}</span>
                    <span style="font-weight: 700; color: var(--secondary)">${v2}</span>
                </div>
            </div>
            <div class="comparison-bar">
                <div class="bar-part" style="width: ${p1Pct}%; background: var(--primary)">${p1Pct > 10 ? p1Pct + '%' : ''}</div>
                <div class="bar-part" style="width: ${p2Pct}%; background: var(--secondary)">${p2Pct > 10 ? p2Pct + '%' : ''}</div>
            </div>
        </div>
    `;
}

function renderLongMsg(name, msg) {
    const displayMsg = isPrivacyMode ? "此內容已受隱私模式遮罩保護，無法載入敏感資訊..." : msg.content;
    return `
        <div style="background:rgba(255,255,255,0.02); padding:20px; border-radius:16px; border:1px solid var(--glass-border);">
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:12px;">${name} 的最長回覆 (${msg.length} 字)</div>
            <div class="${isPrivacyMode ? 'mask-text' : ''}" style="font-style:italic; color:var(--text-main); font-size:0.9rem; line-height:1.6; max-height:120px; overflow-y:auto; padding-right:8px;">
                "${displayMsg}"
            </div>
        </div>
    `;
}

function renderKeywordRow(label, v1, v2) { return renderMetricPremium(label, '', '', v1, v2); }
function renderTrophyCard(title, v1, v2) {
    const mask = (t) => isPrivacyMode ? '<span class="mask-text">匿名紀錄</span>' : t;
    return `
        <div style="background:rgba(255,255,255,0.02); padding:16px; border-radius:12px; border:1px solid var(--glass-border);">
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">${title}</div>
            <div style="display:flex; justify-content:space-between; font-weight:700;">
                <span style="color:var(--primary)">${title === '專屬口頭禪' ? mask(v1) : v1}</span>
                <span style="color:var(--secondary)">${title === '專屬口頭禪' ? mask(v2) : v2}</span>
            </div>
        </div>
    `;
}

function formatDuration(sec) {
    if (sec <= 0) return `0秒`;
    if (sec < 60) return `${sec} 秒`;
    if (sec < 3600) return `${Math.floor(sec / 60)}分 ${sec % 60} 秒`;
    return `${Math.floor(sec / 3600)}小時 ${Math.floor((sec % 3600) / 60)} 分`;
}

function renderTrendChart(label1, label2, stats, p1, p2) {
    const ctx = document.getElementById('trendChartFreq').getContext('2d');
    const allDates = Array.from(new Set([...Object.keys(stats[p1].dailyCounts), ...Object.keys(stats[p2].dailyCounts)])).sort();
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: allDates,
            datasets: [
                { label: label1, data: allDates.map(d => stats[p1].dailyCounts[d] || 0), borderColor: '#00d2ff', backgroundColor: 'rgba(0, 210, 255, 0.1)', fill: true, tension: 0.4, pointRadius: 2 },
                { label: label2, data: allDates.map(d => stats[p2].dailyCounts[d] || 0), borderColor: '#9d50bb', backgroundColor: 'rgba(157, 80, 187, 0.1)', fill: true, tension: 0.4, pointRadius: 2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748b', autoSkip: true, maxTicksLimit: 10, maxRotation: 0 } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' }, beginAtZero: true }
            },
            plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Outfit' } } } }
        }
    });
}

function renderCallDetailChart(label1, label2, stats, p1, p2) {
    const ctx = document.getElementById('callChart').getContext('2d');
    const allDates = Array.from(new Set([...Object.keys(stats[p1].dailyCallDuration), ...Object.keys(stats[p2].dailyCallDuration)])).sort();
    const dailyDuration = allDates.map(d => (stats[p1].dailyCallDuration[d] || 0) + (stats[p2].dailyCallDuration[d] || 0));
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: allDates,
            datasets: [{ label: '每日通話總時長', data: dailyDuration, borderColor: '#00d2ff', backgroundColor: 'rgba(0, 210, 255, 0.1)', borderWidth: 3, pointRadius: 0, tension: 0.4, fill: true }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#64748b', maxTicksLimit: 10 }, grid: { display: false } },
                y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderHourlyChart(label1, label2, stats, p1, p2) {
    const ctx = document.getElementById('hourlyChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({ length: 24 }, (_, i) => i + "時"),
            datasets: [
                { label: label1, data: stats[p1].hourlyFreq, backgroundColor: 'rgba(0, 210, 255, 0.5)' },
                { label: label2, data: stats[p2].hourlyFreq, backgroundColor: 'rgba(157, 80, 187, 0.5)' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }, y: { display: false } }
        }
    });
}

function renderRadarChart(label1, label2, stats, p1, p2) {
    const ctx = document.getElementById('radarChart').getContext('2d');
    const getRadarData = (p) => {
        const s = stats[p], otherP = p === p1 ? p2 : p1, os = stats[otherP];
        const calcEx = (v1, v2) => {
            const total = v1 + v2;
            if (!total) return 50;
            return Math.max(10, Math.min(95, 50 + (v1 / total - 0.5) * 120));
        };
        return [
            calcEx(s.wordCount, os.wordCount),
            calcEx(s.quickResponseRate, os.quickResponseRate),
            calcEx(s.callCount, os.callCount),
            calcEx(s.lateNightCount / (s.messageCount || 1), os.lateNightCount / (os.messageCount || 1)),
            calcEx(s.mediaCount, os.mediaCount)
        ];
    };
    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['文字輸出量', '秒回積極度', '通話發起頻率', '深夜活躍', '圖片分享欲'],
            datasets: [
                { label: label1, data: getRadarData(p1), borderColor: '#00d2ff', backgroundColor: 'rgba(0, 210, 255, 0.2)', borderWidth: 4, pointBackgroundColor: '#00d2ff' },
                { label: label2, data: getRadarData(p2), borderColor: '#9d50bb', backgroundColor: 'rgba(157, 80, 187, 0.2)', borderWidth: 4, pointBackgroundColor: '#9d50bb' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                r: {
                    suggestedMin: 0,
                    suggestedMax: 100,
                    ticks: { display: false },
                    grid: { color: 'rgba(255,255,255,0.2)' },
                    angleLines: { color: 'rgba(255,255,255,0.2)' },
                    pointLabels: { color: '#94a3b8', font: { size: 12 } }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderWordCloud(stats) {
    const container = document.getElementById('wordCloudContainer');
    if (isPrivacyMode) {
        container.innerHTML = '<div style="color:var(--text-muted); font-style:italic;">🔒 本機隱私遮罩已開啟，不顯示敏感詞彙</div>';
        return;
    }
    const allFreq = {};
    const detailFreq = {};
    const STOP_WORDS = new Set(['什麼', '可以', '一下', '今天', '剛剛', '起來', '沒有', '不是', '出門', '我要', '還沒', '我也', '知道', '還是', '明天', '你要', '感覺', '幹嘛', '現在', '怎麼', '真的', '這個', '要去', '不會', '這樣', '他們', '我剛', '幾點', '好了', '一個', '等等', '我在', '不要', '對啊', '不知', '不知道', '你在', '回家', '跟我', '看到', '很好', '好吃', '你不', '到家', '朋友', '時候', '已經', '還是', '就是', '大家', '自己', '如果', '可能', '還是', '雖然', '所以', '但是', '因為', '東西', '地方', '應該', '而且', '其實', '好像', '結果', '覺得', '哈哈', '哈哈哈', '哈哈哈哈', '笑死']);

    Object.keys(stats).forEach(p => {
        for (let w in stats[p].wordFrequency) {
            if (!STOP_WORDS.has(w)) {
                allFreq[w] = (allFreq[w] || 0) + stats[p].wordFrequency[w];
                if (!detailFreq[w]) detailFreq[w] = {};
                detailFreq[w][p] = stats[p].wordFrequency[w];
            }
        }
    });

    const sortedWords = Object.entries(allFreq).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const maxFreq = sortedWords[0] ? sortedWords[0][1] : 1;

    container.innerHTML = sortedWords.map(([word, freq]) => {
        const weight = Math.sqrt(freq) / Math.sqrt(maxFreq);
        const size = 0.85 + weight * 3;
        const rotate = (Math.random() - 0.5) * 20;
        const personData = JSON.stringify(detailFreq[word]).replace(/"/g, '&quot;');
        return `<span style="font-size:${size}rem; opacity:${0.5 + weight * 0.5}; transform:rotate(${rotate}deg); display:inline-block; margin:8px 12px; font-weight:800; cursor:pointer; color:hsl(${Math.random() * 360},70%,75%)" onclick="updateFreqIndicator('${word}', ${freq}, '${personData}')">${word}</span>`;
    }).join('');
}

window.updateFreqIndicator = function (word, total, personDataStr) {
    const indicator = document.getElementById('wordFreqIndicator');
    if (!indicator) return;
    const personData = JSON.parse(personDataStr);
    let winner = null, maxCount = -1;
    for (let name in personData) {
        if (personData[name] > maxCount) { maxCount = personData[name]; winner = name; }
        else if (personData[name] === maxCount) winner = null;
    }
    const breakdown = Object.entries(personData).map(([name, count]) => {
        return name === winner ? `<span style="color:var(--primary); font-weight:900;">👑 ${name} ${count}次</span>` : `${name} ${count}次`;
    }).join(' | ');

    indicator.innerHTML = `<span style="color:var(--primary)">${word}</span>: 共 ${total} 次 (${breakdown})`;
    indicator.style.background = 'rgba(0, 210, 255, 0.25)';
    setTimeout(() => { indicator.style.background = 'rgba(255,255,255,0.05)'; }, 5000);

    if (winner) {
        document.querySelectorAll('.player-stat-box').forEach(box => {
            if (box.querySelector('.player-name').textContent.trim() === winner.trim()) {
                box.classList.remove('winner-anim');
                void box.offsetWidth;
                box.classList.add('winner-anim');
            }
        });
    }
};

function renderReplyDistChart(name, s, elementId, baseColor) {
    const ctx = document.getElementById(elementId).getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['5分內', '30分內', '1小時內', '1小時以上'],
            datasets: [{
                data: [s.replyDist.m5, s.replyDist.m30, s.replyDist.h1, s.replyDist.slow],
                backgroundColor: [baseColor, baseColor + 'b3', baseColor + '66', 'rgba(255, 255, 255, 0.1)'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 } } } } }
    });
}
