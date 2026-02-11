
// DOM Elements
const fileInput = document.getElementById('fileInput');
const loadingDiv = document.getElementById('loading');
const dashboardDiv = document.getElementById('dashboard');
const errorDiv = document.getElementById('error');

// Event Listeners
if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
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
            const analysis = analyzeChat(chatData);
            renderDashboard(analysis);

            loadingDiv.classList.add('hidden');
            dashboardDiv.classList.remove('hidden');
        } catch (err) {
            console.error(err);
            loadingDiv.classList.add('hidden');
            errorDiv.textContent = "解析失敗：請確認檔案格式是否為 LINE 文字檔。(" + err.message + ")";
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
    const msgRegex = /^(\d{1,2}:\d{2}|(?:上午|下午)\d{2}:\d{2})\t([^\t]+)\t(.*)$/;

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
            const name = msgMatch[2];
            const content = msgMatch[3];

            let hours, minutes;
            if (timeStr.includes('上午') || timeStr.includes('下午')) {
                const isPM = timeStr.includes('下午');
                const tParts = timeStr.replace(/(上午|下午)/, '').split(':');
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
            participants.add(name);
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
            missedCalls: 0
        };
    });

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
            const durationMatch = msg.content.match(/通話時間\s+((\d+:)?\d+:\d+)/);
            if (durationMatch) {
                const parts = durationMatch[1].split(':').reverse();
                let sec = 0;
                if (parts[0]) sec += parseInt(parts[0]);
                if (parts[1]) sec += parseInt(parts[1]) * 60;
                if (parts[2]) sec += parseInt(parts[2]) * 3600;
                stats[p].callDuration += sec;
            }
        } else if (msg.type === 'missed_call') {
            stats[p].missedCalls++;
        }

        if (msg.type === 'text') {
            stats[p].wordCount += msg.content.length;
            if (/下次|要不要|那個|早安|晚安/.test(msg.content)) stats[p].keywords.ambiguous++;
            if (/哈哈哈|嘛|呢|吧|喔|嗯|ww|XD/.test(msg.content)) stats[p].modalParticles++;
            if (/沒事|抱抱|惜惜|乖|加油|辛苦/.test(msg.content)) stats[p].keywords.emotionaly_pos++;
            if (/好累|煩|哭|難過|討厭|怎麼辦/.test(msg.content)) stats[p].keywords.emotionaly_neg++;
            if (/(早安|早啊|早上好)/.test(msg.content)) stats[p].greetings.morning++;
            if (/(晚安|睡囉|先睡)/.test(msg.content)) stats[p].greetings.night++;
            if (/(哈哈|笑死|XD|ww)/i.test(msg.content)) stats[p].laughter++;
            if (msg.content.length > stats[p].longestMsg.length) {
                stats[p].longestMsg = { content: msg.content, length: msg.content.length };
            }
        }

        const hour = msg.timestamp.getHours();
        if (hour >= 22 || hour < 4) stats[p].lateNightCount++;

        const dateKey = msg.timestamp.toISOString().split('T')[0];
        stats[p].dailyCounts[dateKey] = (stats[p].dailyCounts[dateKey] || 0) + 1;

        if (hour >= 5 && hour < 12) stats[p].timeDistribution.morning++;
        else if (hour >= 12 && hour < 18) stats[p].timeDistribution.afternoon++;
        else if (hour >= 18 && hour < 22) stats[p].timeDistribution.evening++;
        else stats[p].timeDistribution.late++;

        if (lastMsgTime) {
            const diff = msg.timestamp - lastMsgTime;
            const diffMins = diff / 1000 / 60;

            if (lastSender !== p) {
                stats[p].replyCount++;
                if (diff < GAP_THRESHOLD) {
                    stats[p].replyTimes.push(diff);
                } else {
                    stats[p].initiations++;
                }
                if (diffMins > 360) stats[p].initiations_long_gap++;
                if (diffMins > 60) stats[p].slowReplies++;
            } else {
                if (diff >= GAP_THRESHOLD) {
                    stats[p].initiations++;
                    if (diffMins > 360) stats[p].initiations_long_gap++;
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
        s.avgReplyTime = s.replyTimes.length ? (s.replyTimes.reduce((a, b) => a + b, 0) / s.replyTimes.length) / 1000 / 60 : 0;

        const speedScore = Math.max(0, 100 - (s.avgReplyTime * 1.5));
        const totalInit = Object.values(stats).reduce((a, v) => a + v.initiations, 0);
        const initScore = totalInit ? (s.initiations / totalInit) * 100 : 0;
        const totalWords = Object.values(stats).reduce((a, v) => a + v.wordCount, 0);
        const investScore = totalWords ? (s.wordCount / totalWords) * 100 : 0;
        const emoRatio = s.messageCount ? ((s.modalParticles + s.stickerCount) / s.messageCount) * 100 : 0;
        const emoScore = Math.min(100, emoRatio * 2);
        const lateNightRatio = s.messageCount ? (s.lateNightCount / s.messageCount) * 100 : 0;
        const lateNightBonus = Math.min(20, lateNightRatio * 0.5);

        s.lovesickScore = Math.round(Math.min(100, (speedScore * 0.3) + (initScore * 0.2) + (investScore * 0.25) + (emoScore * 0.15) + lateNightBonus));

        if (s.lovesickScore <= 30) { s.lovesickLevel = "人間清醒 🧊"; s.lovesickDesc = "社交客氣，毫無波瀾。回覆慢，字數少，情緒平穩。"; }
        else if (s.lovesickScore <= 60) { s.lovesickLevel = "好感曖昧 🧡"; s.lovesickDesc = "水面下的角力，有點意思。會主動開話題，有來有往。"; }
        else if (s.lovesickScore <= 85) { s.lovesickLevel = "深陷其中 💘"; s.lovesickDesc = "訊息秒回，情緒被對方牽著走。投入大量字數與貼圖。"; }
        else { s.lovesickLevel = "末期暈船 🚑"; s.lovesickDesc = "自我攻略，沒救了請送醫。極度卑微，充滿討好與等待。"; }
    });

    return { participants, stats };
}

// ---------------------------------------------------------
// RENDERING
// ---------------------------------------------------------
function renderDashboard(data) {
    const { participants, stats } = data;
    const p1 = participants[0], p2 = participants[1];
    const container = document.getElementById('dashboard-content');
    container.innerHTML = '';

    // Lovesick Analysis Header
    container.innerHTML += `
        <div class="card-premium" style="margin-bottom:32px;">
            <div class="player-comparison">
                ${renderPlayerBox(p1, stats[p1])}
                ${renderPlayerBox(p2, stats[p2])}
            </div>
            <div style="text-align: center; margin-top: 20px; color: var(--text-muted); font-size: 0.9rem;">
                根據回覆速度、話題主動性、情感投入度與深夜活躍度生成的綜合評分。
            </div>
        </div>
    `;

    // Call Analysis
    container.innerHTML += `
        <div class="section-header">
            <h2 class="section-title">📞 通話通靈 (Call Analysis)</h2>
            <div class="section-line"></div>
        </div>
        <div class="call-analysis">
            ${renderCallCard('總通話次數', stats[p1].callCount, stats[p2].callCount, '📱')}
            ${renderCallCard('總通話時長', formatDuration(stats[p1].callDuration), formatDuration(stats[p2].callDuration), '⏳')}
            ${renderCallCard('未接/取消', stats[p1].missedCalls, stats[p2].missedCalls, '🚫')}
        </div>
    `;

    // General Metrics
    container.innerHTML += `
        <div class="section-header">
            <h2 class="section-title">📊 基礎數據 (General Metrics)</h2>
            <div class="section-line"></div>
        </div>
        <div class="metrics-row">
            ${renderMetricPremium('平均回覆速度', `${Math.round(stats[p1].avgReplyTime)}m`, `${Math.round(stats[p2].avgReplyTime)}m`, stats[p1].avgReplyTime, stats[p2].avgReplyTime, true)}
            ${renderMetricPremium('主動發起話題', stats[p1].initiations, stats[p2].initiations, stats[p1].initiations, stats[p2].initiations)}
            ${renderMetricPremium('總字數投入', stats[p1].wordCount, stats[p2].wordCount, stats[p1].wordCount, stats[p2].wordCount)}
            ${renderMetricPremium('媒體與貼圖', stats[p1].stickerCount + stats[p1].mediaCount, stats[p2].stickerCount + stats[p2].mediaCount, stats[p1].stickerCount + stats[p1].mediaCount, stats[p2].stickerCount + stats[p2].mediaCount)}
        </div>
    `;

    // Deep Insights
    container.innerHTML += `
        <div class="section-header">
            <h2 class="section-title">🧠 深度洞察 (Deep Insights)</h2>
            <div class="section-line"></div>
        </div>
        <div class="grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap:24px; margin-bottom:32px;">
            <div class="card-premium">
                <h3 style="margin-bottom:20px; color:var(--primary)">✨ 情感詞彙頻率</h3>
                <div style="display:flex; flex-direction:column; gap:16px;">
                    ${renderKeywordRow('模糊曖昧詞 (下次/早安)', stats[p1].keywords.ambiguous, stats[p2].keywords.ambiguous)}
                    ${renderKeywordRow('提供情緒 (乖/抱抱)', stats[p1].keywords.emotionaly_pos, stats[p2].keywords.emotionaly_pos)}
                    ${renderKeywordRow('索取情緒 (累/煩)', stats[p1].keywords.emotionaly_neg, stats[p2].keywords.emotionaly_neg)}
                    ${renderKeywordRow('深夜訊息量 (22-04)', stats[p1].lateNightCount, stats[p2].lateNightCount)}
                </div>
            </div>
            <div class="card-premium">
                <h3 style="margin-bottom:20px; color:var(--secondary)">🏆 對話榮譽榜</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                    ${renderTrophyCard('🔥 暈船長跑', `${stats[p1].streak.max} 天`, `${stats[p2].streak.max} 天`)}
                    ${renderTrophyCard('🚑 話題急救', stats[p1].initiations_long_gap, stats[p2].initiations_long_gap)}
                    ${renderTrophyCard('😂 哈哈魔人', stats[p1].laughter, stats[p2].laughter)}
                    ${renderTrophyCard('🐢 樹懶回覆', stats[p1].slowReplies, stats[p2].slowReplies)}
                </div>
            </div>
        </div>
    `;

    // Longest Message
    container.innerHTML += `
        <div class="card-premium" style="margin-bottom:32px;">
            <h3 style="margin-bottom:20px; color:var(--text-main)">✍️ 作文大賽 (Longest Messages)</h3>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:24px;">
                ${renderLongMsg(p1, stats[p1].longestMsg)}
                ${renderLongMsg(p2, stats[p2].longestMsg)}
            </div>
        </div>
    `;

    // Trend Chart
    container.innerHTML += `
        <div class="section-header">
            <h2 class="section-title">📈 暈船走勢 (Chat Frequency)</h2>
            <div class="section-line"></div>
        </div>
        <div class="card-premium">
            <div class="chart-container">
                <canvas id="trendChart"></canvas>
            </div>
        </div>
    `;

    renderTrendChart(p1, p2, stats);
}

function renderPlayerBox(name, s) {
    return `
        <div class="player-stat-box">
            <div class="player-name">${name}</div>
            <div class="lovesick-index">
                <svg class="lovesick-circle" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8" />
                    <circle cx="50" cy="50" r="45" fill="none" stroke="var(--primary)" stroke-width="8" 
                        stroke-dasharray="${s.lovesickScore * 2.82} 282" stroke-linecap="round" 
                        stroke-shadow="0 0 10px var(--primary-glow)"/>
                </svg>
                <div style="text-align: center;">
                    <div class="index-value">${s.lovesickScore}%</div>
                    <div class="index-label">${s.lovesickLevel}</div>
                </div>
            </div>
            <div style="max-width:240px; margin:0 auto; font-size:0.875rem; color:#94a3b8; line-height:1.6;">
                ${s.lovesickDesc}
            </div>
        </div>
    `;
}

function renderCallCard(label, v1, v2, icon) {
    return `
        <div class="call-card">
            <div class="call-icon">${icon}</div>
            <div class="call-data">
                <div class="call-label">${label}</div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div class="call-value" style="color: var(--primary)">${v1}</div>
                    <div style="color: var(--text-muted); font-size: 0.75rem; margin: 0 10px;">vs</div>
                    <div class="call-value" style="color: var(--secondary)">${v2}</div>
                </div>
            </div>
        </div>
    `;
}

function renderMetricPremium(title, v1, v2, val1, val2, lowerIsBetter = false) {
    const total = val1 + val2;
    const p1Pct = total ? (val1 / total) * 100 : 50;
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
                <div class="bar-part" style="width: ${p1Pct}%; background: var(--primary)"></div>
                <div class="bar-part" style="width: ${p2Pct}%; background: var(--secondary)"></div>
            </div>
        </div>
    `;
}

function renderKeywordRow(label, v1, v2) {
    const total = v1 + v2;
    const p1Pct = total ? (v1 / total) * 100 : 50;
    return `
        <div style="font-size:0.875rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:var(--text-muted);">
                <span>${label}</span>
                <span>${v1} / ${v2}</span>
            </div>
            <div class="comparison-bar" style="height:4px;">
                <div class="bar-part" style="width: ${p1Pct}%; background: var(--primary)"></div>
                <div class="bar-part" style="width: ${100 - p1Pct}%; background: var(--secondary)"></div>
            </div>
        </div>
    `;
}

function renderTrophyCard(title, v1, v2) {
    return `
        <div style="background:rgba(255,255,255,0.02); padding:16px; border-radius:12px; border:1px solid var(--glass-border);">
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">${title}</div>
            <div style="display:flex; justify-content:space-between; font-weight:700;">
                <span style="color:var(--primary)">${v1}</span>
                <span style="color:var(--secondary)">${v2}</span>
            </div>
        </div>
    `;
}

function renderLongMsg(name, msg) {
    return `
        <div style="background:rgba(255,255,255,0.02); padding:20px; border-radius:16px; border:1px solid var(--glass-border);">
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:12px;">${name} 的最長回覆 (${msg.length} 字)</div>
            <div style="font-style:italic; color:var(--text-main); font-size:0.9rem; line-height:1.6; max-height:120px; overflow-y:auto; padding-right:8px;">
                "${msg.content}"
            </div>
        </div>
    `;
}

function formatDuration(sec) {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function renderTrendChart(p1, p2, stats) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const allDates = Array.from(new Set([...Object.keys(stats[p1].dailyCounts), ...Object.keys(stats[p2].dailyCounts)])).sort();
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: allDates,
            datasets: [
                {
                    label: p1,
                    data: allDates.map(d => stats[p1].dailyCounts[d] || 0),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2
                },
                {
                    label: p2,
                    data: allDates.map(d => stats[p2].dailyCounts[d] || 0),
                    borderColor: '#ec4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Outfit' } } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748b' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' }, beginAtZero: true }
            }
        }
    });
}
