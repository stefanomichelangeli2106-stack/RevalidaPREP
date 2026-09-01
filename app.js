window.initRevalidaApp = function (initialProgress, onSaveProgress) {
  const ALL_QUESTIONS = (window.REVALIDA_QUESTIONS || []).slice();

  let progress = initialProgress || {};
  function saveProgress(p) {
    if (typeof onSaveProgress === "function") onSaveProgress(p);
  }

  const state = {
    mode: "random",
    queue: [],
    pointer: -1,
    current: null,
    answered: false,
    selectedLetter: null,
    sessionRight: 0,
    sessionWrong: 0,
  };

  const yearListEl = document.getElementById("year-list");
  const specListEl = document.getElementById("spec-list");
  const statusListEl = document.getElementById("status-list");
  const poolInfoEl = document.getElementById("pool-info");
  const globalStatsEl = document.getElementById("global-stats");
  const scoreBoxEl = document.getElementById("score-box");
  const cardEl = document.getElementById("question-card");
  const emptyEl = document.getElementById("empty-state");

  function uniqueSorted(arr) {
    return Array.from(new Set(arr)).sort();
  }

  const editionLabels = {};
  ALL_QUESTIONS.forEach(q => { editionLabels[q.edition_label] = (editionLabels[q.edition_label] || 0) + 1; });
  const editions = Object.keys(editionLabels).sort((a, b) => {
    const qa = ALL_QUESTIONS.find(q => q.edition_label === a);
    const qb = ALL_QUESTIONS.find(q => q.edition_label === b);
    return (qa.year - qb.year) || a.localeCompare(b);
  });

  const specialtyCounts = {};
  ALL_QUESTIONS.forEach(q => { specialtyCounts[q.specialty] = (specialtyCounts[q.specialty] || 0) + 1; });
  const specialties = uniqueSorted(Object.keys(specialtyCounts));

  const activeYears = new Set(editions);
  const activeSpecs = new Set(specialties);
  const activeStatus = new Set(["nueva", "acertada", "fallada"]);

  function buildCheckList(container, items, activeSet, countsMap, onChange) {
    container.innerHTML = "";
    items.forEach(item => {
      const row = document.createElement("label");
      row.className = "check-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = activeSet.has(item);
      cb.addEventListener("change", () => {
        if (cb.checked) activeSet.add(item); else activeSet.delete(item);
        onChange();
      });
      const span = document.createElement("span");
      span.textContent = item;
      row.appendChild(cb);
      row.appendChild(span);
      if (countsMap) {
        const count = document.createElement("span");
        count.className = "count";
        count.textContent = countsMap[item] || 0;
        row.appendChild(count);
      }
      container.appendChild(row);
    });
  }

  function statusOf(q) {
    const rec = progress[q.id];
    if (!rec) return "nueva";
    return rec.correct ? "acertada" : "fallada";
  }

  function computeStatusCounts() {
    const counts = { nueva: 0, acertada: 0, fallada: 0 };
    ALL_QUESTIONS.forEach(q => { counts[statusOf(q)]++; });
    return counts;
  }

  function updateGlobalStats() {
    const answered = Object.keys(progress).length;
    if (answered === 0) {
      globalStatsEl.textContent = "Ainda sem respostas registradas";
      return;
    }
    const correct = Object.values(progress).filter(r => r.correct).length;
    const pct = Math.round((correct / answered) * 100);
    globalStatsEl.textContent = "Progresso total: " + answered + " respondidas · " + pct + "% de acerto";
  }

  function refreshPool() {
    const filtered = ALL_QUESTIONS.filter(q =>
      activeYears.has(q.edition_label) &&
      activeSpecs.has(q.specialty) &&
      activeStatus.has(statusOf(q))
    );
    state.queue = state.mode === "random" ? shuffle(filtered.slice()) : filtered.slice();
    state.pointer = -1;
    poolInfoEl.textContent = filtered.length + (filtered.length === 1 ? " questão" : " questões") + " no filtro atual";
    nextQuestion();
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildStatusFilter() {
    const counts = computeStatusCounts();
    const items = [
      ["nueva", "Novas"],
      ["acertada", "Acertadas"],
      ["fallada", "Erradas"],
    ];
    statusListEl.innerHTML = "";
    items.forEach(([key, label]) => {
      const row = document.createElement("label");
      row.className = "check-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = activeStatus.has(key);
      cb.addEventListener("change", () => {
        if (cb.checked) activeStatus.add(key); else activeStatus.delete(key);
        refreshPool();
      });
      const span = document.createElement("span");
      span.textContent = label;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = counts[key] || 0;
      row.appendChild(cb);
      row.appendChild(span);
      row.appendChild(count);
      statusListEl.appendChild(row);
    });
  }

  function updateScoreBox() {
    scoreBoxEl.innerHTML = 'Acertos: <span class="ok">' + state.sessionRight + '</span> &nbsp;|&nbsp; Erros: <span class="bad">' + state.sessionWrong + '</span>';
  }

  function nextQuestion() {
    state.pointer++;
    if (state.pointer >= state.queue.length) {
      cardEl.style.display = "none";
      emptyEl.style.display = state.queue.length === 0 ? "block" : "block";
      if (state.queue.length > 0) {
        emptyEl.textContent = "Você terminou todas as questões deste filtro. Toque em \"Embaralhar de novo\" para repetir a rodada.";
      } else {
        emptyEl.textContent = "Não há questões para os filtros selecionados. Tente ativar mais anos ou especialidades.";
      }
      return;
    }
    emptyEl.style.display = "none";
    cardEl.style.display = "block";
    state.current = state.queue[state.pointer];
    state.answered = false;
    state.selectedLetter = null;
    renderQuestion();
  }

  function renderQuestion() {
    const q = state.current;
    document.getElementById("q-edition").textContent = q.edition_label;
    document.getElementById("q-area").textContent = q.area;
    document.getElementById("q-specialty").textContent = q.specialty;
    document.getElementById("q-number").textContent = "Questão " + q.number;
    document.getElementById("q-stem").textContent = q.stem;

    const optionsEl = document.getElementById("q-options");
    optionsEl.innerHTML = "";
    const letters = Object.keys(q.options).sort();
    letters.forEach(letter => {
      const opt = document.createElement("div");
      opt.className = "option";
      opt.dataset.letter = letter;
      opt.innerHTML = '<span class="letter">' + letter + '</span><span>' + escapeHtml(q.options[letter]) + "</span>";
      opt.addEventListener("click", () => selectOption(letter));
      optionsEl.appendChild(opt);
    });

    document.getElementById("q-explain").style.display = "none";
    document.getElementById("q-explain").innerHTML = "";
    document.getElementById("submit-btn").disabled = true;
    document.getElementById("submit-btn").textContent = "Responder";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function selectOption(letter) {
    if (state.answered) return;
    state.selectedLetter = letter;
    document.querySelectorAll("#q-options .option").forEach(el => {
      el.classList.toggle("selected", el.dataset.letter === letter);
    });
    document.getElementById("submit-btn").disabled = false;
  }

  function submitAnswer() {
    if (state.answered) { nextQuestion(); return; }
    if (!state.selectedLetter) return;
    state.answered = true;
    const q = state.current;
    const isAnnulled = q.correct === "ANULADA";
    const isCorrect = !isAnnulled && state.selectedLetter === q.correct;

    if (!isAnnulled) {
      if (isCorrect) { state.sessionRight++; } else { state.sessionWrong++; }
      progress[q.id] = { correct: isCorrect, letter: state.selectedLetter, ts: Date.now() };
      saveProgress(progress);
      updateScoreBox();
      updateGlobalStats();
      buildStatusFilter();
    }

    document.querySelectorAll("#q-options .option").forEach(el => {
      el.classList.add("answered");
      const letter = el.dataset.letter;
      if (!isAnnulled && letter === q.correct) el.classList.add("correct");
      if (!isAnnulled && letter === state.selectedLetter && letter !== q.correct) el.classList.add("incorrect");
      if (letter === q.correct && !isAnnulled) {
        el.insertAdjacentHTML("beforeend", '<span class="badge">Correta</span>');
      } else if (letter === state.selectedLetter && letter !== q.correct && !isAnnulled) {
        el.insertAdjacentHTML("beforeend", '<span class="badge">Sua resposta</span>');
      }
    });

    const explainEl = document.getElementById("q-explain");
    explainEl.style.display = "flex";
    if (isAnnulled) {
      explainEl.innerHTML = '<div class="annulled-note">' + escapeHtml(q.explanation_correct || "O INEP anulou esta questão; não há resposta oficial correta.") + "</div>";
    } else {
      let html = '<div class="block correct-block"><b>Por que ' + q.correct + ' está correta:</b><br>' + escapeHtml(q.explanation_correct) + "</div>";
      Object.keys(q.explanation_incorrect || {}).sort().forEach(letter => {
        html += '<div class="block incorrect-block"><b>Por que ' + letter + ' está incorreta:</b><br>' + escapeHtml(q.explanation_incorrect[letter]) + "</div>";
      });
      explainEl.innerHTML = html;
    }

    document.getElementById("submit-btn").textContent = "Próxima questão";
    document.getElementById("submit-btn").disabled = false;
  }

  document.getElementById("submit-btn").addEventListener("click", submitAnswer);
  document.getElementById("skip-btn").addEventListener("click", nextQuestion);
  document.getElementById("shuffle-btn").addEventListener("click", refreshPool);

  document.getElementById("reset-progress-btn").addEventListener("click", () => {
    if (!confirm("Isso vai apagar todo o seu progresso salvo (acertos/erros de todas as edições). Deseja continuar?")) return;
    progress = {};
    saveProgress(progress);
    state.sessionRight = 0;
    state.sessionWrong = 0;
    updateScoreBox();
    updateGlobalStats();
    buildStatusFilter();
    refreshPool();
  });

  document.addEventListener("keydown", (ev) => {
    if (!cardEl || cardEl.style.display === "none" || !state.current) return;
    const tag = (ev.target && ev.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (ev.key === "Enter") {
      const btn = document.getElementById("submit-btn");
      if (!btn.disabled) { ev.preventDefault(); submitAnswer(); }
      return;
    }
    if (!state.answered) {
      const letters = Object.keys(state.current.options).sort();
      const idx = "12345".indexOf(ev.key);
      let letter = null;
      if (idx >= 0 && idx < letters.length) letter = letters[idx];
      else if (/^[a-eA-E]$/.test(ev.key) && letters.includes(ev.key.toUpperCase())) letter = ev.key.toUpperCase();
      if (letter) { ev.preventDefault(); selectOption(letter); }
    }
  });

  document.getElementById("mode-random").addEventListener("click", () => {
    state.mode = "random";
    document.getElementById("mode-random").classList.add("active");
    document.getElementById("mode-sequential").classList.remove("active");
    refreshPool();
  });
  document.getElementById("mode-sequential").addEventListener("click", () => {
    state.mode = "sequential";
    document.getElementById("mode-sequential").classList.add("active");
    document.getElementById("mode-random").classList.remove("active");
    refreshPool();
  });

  document.getElementById("years-all").addEventListener("click", () => { editions.forEach(e => activeYears.add(e)); buildCheckList(yearListEl, editions, activeYears, editionLabels, refreshPool); refreshPool(); });
  document.getElementById("years-none").addEventListener("click", () => { activeYears.clear(); buildCheckList(yearListEl, editions, activeYears, editionLabels, refreshPool); refreshPool(); });
  document.getElementById("specs-all").addEventListener("click", () => { specialties.forEach(s => activeSpecs.add(s)); buildCheckList(specListEl, specialties, activeSpecs, specialtyCounts, refreshPool); refreshPool(); });
  document.getElementById("specs-none").addEventListener("click", () => { activeSpecs.clear(); buildCheckList(specListEl, specialties, activeSpecs, specialtyCounts, refreshPool); refreshPool(); });

  buildCheckList(yearListEl, editions, activeYears, editionLabels, refreshPool);
  buildCheckList(specListEl, specialties, activeSpecs, specialtyCounts, refreshPool);
  buildStatusFilter();
  updateScoreBox();
  updateGlobalStats();

  if (ALL_QUESTIONS.length === 0) {
    poolInfoEl.textContent = "Ainda não há questões carregadas (falta gerar data/data.js).";
  } else {
    refreshPool();
  }
};
