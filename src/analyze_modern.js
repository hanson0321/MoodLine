
// DOM Elements
const fileInput = document.getElementById('fileInput');
const loadingDiv = document.getElementById('loading');
const dashboardDiv = document.getElementById('dashboard');
const errorDiv = document.getElementById('error');

// Event Listeners
if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
}

// Main logic
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show loading
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

    // Regex Patterns
    const dateRegex = /^(\d{4})[\/.](0?[1-9]|1[0-2])[\/.](0?[1-9]|[12][0-9]|3[01])\s*[（(].*[）)]/;
    // Time Name Content (Tab separated)
    // Matches: 22:00 [TAB] User [TAB] Msg OR 下午04:46 [TAB] User [TAB] Msg
    const msgRegex = /^(\d{1,2}:\d{2}|(?:上午|下午)\d{2}:\d{2})\t([^\t]+)\t(.*)$/;

    let currentDate = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // Check for Date
        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
            // Format to YYYY-MM-DD
            currentDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
            continue;
        }

        // Check for Message
        const msgMatch = line.match(msgRegex);
        if (msgMatch && currentDate) {
            const timeStr = msgMatch[1];
            const name = msgMatch[2];
            const content = msgMatch[3];

            // Parse Time
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
    return 'text';
}

// ---------------------------------------------------------
// ANALYSIS
// ---------------------------------------------------------
function analyzeChat(data) {
    const { messages, participants } = data;
    if (participants.length < 2) return null; // Need at least 2 people

    // Initialize stats
    const stats = {};
    participants.forEach(p => {
        stats[p] = {
            messageCount: 0,
            wordCount: 0,
            stickerCount: 0,
            initiations: 0, // Topics started
            replyTimes: [], // Array of reply times in ms
            keywords: {
                ambiguous: 0, // 模糊
                emotionaly_pos: 0, // 情緒價值+
                emotionaly_neg: 0  // 情緒價值- (seeking)
            },
            modalParticles: 0, // 語助詞
            lateNightCount: 0, // NEW: Late Night Messages (22:00-04:00)
            keywords: {
                ambiguous: 0, // 模糊
                emotionaly_pos: 0, // 情緒價值+
                emotionaly_neg: 0  // 情緒價值- (seeking)
            },
            modalParticles: 0, // 語助詞
            lateNightCount: 0, // NEW: Late Night Messages (22:00-04:00)
            dailyCounts: {},   // NEW: Daily message volume

            // --- 10 NEW FUN FEATURES ---
            streak: { current: 0, max: 0, lastDate: null }, // 1. Streak
            initiations_long_gap: 0, // 2. Rescuer (> 6hr gap)
            greetings: { morning: 0, night: 0 }, // 3. Greetings
            mediaCount: 0, // 4. Media (Photo/Video)
            laughter: 0, // 5. Laughter
            longestMsg: { content: "", length: 0 }, // 6. Longest Msg
            slowReplies: 0, // 7. Slow Reply (> 1hr)
            replyCount: 0, // Total replies for % calc
            timeDistribution: { morning: 0, afternoon: 0, evening: 0, late: 0 } // 10. Time Distribution
        };
    });

    const GAP_THRESHOLD = 60 * 60 * 1000; // 1 hour gap = new topic
    let lastMsgTime = null;
    let lastSender = null;

    messages.forEach((msg, index) => {
        const p = msg.sender;
        if (!stats[p]) return; // Unknown sender?

        // Basic Counts
        stats[p].messageCount++;
        if (msg.type === 'sticker') stats[p].stickerCount++;
        if (msg.type === 'text') {
            stats[p].wordCount += msg.content.length;

            // Keyword Analysis
            // 模糊: 下次、要不要、那個、早安、晚安
            if (/下次|要不要|那個|早安|晚安/.test(msg.content)) stats[p].keywords.ambiguous++;

            // 語助詞: 哈哈哈、嘛、呢、吧、喔、嗯
            if (/哈哈哈|嘛|呢|吧|喔|嗯|ww|XD/.test(msg.content)) stats[p].modalParticles++;

            // 情緒價值 (Simple heuristic)
            // Giving comfort
            if (/沒事|抱抱|惜惜|乖|加油|辛苦/.test(msg.content)) stats[p].keywords.emotionaly_pos++;
            // Seeking comfort
            if (/好累|煩|哭|難過|討厭|怎麼辦/.test(msg.content)) stats[p].keywords.emotionaly_neg++;
        }

        // --- NEW: Late Night Ratio (Intimacy Indicator) ---
        const hour = msg.timestamp.getHours();
        if (hour >= 22 || hour < 4) {
            stats[p].lateNightCount++;
        }

        // --- NEW: Daily Volume Tracking ---
        const dateKey = msg.timestamp.toISOString().split('T')[0];
        if (!stats[p].dailyCounts[dateKey]) stats[p].dailyCounts[dateKey] = 0;
        stats[p].dailyCounts[dateKey]++;

        // --- 10 NEW FUN FEATURES CALCULATIONS ---

        // 3. Greetings
        if (/(早安|早啊|早上好)/.test(msg.content)) stats[p].greetings.morning++;
        if (/(晚安|睡囉|先睡)/.test(msg.content)) stats[p].greetings.night++;

        // 4. Media
        if (msg.type === 'image' || msg.type === 'video') stats[p].mediaCount++;

        // 5. Laughter
        if (/(哈哈|笑死|XD|ww)/i.test(msg.content)) stats[p].laughter++;

        // 6. Longest Message
        if (msg.type === 'text' && msg.content.length > stats[p].longestMsg.length) {
            stats[p].longestMsg = { content: msg.content, length: msg.content.length };
        }

        // 10. Time Distribution
        // Morning: 05-11, Afternoon: 12-17, Evening: 18-22, Late: 23-04
        if (hour >= 5 && hour < 12) stats[p].timeDistribution.morning++;
        else if (hour >= 12 && hour < 18) stats[p].timeDistribution.afternoon++;
        else if (hour >= 18 && hour <= 22) stats[p].timeDistribution.evening++;
        else stats[p].timeDistribution.late++;

        // Initiative & Reply Speed
        if (lastMsgTime) {
            const diff = msg.timestamp - lastMsgTime;
            const diffMins = diff / 1000 / 60;

            // Ignore if same sender
            if (lastSender !== p) {
                stats[p].replyCount++;
                if (diff < GAP_THRESHOLD) {
                    stats[p].replyTimes.push(diff);
                } else {
                    // New topic started by p
                    stats[p].initiations++;
                }

                // 2. Rescuer (Gap > 6 hours)
                if (diffMins > 360) {
                    stats[p].initiations_long_gap++;
                    // console.log(`Rescuer: ${p} after ${Math.round(diffMins/60)} hours`);
                }

                // 7. Slow Reply (> 1 hour)
                if (diffMins > 60) {
                    stats[p].slowReplies++;
                }

            } else {
                // Same sender continuing matches
                if (diff >= GAP_THRESHOLD) {
                    stats[p].initiations++;
                    if (diffMins > 360) stats[p].initiations_long_gap++;
                }
            }
        } else {
            // First message
            stats[p].initiations++;
        }

        lastMsgTime = msg.timestamp;
        lastSender = p;
    });

    // Post-Process Calculation for Streak & Peak Day
    participants.forEach(p => {
        const s = stats[p];

        // 1. Streak Calculation
        const dates = Object.keys(s.dailyCounts).sort();
        let currentStreak = 0;
        let maxStreak = 0;
        let prevDate = null;

        dates.forEach(d => {
            if (!prevDate) {
                currentStreak = 1;
            } else {
                const dayDiff = (new Date(d) - new Date(prevDate)) / (1000 * 60 * 60 * 24);
                if (dayDiff === 1) {
                    currentStreak++;
                } else {
                    if (currentStreak > maxStreak) maxStreak = currentStreak;
                    currentStreak = 1;
                }
            }
            prevDate = d;
        });
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        s.streak.max = maxStreak;
    });

    // Calculate Averages and Lovesick Score
    participants.forEach(p => {
        const s = stats[p];
        s.avgReplyTime = s.replyTimes.length ? (s.replyTimes.reduce((a, b) => a + b, 0) / s.replyTimes.length) / 1000 / 60 : 0; // in minutes

        // Calculate Lovesick Score (0-100)
        // Factors:
        // 1. Reply Speed (Lower is higher crush): < 2 min = 100, > 60 min = 0
        const speedScore = Math.max(0, 100 - (s.avgReplyTime * 1.5)); // 60 mins -> 10, 5 mins -> 92.5

        // 2. Initiative Ratio (Relative to total loops): High initiative -> High interest
        const totalInitiations = Object.values(stats).reduce((acc, val) => acc + val.initiations, 0);
        const initScore = totalInitiations ? (s.initiations / totalInitiations) * 100 : 0;

        // 3. Investment (Char count ratio): More words -> High interest
        const totalWords = Object.values(stats).reduce((acc, val) => acc + val.wordCount, 0);
        const investScore = totalWords ? (s.wordCount / totalWords) * 100 : 0;

        // 4. Emotional (Particles + Stickers): Frequent use -> High interest
        // Heuristic: Particle/Message ratio * 100 (capped)
        const emoRatio = s.messageCount ? ((s.modalParticles + s.stickerCount) / s.messageCount) * 100 : 0;
        const emoScore = Math.min(100, emoRatio * 2);

        // 5. NEW: Late Night Bonus (Intimacy)
        // Ratio of late night messages
        const lateNightRatio = s.messageCount ? (s.lateNightCount / s.messageCount) * 100 : 0;
        const lateNightBonus = Math.min(20, lateNightRatio * 0.5); // Add up to 20 points

        // Weighted Average
        // Speed: 30%, Init: 20%, Invest: 25%, Emo: 15%, LateNight: 10%
        let baseScore = (speedScore * 0.30) +
            (initScore * 0.20) +
            (investScore * 0.25) +
            (emoScore * 0.15);

        s.lovesickScore = Math.round(Math.min(100, baseScore + lateNightBonus));

        // Determine Level
        if (s.lovesickScore <= 30) s.lovesickLevel = "人間清醒 🧊";
        else if (s.lovesickScore <= 60) s.lovesickLevel = "好感曖昧 🧡";
        else if (s.lovesickScore <= 85) s.lovesickLevel = "深陷其中 💘";
        else s.lovesickLevel = "末期暈船 🚑";

        s.lovesickDesc = getLovesickDesc(s.lovesickScore);
    });

    return { participants, stats };
}

function getLovesickDesc(score) {
    if (score <= 30) return "社交客氣，毫無波瀾。回覆慢，字數少，情緒平穩。";
    if (score <= 60) return "水面下的角力，有點意思。會主動開話題，有來有往。";
    if (score <= 85) return "訊息秒回，情緒被對方牽著走。投入大量字數與貼圖。";
    return "自我攻略，沒救了請送醫。極度卑微，充滿討好與等待。";
}


// ---------------------------------------------------------
// RENDERING
// ---------------------------------------------------------
function renderDashboard(data) {
    if (!data || !data.participants || data.participants.length < 2) {
        showError("Data insufficient for analysis. Need at least 2 participants.");
        return;
    }
    const { participants, stats } = data;
    const p1 = participants[0];
    const p2 = participants[1];

    const container = document.getElementById('dashboard-content');
    container.innerHTML = ''; // Clear previous

    // 1. HEADER: Player Cards
    const headerHTML = `
        <div class="dashboard-header">
            ${createPlayerCard(p1, stats[p1], 'p1')}
            ${createPlayerCard(p2, stats[p2], 'p2')}
        </div>
    `;
    // container.appendChild(headerDiv);

    // 2. METRICS GRID
    const metricsHTML = `
        <div class="metrics-grid">
            ${createMetricCard('平均回覆速度',
        `${Math.round(stats[p1].avgReplyTime)} min`,
        `${Math.round(stats[p2].avgReplyTime)} min`,
        p1, p2, stats[p1].avgReplyTime < stats[p2].avgReplyTime)}
        ${createMetricCard('主動開話題',
            stats[p1].initiations,
            stats[p2].initiations,
            p1, p2, stats[p1].initiations > stats[p2].initiations)}
        ${createMetricCard('總字數',
                stats[p1].wordCount,
                stats[p2].wordCount,
                p1, p2, stats[p1].wordCount > stats[p2].wordCount)}
        ${createMetricCard('貼圖頻率',
                    stats[p1].stickerCount,
                    stats[p2].stickerCount,
                    p1, p2, stats[p1].stickerCount > stats[p2].stickerCount)}
        </div>
    `;
    // container.appendChild(metricsDiv);

    // 3. ANALYSIS DETAILS
    const analysisHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            <div class="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                <h3 class="text-xl font-bold mb-4 text-purple-400">📊 關鍵字掃描</h3>
                <div class="space-y-4">
                     ${createKeywordRow('模糊曖昧詞 (下次/早安...)', stats[p1].keywords.ambiguous, stats[p2].keywords.ambiguous)}
                     ${createKeywordRow('語助詞 (哈哈哈/嘛/呢...)', stats[p1].modalParticles, stats[p2].modalParticles)}
                </div>
            </div>
            <div class="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                <h3 class="text-xl font-bold mb-4 text-pink-400">❤️ 情緒價值分析</h3>
                 <div class="space-y-4">
                     ${createKeywordRow('提供情緒 (乖/抱抱...)', stats[p1].keywords.emotionaly_pos, stats[p2].keywords.emotionaly_pos)}
                     ${createKeywordRow('索取情緒 (累/哭...)', stats[p1].keywords.emotionaly_neg, stats[p2].keywords.emotionaly_neg)}
                </div>
            </div>
        </div>
    `;

    // 4. NEW: INTENDED FEATURES (Charts)
    const lateNightHTML = `
        <div class="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 mb-12">
            <h3 class="text-xl font-bold mb-4 text-yellow-400">🌙 深夜談心 (Late Night Chats)</h3>
            <p class="text-gray-400 text-sm mb-4">分析 22:00 - 04:00 之間的對話比例，這是最容易產生好感的時段。</p>
            ${createKeywordRow('深夜訊息量', stats[p1].lateNightCount, stats[p2].lateNightCount)}
        </div>
    `;

    // 5. NEW FUN FEATURES HTML
    const funFeaturesHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
            ${createMiniCard('🔥 暈船長跑 (Max Streak)', `${stats[p1].streak.max} 天`, `${stats[p2].streak.max} 天`, p1, p2, stats[p1].streak.max > stats[p2].streak.max)}
            ${createMiniCard('🚑 話題急救 (Topic Rescuer)', `${stats[p1].initiations_long_gap} 次`, `${stats[p2].initiations_long_gap} 次`, p1, p2, stats[p1].initiations_long_gap > stats[p2].initiations_long_gap)}
            ${createMiniCard('😂 哈哈魔人 (Lols)', `${stats[p1].laughter}`, `${stats[p2].laughter}`, p1, p2, stats[p1].laughter > stats[p2].laughter)}
            ${createMiniCard('🐢 樹懶回覆 (>1hr)', `${stats[p1].slowReplies}`, `${stats[p2].slowReplies}`, p1, p2, stats[p1].slowReplies < stats[p2].slowReplies)}
            ${createMiniCard('📸 流量怪獸 (Media)', `${stats[p1].mediaCount}`, `${stats[p2].mediaCount}`, p1, p2, stats[p1].mediaCount > stats[p2].mediaCount)}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
             <div class="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                <h3 class="text-xl font-bold mb-4 text-orange-400">🌞 晨昏定省 (Greetings)</h3>
                <div class="space-y-4">
                     ${createKeywordRow('早安 (Morning)', stats[p1].greetings.morning, stats[p2].greetings.morning)}
                     ${createKeywordRow('晚安 (Night)', stats[p1].greetings.night, stats[p2].greetings.night)}
                </div>
            </div>
             <div class="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                <h3 class="text-xl font-bold mb-4 text-indigo-400">⚖️ 卑微天秤 (Word Ratio)</h3>
                <div class="flex items-center justify-center h-full pb-8">
                     <div style="text-align: center;">
                        <div class="text-4xl font-bold text-white mb-2">${(stats[p1].wordCount / (stats[p2].wordCount || 1)).toFixed(2)} x</div>
                        <div class="text-sm text-gray-400">比起對方，${p1} 講了更多話</div>
                     </div>
                </div>
            </div>
             <div class="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                <h3 class="text-xl font-bold mb-4 text-green-400">🕰️ 出沒時間 (Time)</h3>
                <div class="space-y-2 text-sm">
                    ${createTimeDistRow('早 (05-11)', stats[p1].timeDistribution.morning, stats[p2].timeDistribution.morning)}
                    ${createTimeDistRow('午 (12-17)', stats[p1].timeDistribution.afternoon, stats[p2].timeDistribution.afternoon)}
                    ${createTimeDistRow('晚 (18-22)', stats[p1].timeDistribution.evening, stats[p2].timeDistribution.evening)}
                    ${createTimeDistRow('夜 (23-04)', stats[p1].timeDistribution.late, stats[p2].timeDistribution.late)}
                </div>
            </div>
        </div>

        <div class="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 mb-12">
            <h3 class="text-xl font-bold mb-4 text-teal-400">✍️ 作文大賽 (Longest Message)</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="p-4 bg-gray-700 rounded-lg">
                    <div class="text-xs text-gray-400 mb-2">${p1} 最長的一句話 (${stats[p1].longestMsg.length} 字)</div>
                    <div class="text-white italic">"${stats[p1].longestMsg.content.substring(0, 100)}${stats[p1].longestMsg.content.length > 100 ? '...' : ''}"</div>
                </div>
                 <div class="p-4 bg-gray-700 rounded-lg">
                    <div class="text-xs text-gray-400 mb-2">${p2} 最長的一句話 (${stats[p2].longestMsg.length} 字)</div>
                    <div class="text-white italic">"${stats[p2].longestMsg.content.substring(0, 100)}${stats[p2].longestMsg.content.length > 100 ? '...' : ''}"</div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = headerHTML + metricsHTML + funFeaturesHTML + analysisHTML + lateNightHTML + chartHTML;

    // Render the chart after HTML injection
    renderTrendChart(p1, p2, stats, 'trendChart');
}

function renderTrendChart(p1, p2, stats, canvasId) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    // Get all unique dates
    const allDates = new Set([
        ...Object.keys(stats[p1].dailyCounts),
        ...Object.keys(stats[p2].dailyCounts)
    ]);
    const sortedDates = Array.from(allDates).sort();

    // Prepare datasets
    const d1 = sortedDates.map(d => stats[p1].dailyCounts[d] || 0);
    const d2 = sortedDates.map(d => stats[p2].dailyCounts[d] || 0);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates,
            datasets: [
                {
                    label: p1,
                    data: d1,
                    borderColor: '#60A5FA', // Blue-400
                    backgroundColor: 'rgba(96, 165, 250, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: p2,
                    data: d2,
                    borderColor: '#F472B6', // Pink-400
                    backgroundColor: 'rgba(244, 114, 182, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    labels: { color: '#ccc' }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#888' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#888' },
                    beginAtZero: true
                }
            }
        }
    });
}

function createPlayerCard(name, stat, id) {
    let levelClass = 'level-cold';
    if (stat.lovesickScore > 30) levelClass = 'level-warm';
    if (stat.lovesickScore > 60) levelClass = 'level-hot';
    if (stat.lovesickScore > 85) levelClass = 'level-terminal';

    return `
        <div class="player-card ${levelClass} ${id}">
            <div class="card-bg-score">${stat.lovesickScore}%</div>
            <div class="card-content">
                <h2 class="player-name">${name}</h2>
                <div class="card-subtitle">暈船指數 Lovesick Index</div>
                
                <div class="score-display">
                    <span class="score-value">${stat.lovesickScore}%</span>
                    <span class="score-badge">${stat.lovesickLevel}</span>
                </div>
                
                <p class="score-desc">${stat.lovesickDesc}</p>
                
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${stat.lovesickScore}%"></div>
                </div>
            </div>
        </div>
    `;
}

function createMetricCard(title, v1, v2, n1, n2, p1Wins) {
    return `
        <div class="metric-card">
            <h4 class="metric-title">${title}</h4>
            <div class="metric-values">
                <div class="metric-item ${p1Wins ? 'winner' : ''}">
                    <div class="val">${v1}</div>
                    <div class="lbl">${n1}</div>
                </div>
                <div class="metric-divider">vs</div>
                <div class="metric-item ${!p1Wins ? 'winner' : ''}">
                    <div class="val">${v2}</div>
                    <div class="lbl">${n2}</div>
                </div>
            </div>
        </div>
    `;
}

function createKeywordRow(label, v1, v2) {
    const total = v1 + v2;
    const p1Pct = total ? (v1 / total) * 100 : 50;
    const p2Pct = total ? (v2 / total) * 100 : 50;

    return `
        <div class="keyword-row">
            <div class="row-header">
                <span class="val-left">${v1}</span>
                <span class="row-label">${label}</span>
                <span class="val-right">${v2}</span>
            </div>
            <div class="row-bar">
                <div class="bar-left" style="width: ${p1Pct}%"></div>
                <div class="bar-right" style="width: ${p2Pct}%"></div>
            </div>
        </div>
    `;
}


function createMiniCard(title, v1, v2, n1, n2, p1Wins) {
    return `
        <div class="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div class="text-gray-400 text-xs font-medium uppercase truncate mb-2" title="${title}">${title}</div>
            <div class="flex justify-between items-end">
                <div>
                   <span class="text-lg font-bold ${p1Wins ? 'text-green-400' : 'text-gray-300'}">${v1}</span>
                   <div class="text-[10px] text-gray-500">${n1}</div>
                </div>
                <div class="text-right">
                   <span class="text-lg font-bold ${!p1Wins ? 'text-green-400' : 'text-gray-300'}">${v2}</span>
                   <div class="text-[10px] text-gray-500">${n2}</div>
                </div>
            </div>
        </div>
    `;
}

function createTimeDistRow(label, v1, v2) {
    const total = v1 + v2;
    const p1Pct = total ? (v1 / total) * 100 : 0;
    const p2Pct = total ? (v2 / total) * 100 : 0;

    return `
        <div class="flex items-center text-xs">
            <div class="w-16 text-gray-400">${label}</div>
            <div class="flex-1 flex h-2 bg-gray-700 rounded-full overflow-hidden mx-2">
                 <div class="bg-blue-500" style="width: ${p1Pct}%"></div>
                 <div class="bg-pink-500" style="width: ${p2Pct}%"></div>
            </div>
        </div>
    `;
}

function showError(msg) {
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
        errorDiv.textContent = msg;
        errorDiv.classList.remove('hidden');
    }
}
