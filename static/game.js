let storyData = {};
let puzzlesData = {};
let playerInventory = [];
let currentPuzzleId = null;
let currentPuzzleType = null;
let isTyping = false;
let currentTypingSession = 0;

// Mobile Notebook Toggle
const notebook = document.getElementById('notebook');
const notebookOverlay = document.getElementById('notebook-overlay');

document.getElementById('toggle-notebook-btn').addEventListener('click', () => {
    notebook.classList.add('active-mobile');
    notebookOverlay.classList.add('active');
    triggerHaptic(10);
});

const closeNotebook = () => {
    notebook.classList.remove('active-mobile');
    notebookOverlay.classList.remove('active');
};

document.getElementById('close-notebook-btn').addEventListener('click', closeNotebook);
notebookOverlay.addEventListener('click', closeNotebook);

// Haptic feedback helper
function triggerHaptic(duration = 20) {
    if ("vibrate" in navigator) {
        navigator.vibrate(duration);
    }
}

// Fetch narrative and puzzle data on load
async function loadGameData() {
    const [storyRes, puzzleRes] = await Promise.all([
        fetch('/data/story_nodes.json'),
        fetch('/data/puzzles.json')
    ]);
    storyData = await storyRes.json();
    puzzlesData = await puzzleRes.json();
}

async function initGame() {
    try {
        await loadGameData();
        renderNode('node_intro', true);
    } catch (error) {
        console.error('Failed to load game data:', error);
        document.getElementById('manuscript').innerHTML = '<p class="story-text">Սխալ՝ տվյալները բեռնելիս:</p>';
    }
}

async function typeWriter(text, element) {
    if (!text) return;
    const session = ++currentTypingSession;
    isTyping = true;
    element.classList.add('typing');
    element.textContent = '';
    
    try {
        for (let i = 0; i < text.length; i++) {
            if (session !== currentTypingSession) {
                // If cancelled, reset isTyping and stop
                isTyping = false; 
                return;
            }
            
            element.textContent += text.charAt(i);
            await new Promise(resolve => setTimeout(resolve, 15 + Math.random() * 15));
            if (i % 8 === 0) triggerHaptic(2);
        }
    } catch (e) {
        console.error("Typewriter error:", e);
        element.textContent = text; 
    } finally {
        if (session === currentTypingSession) {
            element.classList.remove('typing');
            isTyping = false;
        }
    }
}

async function renderNode(nodeId, isInitial = false) {
    const node = storyData[nodeId];
    if (!node) return;

    if (node.type === 'puzzle') {
        openPuzzle(node.puzzleId, node.successNode);
        return;
    }

    // Force cancel current typing session
    currentTypingSession++;
    isTyping = false;

    const manuscriptDiv = document.getElementById('manuscript');
    const toolkitDiv = document.getElementById('toolkit');
    const modal = document.getElementById('puzzle-modal');
    
    if (modal) modal.classList.add('hidden');

    toolkitDiv.innerHTML = '';
    toolkitDiv.style.pointerEvents = 'none';
    toolkitDiv.style.opacity = '0';

    if (nodeId === 'node_intro' && !isInitial) {
        manuscriptDiv.innerHTML = ''; 
        playerInventory = [];
        updateNotebook();
        rapidState = 0;
        assembledSequence = [];
    }

    // Update Visuals
    const charContainer = document.querySelector('.character-container');
    const charNameDiv = document.getElementById('character-name');
    const sceneImg = document.getElementById('scene-image');
    
    if (node.character) {
        charNameDiv.textContent = node.character;
        charContainer.style.display = 'flex';
    } else {
        charContainer.style.display = 'none';
    }

    if (node.image) {
        sceneImg.style.opacity = '0';
        const img = new Image();
        img.src = node.image;
        img.onload = () => {
            sceneImg.src = node.image;
            sceneImg.style.opacity = '1';
        };
    }

    const textElement = document.createElement('p');
    textElement.className = 'story-text';
    manuscriptDiv.appendChild(textElement);
    
    await typeWriter(node.text, textElement);
    manuscriptDiv.scrollTop = manuscriptDiv.scrollHeight;

    if (node.choices) {
        node.choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice.text;
            
            const handleAction = (e) => {
                e.preventDefault();
                if (!isTyping && !btn.disabled) {
                    const allButtons = toolkitDiv.querySelectorAll('.choice-btn');
                    allButtons.forEach(b => {
                        b.disabled = true;
                        b.style.opacity = '0.5';
                        b.style.cursor = 'not-allowed';
                    });
                    
                    triggerHaptic(30);
                    renderNode(choice.nextNode);
                }
            };
            
            btn.onclick = handleAction;
            toolkitDiv.appendChild(btn);
        });
    }
    
    toolkitDiv.style.opacity = '1';
    toolkitDiv.style.pointerEvents = 'all';
}

function updateNotebook() {
    const list = document.getElementById('principles-list');
    list.innerHTML = '';
    if (playerInventory.length === 0) {
        list.innerHTML = '<li class="empty-notebook">Դեռևս դատարկ է...</li>';
    } else {
        playerInventory.forEach(principle => {
            const li = document.createElement('li');
            li.textContent = principle;
            list.appendChild(li);
        });
    }
}

// --- PUZZLE ROUTING ---

function openPuzzle(puzzleId, successNode) {
    if (!puzzlesData || Object.keys(puzzlesData).length === 0) {
        loadGameData().then(() => {
            if (puzzlesData[puzzleId]) openPuzzle(puzzleId, successNode);
        });
        return;
    }

    const puzzle = puzzlesData[puzzleId];
    if (!puzzle) return;

    currentPuzzleId = puzzleId;
    currentPuzzleType = puzzle.type;
    window.currentSuccessNode = successNode;

    const modal = document.getElementById('puzzle-modal');
    const puzzleArea = document.getElementById('puzzle-area');
    const feedbackDiv = document.getElementById('puzzle-feedback');
    const checkBtn = document.getElementById('check-puzzle-btn');

    if (!modal || !puzzleArea) return;

    puzzleArea.innerHTML = '<div style="text-align:center; padding: 20px;">Բեռնվում է...</div>';
    feedbackDiv.className = 'puzzle-feedback hidden';
    feedbackDiv.textContent = '';
    checkBtn.style.display = 'none';
    
    activeToken = null;

    modal.classList.remove('hidden');
    modal.style.opacity = '1';

    document.getElementById('puzzle-title').textContent = puzzle.title;
    document.getElementById('puzzle-description').textContent = puzzle.description;
    
    setTimeout(() => {
        puzzleArea.innerHTML = ''; 
        try {
            if (puzzle.type === 'rashomon') setupRashomon(puzzleArea, puzzle);
            else if (puzzle.type === 'eraser') setupEraser(puzzleArea, puzzle);
            else if (puzzle.type === 'punctuation') setupPunctuation(puzzleArea, puzzle);
            else if (puzzle.type === 'timeline') setupTimeline(puzzleArea, puzzle);
            else if (puzzle.type === 'cipher') setupCipher(puzzleArea, puzzle);
            else if (puzzle.type === 'rapid_conflict') setupRapidConflict(puzzleArea, puzzle, checkBtn);
            
            checkBtn.style.display = 'block';
            checkBtn.disabled = false;
            triggerHaptic(50);
        } catch (err) {
            puzzleArea.innerHTML = '<div class="puzzle-feedback error">Սխալ՝ առաջադրանքը բեռնելիս:</div>';
        }
    }, 300);
}

// --- PUZZLE 1: RASHOMON ---
let draggedItem = null;
function setupRashomon(container, puzzle) {
    const wrap = document.createElement('div');
    wrap.className = 'rashomon-container';
    const sourceDiv = document.createElement('div');
    sourceDiv.className = 'draggable-statements';
    sourceDiv.id = 'r-source';
    
    puzzle.statements.sort(() => Math.random() - 0.5).forEach(stmt => {
        const card = document.createElement('div');
        card.className = 'word-card';
        card.draggable = true;
        card.textContent = stmt.text;
        card.dataset.id = stmt.id;
        card.addEventListener('dragstart', e => {
            draggedItem = card;
            card.classList.add('dragging');
            e.dataTransfer.setData('text', card.dataset.id);
            triggerHaptic(10);
        });
        card.addEventListener('dragend', () => {
            draggedItem = null;
            card.classList.remove('dragging');
            document.querySelectorAll('.r-zone').forEach(z => z.classList.remove('drag-over'));
        });
        sourceDiv.appendChild(card);
    });

    const zonesDiv = document.createElement('div');
    zonesDiv.className = 'rashomon-zones';
    ['bella', 'vahan'].forEach(owner => {
        const zone = document.createElement('div');
        zone.className = `r-zone ${owner}`;
        zone.dataset.owner = owner;
        zone.innerHTML = `<h4>${owner === 'bella' ? 'Բելլա (Ներքևում)' : 'Վահան (Վերևում)'}</h4>`;
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const id = e.dataTransfer.getData('text');
            const el = draggedItem || document.querySelector(`.word-card[data-id="${id}"]`);
            if (el) {
                zone.appendChild(el);
                triggerHaptic(20);
            }
        });
        zonesDiv.appendChild(zone);
    });
    wrap.appendChild(sourceDiv);
    wrap.appendChild(zonesDiv);
    container.appendChild(wrap);
}

function checkRashomon(puzzle) {
    let correct = true;
    puzzle.statements.forEach(stmt => {
        const card = document.querySelector(`.word-card[data-id="${stmt.id}"]`);
        if (!card || !card.parentElement.classList.contains(stmt.owner)) correct = false;
    });
    return correct;
}

// --- PUZZLE 2: ERASER ---
function setupEraser(container, puzzle) {
    const textDiv = document.createElement('div');
    textDiv.className = 'eraser-text';
    puzzle.text_segments.forEach(seg => {
        const span = document.createElement('span');
        span.className = 'eraser-span';
        span.textContent = seg.text;
        span.dataset.subjective = seg.is_subjective;
        span.onclick = () => {
            span.classList.toggle('erased');
            triggerHaptic(15);
        };
        textDiv.appendChild(span);
    });
    container.appendChild(textDiv);
}

function checkEraser(puzzle) {
    let correct = true;
    document.querySelectorAll('.eraser-span').forEach(span => {
        const isSubj = span.dataset.subjective === 'true';
        const isErased = span.classList.contains('erased');
        if (isSubj !== isErased) correct = false;
    });
    return correct;
}

// --- PUZZLE 3: PUNCTUATION ---
let activeToken = null;
function setupPunctuation(container, puzzle) {
    const tokensDiv = document.createElement('div');
    tokensDiv.className = 'punct-tokens';
    puzzle.available_tokens.forEach(tok => {
        const btn = document.createElement('div');
        btn.className = 'punct-token';
        btn.textContent = tok;
        btn.onclick = () => {
            document.querySelectorAll('.punct-token').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            activeToken = tok;
            triggerHaptic(10);
        };
        tokensDiv.appendChild(btn);
    });
    container.appendChild(tokensDiv);

    puzzle.sentences.forEach((s, sIndex) => {
        const sentDiv = document.createElement('div');
        sentDiv.className = 'punct-sentence';
        s.parts.forEach((part, pIndex) => {
            if (part === "") {
                const slot = document.createElement('span');
                slot.className = 'punct-slot';
                slot.dataset.sIndex = sIndex;
                slot.dataset.slotIndex = pIndex;
                slot.onclick = () => {
                    if (activeToken) {
                        slot.textContent = activeToken;
                        triggerHaptic(20);
                    }
                };
                sentDiv.appendChild(slot);
            } else {
                sentDiv.appendChild(document.createTextNode(part));
            }
        });
        container.appendChild(sentDiv);
    });
}

function checkPunctuation(puzzle) {
    let correct = true;
    puzzle.sentences.forEach((s, sIndex) => {
        let slotCount = 0;
        s.parts.forEach((part, pIndex) => {
            if (part === "") {
                const slot = document.querySelector(`.punct-slot[data-s-index="${sIndex}"][data-slot-index="${pIndex}"]`);
                if (slot.textContent !== s.correct_slots[slotCount]) correct = false;
                slotCount++;
            }
        });
    });
    return correct;
}

// --- PUZZLE 4: TIMELINE ---
function setupTimeline(container, puzzle) {
    const list = document.createElement('div');
    list.className = 'timeline-container';
    puzzle.cards.sort(() => Math.random() - 0.5).forEach(card => {
        const div = document.createElement('div');
        div.className = 'timeline-card';
        div.draggable = true;
        div.textContent = card.text;
        div.dataset.id = card.id;
        div.addEventListener('dragstart', function(e) {
            draggedItem = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            triggerHaptic(10);
        });
        div.addEventListener('dragover', function(e) {
            e.preventDefault();
            const afterElement = getDragAfterElement(list, e.clientY);
            if (afterElement == null) {
                list.appendChild(draggedItem);
            } else {
                list.insertBefore(draggedItem, afterElement);
            }
        });
        div.addEventListener('dragend', function() { 
            this.classList.remove('dragging');
            draggedItem = null;
            triggerHaptic(20);
        });
        list.appendChild(div);
    });
    container.appendChild(list);
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.timeline-card:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function checkTimeline(puzzle) {
    const cards = Array.from(document.querySelectorAll('.timeline-card'));
    const currentOrder = cards.map(c => c.dataset.id);
    return puzzle.correct_order.every((id, idx) => id === currentOrder[idx]);
}

// --- PUZZLE 5: CIPHER ---
let assembledSequence = [];
function setupCipher(container, puzzle) {
    assembledSequence = [];
    const wrap = document.createElement('div');
    wrap.className = 'cipher-container';
    const assemblyArea = document.createElement('div');
    assemblyArea.className = 'cipher-assembly-area';
    assemblyArea.id = 'assembly-area';
    assemblyArea.innerHTML = '<span style="opacity: 0.3;">Կտորները կհայտնվեն այստեղ...</span>';
    const fragmentsDiv = document.createElement('div');
    fragmentsDiv.className = 'cipher-fragments';
    const shuffled = [...puzzle.fragments].sort(() => Math.random() - 0.5);
    shuffled.forEach(frag => {
        const fragEl = document.createElement('div');
        fragEl.className = 'parchment-fragment';
        fragEl.textContent = frag.text;
        fragEl.dataset.id = frag.id;
        const rot = (Math.random() * 6 - 3).toFixed(1) + 'deg';
        fragEl.style.setProperty('--rot', rot);
        fragEl.onclick = () => {
            if (fragEl.classList.contains('assembled')) return;
            triggerHaptic(20);
            fragEl.classList.add('assembled');
            if (assembledSequence.length === 0) assemblyArea.innerHTML = '';
            assembledSequence.push(frag.id);
            const piece = document.createElement('span');
            piece.className = 'assembled-piece';
            piece.textContent = frag.text;
            assemblyArea.appendChild(piece);
        };
        fragmentsDiv.appendChild(fragEl);
    });
    const resetBtn = document.createElement('button');
    resetBtn.className = 'icon-btn';
    resetBtn.style.marginTop = '20px';
    resetBtn.textContent = '🔄 Սկսել նորից';
    resetBtn.onclick = () => { triggerHaptic(40); setupCipher(container, puzzle); };
    wrap.appendChild(assemblyArea);
    wrap.appendChild(fragmentsDiv);
    wrap.appendChild(resetBtn);
    container.appendChild(wrap);
}

function checkCipher(puzzle) {
    if (assembledSequence.length !== puzzle.correct_sequence.length) return false;
    return puzzle.correct_sequence.every((id, idx) => id === assembledSequence[idx]);
}

// --- PUZZLE 6: RAPID CONFLICT ---
let rapidState = 0;
function setupRapidConflict(container, puzzle, checkBtn) {
    checkBtn.style.display = 'none'; 
    rapidState = 0;
    const scenarioDiv = document.createElement('div');
    scenarioDiv.className = 'conflict-scenario';
    scenarioDiv.id = 'rapid-scenario';
    const btnsDiv = document.createElement('div');
    btnsDiv.className = 'conflict-buttons';
    puzzle.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = cat.label;
        btn.onclick = () => handleRapidChoice(cat.id, puzzle);
        btnsDiv.appendChild(btn);
    });
    container.appendChild(scenarioDiv);
    container.appendChild(btnsDiv);
    updateRapidUI(puzzle);
}

function updateRapidUI(puzzle) {
    const sc = document.getElementById('rapid-scenario');
    if (sc && rapidState < puzzle.scenarios.length) {
        sc.textContent = puzzle.scenarios[rapidState].text;
    }
}

function handleRapidChoice(catId, puzzle) {
    const current = puzzle.scenarios[rapidState];
    if (catId === current.correct) {
        triggerHaptic(30);
        rapidState++;
        if (rapidState >= puzzle.scenarios.length) handlePuzzleResult(true, puzzle);
        else updateRapidUI(puzzle);
    } else {
        triggerHaptic(100);
        handlePuzzleResult(false, puzzle);
    }
}

document.getElementById('check-puzzle-btn').onclick = function() {
    this.disabled = true;
    const puzzle = puzzlesData[currentPuzzleId];
    let isCorrect = false;
    if (currentPuzzleType === 'rashomon') isCorrect = checkRashomon(puzzle);
    else if (currentPuzzleType === 'eraser') isCorrect = checkEraser(puzzle);
    else if (currentPuzzleType === 'punctuation') isCorrect = checkPunctuation(puzzle);
    else if (currentPuzzleType === 'timeline') isCorrect = checkTimeline(puzzle);
    else if (currentPuzzleType === 'cipher') isCorrect = checkCipher(puzzle);
    handlePuzzleResult(isCorrect, puzzle);
    if (!isCorrect) setTimeout(() => { this.disabled = false; }, 1000);
};

function handlePuzzleResult(isCorrect, puzzle) {
    const feedbackDiv = document.getElementById('puzzle-feedback');
    feedbackDiv.className = `puzzle-feedback ${isCorrect ? 'success' : 'error'}`;
    feedbackDiv.textContent = isCorrect ? puzzle.success_message : puzzle.failure_message;
    triggerHaptic(isCorrect ? 60 : 150);
    if (isCorrect) {
        if (puzzle.principle && !playerInventory.includes(puzzle.principle)) {
            playerInventory.push(puzzle.principle);
            updateNotebook();
        }
        document.getElementById('check-puzzle-btn').style.display = 'none';
        setTimeout(() => {
            document.getElementById('puzzle-modal').classList.add('hidden');
            renderNode(window.currentSuccessNode);
        }, 2500);
    }
}

document.addEventListener('DOMContentLoaded', initGame);
