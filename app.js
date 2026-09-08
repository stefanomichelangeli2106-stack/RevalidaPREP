window.initRevalidaApp = function (initialProgress, onSaveProgress) {
  const SOURCES = {
    oficial: (window.REVALIDA_QUESTIONS || []).slice(),
    banco: (window.BANCO_QUESTIONS || []).slice(),
  };
  let ALL_QUESTIONS = SOURCES.oficial;

  let progress = initialProgress || {};
  function saveProgress(p) {
    if (typeof onSaveProgress === "function") onSaveProgress(p);
  }

  const state = {
    source: "oficial",
    mode: "random",
    queue: [],
    pointer: -1,
    current: null,
    answered: false,
    selectedLetter: null,
    sessionRight: 0,
    sessionWrong: 0,
    answeredThisSession: 0,
  };

  // Guarda o resultado (certa/errada) já contabilizado nesta sessão para cada questão,
  // para que responder a mesma questão de novo (ex.: após usar "Questão anterior")
  // ajuste o placar em vez de contar como uma resposta nova.
  let sessionCounted = new Map();

  const yearListEl = document.getElementById("year-list");
  const specListEl = document.getElementById("spec-list");
  const statusListEl = document.getElementById("status-list");
  const yearBadgeEl = document.getElementById("year-badge");
  const specBadgeEl = document.getElementById("spec-badge");
  const poolInfoEl = document.getElementById("pool-info");
  const globalStatsEl = document.getElementById("global-stats");
  const scoreBoxEl = document.getElementById("score-box");
  const cardEl = document.getElementById("question-card");
  const emptyEl = document.getElementById("empty-state");
  const emptyTextEl = document.getElementById("empty-text");

  function uniqueSorted(arr) {
    return Array.from(new Set(arr)).sort();
  }

  let editionLabels = {};
  let editions = [];
  let specialtyCounts = {};
  let specialties = [];
  const activeYears = new Set();
  const activeSpecs = new Set();
  const activeStatus = new Set(["nueva", "acertada", "fallada"]);

  function rebuildDerivedData() {
    editionLabels = {};
    ALL_QUESTIONS.forEach(q => { editionLabels[q.edition_label] = (editionLabels[q.edition_label] || 0) + 1; });
    editions = Object.keys(editionLabels).sort((a, b) => {
      const qa = ALL_QUESTIONS.find(q => q.edition_label === a);
      const qb = ALL_QUESTIONS.find(q => q.edition_label === b);
      return ((qa.year || 0) - (qb.year || 0)) || a.localeCompare(b);
    });

    specialtyCounts = {};
    ALL_QUESTIONS.forEach(q => { specialtyCounts[q.specialty] = (specialtyCounts[q.specialty] || 0) + 1; });
    specialties = uniqueSorted(Object.keys(specialtyCounts));

    activeYears.clear();
    activeSpecs.clear();
  }

  function updateFilterBadges() {
    yearBadgeEl.textContent = activeYears.size;
    yearBadgeEl.classList.toggle("on", activeYears.size > 0);
    specBadgeEl.textContent = activeSpecs.size;
    specBadgeEl.classList.toggle("on", activeSpecs.size > 0);
  }

  // Quantas questões cada especialidade tem dentro das edições marcadas.
  function computeSpecialtyCounts() {
    const counts = {};
    specialties.forEach(s => { counts[s] = 0; });
    ALL_QUESTIONS.forEach(q => {
      if (activeYears.has(q.edition_label)) counts[q.specialty]++;
    });
    return counts;
  }

  function updateSpecialtyCounts() {
    const counts = computeSpecialtyCounts();
    specListEl.querySelectorAll(".check-item").forEach(row => {
      const countEl = row.querySelector(".count");
      if (!countEl) return;
      const n = counts[row.dataset.item] || 0;
      countEl.textContent = n;
      row.classList.toggle("muted", n === 0);
    });
  }

  function buildCheckList(container, items, activeSet, countsMap, onChange) {
    container.innerHTML = "";
    items.forEach(item => {
      const row = document.createElement("label");
      row.className = "check-item";
      row.dataset.item = item;
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
    const relevantIds = new Set(ALL_QUESTIONS.map(q => q.id));
    const answeredIds = Object.keys(progress).filter(id => relevantIds.has(id));
    const answered = answeredIds.length;
    if (answered === 0) {
      globalStatsEl.textContent = "Sem respostas ainda";
      return;
    }
    const correct = answeredIds.filter(id => progress[id].correct).length;
    const pct = Math.round((correct / answered) * 100);
    globalStatsEl.textContent = answered + " respondidas · " + pct + "% de acerto";
  }

  function refreshPool() {
    updateFilterBadges();
    updateSpecialtyCounts();
    const filtered = ALL_QUESTIONS.filter(q =>
      activeYears.has(q.edition_label) &&
      activeSpecs.has(q.specialty) &&
      activeStatus.has(statusOf(q))
    );
    state.queue = state.mode === "random" ? shuffle(filtered.slice()) : filtered.slice();
    state.pointer = -1;
    poolInfoEl.textContent = filtered.length + (filtered.length === 1 ? " questão" : " questões");
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
    const total = state.sessionRight + state.sessionWrong;
    const rightPct = total > 0 ? Math.round((state.sessionRight / total) * 100) : 0;
    const wrongPct = total > 0 ? Math.round((state.sessionWrong / total) * 100) : 0;
    scoreBoxEl.innerHTML = '<span class="ok">' + state.sessionRight + ' certas (' + rightPct + '%)</span><span class="bad">' + state.sessionWrong + ' erradas (' + wrongPct + '%)</span>';
  }

  function showAtPointer() {
    emptyEl.style.display = "none";
    cardEl.style.display = "block";
    state.current = state.queue[state.pointer];
    state.answered = false;
    state.selectedLetter = null;
    renderQuestion();
    updatePrevButton();
  }

  function updatePrevButton() {
    const prevBtn = document.getElementById("prev-btn");
    if (prevBtn) prevBtn.disabled = state.pointer <= 0;
  }

  function nextQuestion() {
    state.pointer++;
    if (state.pointer >= state.queue.length) {
      state.pointer = state.queue.length - 1;
      cardEl.style.display = "none";
      emptyEl.style.display = "flex";
      if (state.queue.length > 0) {
        emptyTextEl.textContent = "Você terminou todas as questões deste filtro. Toque em \"Embaralhar\" para repetir a rodada.";
      } else if (activeYears.size === 0 || activeSpecs.size === 0) {
        emptyTextEl.textContent = "Selecione pelo menos um ano e uma especialidade na barra lateral para começar a praticar.";
      } else {
        emptyTextEl.textContent = "Não há questões para os filtros selecionados. Tente ativar mais anos, mais especialidades ou outro status em \"Mostrar\".";
      }
      return;
    }
    showAtPointer();
  }

  function prevQuestion() {
    if (state.pointer <= 0) return;
    state.pointer--;
    showAtPointer();
  }

  function renderQuestion() {
    const q = state.current;
    document.getElementById("q-edition").textContent = q.edition_label;
    document.getElementById("q-area").textContent = q.area;
    document.getElementById("q-specialty").textContent = q.specialty;
    document.getElementById("q-number").textContent = "Questão " + q.number;
    document.getElementById("q-stem").textContent = q.stem;

    const imagesEl = document.getElementById("q-images");
    if (q.images && q.images.length) {
      imagesEl.innerHTML = q.images.map(src =>
        '<img src="' + escapeHtml(src) + '" alt="Imagem da questão ' + q.number + '" loading="lazy">'
      ).join("");
      imagesEl.style.display = "flex";
    } else {
      imagesEl.innerHTML = "";
      imagesEl.style.display = "none";
    }

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
    const hasOfficialAnswer = !!q.correct && q.correct !== "ANULADA";
    const isAnnulled = q.annulled === true || q.correct === "ANULADA";
    const isCorrect = hasOfficialAnswer && !isAnnulled && state.selectedLetter === q.correct;

    if (!isAnnulled) {
      const prevResult = sessionCounted.get(q.id);
      if (prevResult === "correct") state.sessionRight--;
      else if (prevResult === "wrong") state.sessionWrong--;
      if (isCorrect) { state.sessionRight++; sessionCounted.set(q.id, "correct"); }
      else { state.sessionWrong++; sessionCounted.set(q.id, "wrong"); }
      progress[q.id] = { correct: isCorrect, letter: state.selectedLetter, ts: Date.now() };
      saveProgress(progress);
      updateScoreBox();
      updateGlobalStats();
      buildStatusFilter();
    }

    state.answeredThisSession++;
    if (state.answeredThisSession % 20 === 0) {
      showDonationModal();
    }

    document.querySelectorAll("#q-options .option").forEach(el => {
      el.classList.add("answered");
      const letter = el.dataset.letter;
      if (hasOfficialAnswer && letter === q.correct) el.classList.add("correct");
      if (hasOfficialAnswer && letter === state.selectedLetter && letter !== q.correct) el.classList.add("incorrect");
      if (hasOfficialAnswer && letter === q.correct) {
        el.insertAdjacentHTML("beforeend", '<span class="badge">Correta</span>');
      } else if (hasOfficialAnswer && letter === state.selectedLetter && letter !== q.correct) {
        el.insertAdjacentHTML("beforeend", '<span class="badge">Sua resposta</span>');
      }
    });

    const explainEl = document.getElementById("q-explain");
    explainEl.style.display = "flex";
    let html = "";
    if (hasOfficialAnswer) {
      if (isAnnulled) {
        html += '<div class="annulled-note">Esta questão foi anulada oficialmente pelo INEP. A alternativa e a justificativa abaixo indicam a resposta tecnicamente mais correta, mas não contam para sua pontuação.</div>';
      }
      html += '<div class="block correct-block"><b>Por que ' + q.correct + ' está correta:</b><br>' + escapeHtml(q.explanation_correct) + "</div>";
      Object.keys(q.explanation_incorrect || {}).sort().forEach(letter => {
        html += '<div class="block incorrect-block"><b>Por que ' + letter + ' está incorreta:</b><br>' + escapeHtml(q.explanation_incorrect[letter]) + "</div>";
      });
    } else {
      html = '<div class="annulled-note">' + escapeHtml(q.explanation_correct || "O INEP anulou esta questão; não há resposta oficial correta.") + "</div>";
    }
    explainEl.innerHTML = html;

    document.getElementById("submit-btn").textContent = "Próxima questão";
    document.getElementById("submit-btn").disabled = false;
  }

  function showDonationModal() {
    document.getElementById("donation-modal").style.display = "flex";
  }
  function hideDonationModal() {
    document.getElementById("donation-modal").style.display = "none";
  }
  document.getElementById("donation-close-btn").addEventListener("click", hideDonationModal);
  document.getElementById("donation-dismiss-btn").addEventListener("click", hideDonationModal);
  document.getElementById("donation-modal").addEventListener("click", (ev) => {
    if (ev.target.id === "donation-modal") hideDonationModal();
  });
  function copyPixKey(btn, keyElId, label) {
    const key = document.getElementById(keyElId).textContent;
    const restoreLabel = () => { btn.textContent = label; };
    navigator.clipboard.writeText(key).then(() => {
      btn.textContent = "Copiado!";
      setTimeout(restoreLabel, 2000);
    }).catch(() => {
      btn.textContent = "Copiado!";
      setTimeout(restoreLabel, 2000);
    });
  }
  document.getElementById("donation-copy-btn").addEventListener("click", (ev) => {
    copyPixKey(ev.currentTarget, "donation-pix-key", "Copiar chave");
  });
  document.getElementById("sidebar-pix-copy-btn").addEventListener("click", (ev) => {
    copyPixKey(ev.currentTarget, "sidebar-pix-key", "Copiar");
  });
  document.getElementById("empty-pix-copy-btn").addEventListener("click", (ev) => {
    copyPixKey(ev.currentTarget, "empty-pix-key", "Copiar chave");
  });

  function showFeedbackModal() {
    document.getElementById("feedback-modal").style.display = "flex";
  }
  function hideFeedbackModal() {
    document.getElementById("feedback-modal").style.display = "none";
  }
  document.getElementById("feedback-open-btn").addEventListener("click", showFeedbackModal);
  document.getElementById("feedback-close-btn").addEventListener("click", hideFeedbackModal);
  document.getElementById("feedback-modal").addEventListener("click", (ev) => {
    if (ev.target.id === "feedback-modal") hideFeedbackModal();
  });
  document.getElementById("feedback-send-btn").addEventListener("click", () => {
    const messageEl = document.getElementById("feedback-message");
    const message = messageEl.value.trim();
    if (!message) {
      messageEl.focus();
      return;
    }
    const email = document.getElementById("feedback-email").value.trim();
    const bodyLines = [];
    if (email) bodyLines.push("E-mail para contato: " + email, "");
    bodyLines.push(message);
    const subject = encodeURIComponent("RevalidaPrep - Sugestão/Problema");
    const body = encodeURIComponent(bodyLines.join("\n"));
    window.location.href = "mailto:revalidaprep@gmail.com?subject=" + subject + "&body=" + body;
  });

  document.getElementById("submit-btn").addEventListener("click", submitAnswer);
  document.getElementById("skip-btn").addEventListener("click", nextQuestion);
  document.getElementById("prev-btn").addEventListener("click", prevQuestion);
  document.getElementById("shuffle-btn").addEventListener("click", refreshPool);

  document.getElementById("reset-progress-btn").addEventListener("click", () => {
    if (!confirm("Isso vai apagar todo o seu progresso salvo (acertos/erros de todas as edições). Deseja continuar?")) return;
    progress = {};
    saveProgress(progress);
    state.sessionRight = 0;
    state.sessionWrong = 0;
    sessionCounted.clear();
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
  document.getElementById("specs-all").addEventListener("click", () => { specialties.forEach(s => activeSpecs.add(s)); buildCheckList(specListEl, specialties, activeSpecs, computeSpecialtyCounts(), refreshPool); refreshPool(); });
  document.getElementById("specs-none").addEventListener("click", () => { activeSpecs.clear(); buildCheckList(specListEl, specialties, activeSpecs, computeSpecialtyCounts(), refreshPool); refreshPool(); });

  function renderFilters() {
    buildCheckList(yearListEl, editions, activeYears, editionLabels, refreshPool);
    buildCheckList(specListEl, specialties, activeSpecs, computeSpecialtyCounts(), refreshPool);
    buildStatusFilter();
    updateFilterBadges();
    updateSpecialtyCounts();
  }

  function switchSource(source) {
    if (state.source === source) return;
    state.source = source;
    ALL_QUESTIONS = SOURCES[source];
    document.getElementById("source-oficial").classList.toggle("active", source === "oficial");
    document.getElementById("source-banco").classList.toggle("active", source === "banco");
    state.sessionRight = 0;
    state.sessionWrong = 0;
    sessionCounted.clear();
    updateScoreBox();
    rebuildDerivedData();
    renderFilters();
    updateGlobalStats();
    if (ALL_QUESTIONS.length === 0) {
      poolInfoEl.textContent = "Sem questões carregadas";
      cardEl.style.display = "none";
      emptyEl.style.display = "flex";
      emptyTextEl.textContent = "Este banco de questões ainda não tem conteúdo publicado. Volte em breve.";
    } else {
      refreshPool();
    }
  }
  document.getElementById("source-oficial").addEventListener("click", () => switchSource("oficial"));
  document.getElementById("source-banco").addEventListener("click", () => switchSource("banco"));

  rebuildDerivedData();
  renderFilters();
  updateScoreBox();
  updateGlobalStats();

  if (ALL_QUESTIONS.length === 0) {
    poolInfoEl.textContent = "Sem questões carregadas";
  } else {
    refreshPool();
  }
};
