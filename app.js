(() => {
  const STORAGE_KEY = "voxora-sales-demo-v1";
  const starterKnowledge = [
    { id: "kb-1", title: "Voxora platform overview", content: "Voxora is an AI sales conversation assistant that helps teams respond to inbound enquiries, qualify prospects, retrieve approved product information, and schedule follow-up meetings. The workspace includes call summaries, lead insights, and a CRM-ready lead record." },
    { id: "kb-2", title: "Plans and pricing", content: "The Growth plan starts at $149 per month for a small sales team and includes 1,000 conversation minutes, lead qualification, appointment scheduling, and standard CRM integrations. A 14-day trial is available. Enterprise pricing depends on usage, security needs, and support requirements." },
    { id: "kb-3", title: "Integrations and security", content: "Voxora can connect to common CRM and calendar tools through secure APIs. Production deployments should use encrypted transport and storage, role-based access, tenant isolation, consent controls, and configurable data retention. The browser demo does not connect to external systems." },
    { id: "kb-4", title: "Onboarding and support", content: "A typical onboarding includes importing approved product FAQs, configuring qualification questions, testing the call flow, and connecting a CRM. The Growth plan includes email support. Enterprise customers can discuss a dedicated onboarding plan and service-level requirements." }
  ];
  const initialState = () => ({
    leads: [],
    calls: [],
    bookings: [],
    knowledge: starterKnowledge.map(item => ({ ...item }))
  });
  let state;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    state = saved ? { ...initialState(), ...JSON.parse(saved) } : initialState();
    if (!Array.isArray(state.leads) || !Array.isArray(state.calls) || !Array.isArray(state.bookings) || !Array.isArray(state.knowledge)) {
      throw new Error("Saved demo data has an invalid shape.");
    }
  } catch (error) {
    console.error("Could not load Voxora demo data.", error);
    state = initialState();
    window.setTimeout(() => showToast("Saved demo data could not be read. A fresh workspace is open.", true), 0);
  }

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  let activeLeadId = null;
  let activeCallStarted = 0;
  let transcript = [];
  let audioStream = null;
  let audioContext = null;
  let audioSource = null;
  let audioProcessor = null;
  let audioChunks = [];
  let audioSampleCount = 0;
  let audioRecording = false;
  let recordingTimer = null;
  let audioStarting = false;
  let transcribingAudio = false;
  let toastTimer;

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Could not save Voxora demo data.", error);
      showToast("Could not save data in this browser. Check local storage permissions.", true);
    }
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function showToast(message, isError = false) {
    const region = $("#toast-region");
    if (!region) return;
    region.innerHTML = `<div class="toast${isError ? " error" : ""}">${escapeHtml(message)}</div>`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { region.innerHTML = ""; }, 3200);
  }

  function initials(name = "New prospect") {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "NP";
  }

  function formatDate(value, options = { month: "short", day: "numeric" }) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, options);
  }

  function getActiveLead() {
    return state.leads.find(lead => lead.id === activeLeadId) || null;
  }

  function navigate(page) {
    $$(".page").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
    $$(".nav-link[data-page-link]").forEach(link => link.classList.toggle("active", link.dataset.pageLink === page));
    const activeLink = $(`.nav-link[data-page-link="${page}"]`);
    $("#page-crumb").textContent = activeLink ? activeLink.textContent.trim() : "Overview";
    $(".sidebar").classList.remove("open");
    renderAll();
  }

  function startCall() {
    const lead = {
      id: `lead-${Date.now()}`,
      name: "Alex Morgan",
      company: "Brightside Studio",
      email: "",
      status: "New",
      interest: "",
      budget: "",
      timeline: "",
      sentiment: "Neutral",
      source: "Website enquiry",
      updatedAt: new Date().toISOString()
    };
    state.leads.unshift(lead);
    activeLeadId = lead.id;
    activeCallStarted = Date.now();
    transcript = [{ role: "agent", text: "Hi Alex, thanks for reaching out to Voxora. I’m your AI sales assistant. What are you hoping to improve about your sales conversations?" }];
    persist();
    navigate("calls");
    renderConversation();
    showToast("Demo conversation started. Try asking about pricing, integrations or a product demo.");
  }

  function renderConversation() {
    const lead = getActiveLead();
    if (!lead) {
      $("#transcript").innerHTML = '<div class="empty-message">Start a new conversation to begin your end-to-end sales workflow.</div>';
      $("#call-name").textContent = "No active conversation";
      $("#call-avatar").textContent = "—";
      $("#voice-status").textContent = "Your conversation transcript will appear here.";
      renderLeadQualification();
      return;
    }
    $("#call-name").textContent = lead.name;
    $("#call-avatar").textContent = initials(lead.name);
    $("#transcript").innerHTML = transcript.map(message => {
      const user = message.role === "prospect";
      const label = user ? initials(lead.name) : "VX";
      const time = message.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `<div class="chat-line${user ? " user" : ""}"><div class="avatar ${user ? "avatar-orange" : "avatar-purple"}">${label}</div><div class="bubble">${escapeHtml(message.text)}<time>${escapeHtml(time)}</time></div></div>`;
    }).join("");
    $("#transcript").scrollTop = $("#transcript").scrollHeight;
    renderLeadQualification();
  }

  function renderLeadQualification() {
    const lead = getActiveLead();
    const rows = [
      ["Interest", lead && lead.interest],
      ["Budget", lead && lead.budget],
      ["Timeline", lead && lead.timeline]
    ];
    $("#qualification-list").innerHTML = rows.map(([label, value]) => `<div class="qualification-row"><span>${label}</span><b class="${value ? "found" : ""}">${escapeHtml(value || "Not identified")}</b></div>`).join("");
    $("#lead-status").textContent = lead ? lead.status : "New";
    $("#lead-status").className = `status-tag${lead && lead.status === "Qualified" ? " status-good" : ""}`;
    $("#lead-card-name").textContent = lead ? lead.name : "New prospect";
    $("#lead-card-company").textContent = lead ? `${lead.company} · ${lead.source}` : "Prospect · website inquiry";
    $("#lead-avatar").textContent = lead ? initials(lead.name) : "NP";
    $("#lead-email").value = lead ? lead.email : "";
  }

  const stopWords = new Set("a an and are as at be by can do for from how i in is it of on or the this to we what when where which who with you your does about me our they them their".split(" "));
  function words(text) {
    return String(text).toLowerCase().match(/[a-z0-9$]+/g)?.filter(word => word.length > 1 && !stopWords.has(word)) || [];
  }

  function retrieve(query, limit = 2) {
    const queryWords = [...new Set(words(query))];
    if (!queryWords.length) return [];
    return state.knowledge.map(source => {
      const contentWords = words(`${source.title} ${source.content}`);
      const contentSet = new Set(contentWords);
      const matched = queryWords.filter(word => contentSet.has(word));
      const score = matched.reduce((sum, word) => sum + (source.title.toLowerCase().includes(word) ? 2 : 1), 0);
      return { ...source, score, matched };
    }).filter(result => result.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  function renderKnowledgeAnswer(results) {
    const container = $("#knowledge-result");
    if (!results.length) {
      container.innerHTML = '<span class="empty-icon">⌕</span><p>No matching product facts yet. Add information in Knowledge base to improve retrieval.</p>';
      return;
    }
    const source = results[0];
    container.innerHTML = `<div class="knowledge-answer"><b>✦ ${escapeHtml(source.title)}</b>${escapeHtml(source.content)}</div>`;
  }

  function localize(english, locale) {
    const translations = {
      "es-ES": {
        "That makes sense. What is the main outcome you would like to improve?": "Tiene sentido. ¿Qué resultado principal le gustaría mejorar?",
        "Thanks for sharing that. What budget range have you set aside for a solution?": "Gracias por compartirlo. ¿Qué presupuesto tiene previsto para una solución?",
        "When are you hoping to get started?": "¿Cuándo espera empezar?",
        "I can help with that. Would a short product demo be useful as a next step?": "Puedo ayudarle con eso. ¿Le sería útil una breve demostración del producto como siguiente paso?",
        "I hear you. Could you tell me a little more about what has been frustrating?": "Lo entiendo. ¿Podría contarme un poco más sobre lo que le ha resultado frustrante?",
        "Thanks, that’s helpful context. What would a successful outcome look like for your team?": "Gracias, eso es un contexto útil. ¿Cómo sería un buen resultado para su equipo?",
        "I found a relevant product detail in our knowledge base.": "Encontré un dato relevante del producto en nuestra base de conocimiento."
      },
      "fr-FR": {
        "That makes sense. What is the main outcome you would like to improve?": "Je comprends. Quel est le principal résultat que vous souhaitez améliorer ?",
        "Thanks for sharing that. What budget range have you set aside for a solution?": "Merci pour ces précisions. Quel budget avez-vous prévu pour une solution ?",
        "When are you hoping to get started?": "Quand souhaitez-vous commencer ?",
        "I can help with that. Would a short product demo be useful as a next step?": "Je peux vous aider. Une courte démonstration du produit serait-elle utile pour la suite ?",
        "I hear you. Could you tell me a little more about what has been frustrating?": "Je comprends. Pourriez-vous m’en dire un peu plus sur ce qui vous déçoit ?",
        "Thanks, that’s helpful context. What would a successful outcome look like for your team?": "Merci, c’est utile. À quoi ressemblerait un résultat réussi pour votre équipe ?",
        "I found a relevant product detail in our knowledge base.": "J’ai trouvé une information pertinente dans notre base de connaissances."
      },
      "hi-IN": {
        "That makes sense. What is the main outcome you would like to improve?": "समझ गया। आप किस मुख्य परिणाम में सुधार करना चाहते हैं?",
        "Thanks for sharing that. What budget range have you set aside for a solution?": "यह जानकारी देने के लिए धन्यवाद। आपने समाधान के लिए कितना बजट रखा है?",
        "When are you hoping to get started?": "आप कब शुरू करना चाहते हैं?",
        "I can help with that. Would a short product demo be useful as a next step?": "मैं इसमें मदद कर सकता हूँ। क्या अगला कदम एक छोटा उत्पाद डेमो हो सकता है?",
        "I hear you. Could you tell me a little more about what has been frustrating?": "मैं समझता हूँ। क्या आप बता सकते हैं कि आपको किस बात से परेशानी हुई?",
        "Thanks, that’s helpful context. What would a successful outcome look like for your team?": "धन्यवाद, यह उपयोगी जानकारी है। आपकी टीम के लिए सफलता कैसी दिखेगी?",
        "I found a relevant product detail in our knowledge base.": "मुझे हमारी जानकारी में उत्पाद से जुड़ी एक बात मिली है।"
      }
    };
    return (translations[locale] && translations[locale][english]) || english;
  }

  function detectSentiment(text) {
    const lower = text.toLowerCase();
    const negative = ["frustrat", "problem", "angry", "bad", "expensive", "disappointed", "hate", "slow", "difficult", "not interested", "unhappy", "broken"];
    const positive = ["great", "love", "excited", "interested", "helpful", "excellent", "yes", "perfect", "looking forward", "sounds good"];
    if (negative.some(word => lower.includes(word))) return "Negative";
    if (positive.some(word => lower.includes(word))) return "Positive";
    return "Neutral";
  }

  function updateLeadFromMessage(text) {
    const lead = getActiveLead();
    if (!lead) return;
    const lower = text.toLowerCase();
    const sentiment = detectSentiment(text);
    if (sentiment !== "Neutral") lead.sentiment = sentiment;
    if (/\b(price|pricing|cost|plan|trial|subscription|budget|dollar|\$|€|£)\b/i.test(text)) lead.interest = "Pricing & plans";
    else if (/\b(crm|integrat|calendar|connect|security|api)\b/i.test(text)) lead.interest = "Integrations";
    else if (/\b(demo|product|platform|features|feature|assistant|sales)\b/i.test(text)) lead.interest = "AI sales platform";
    else if (text.trim().length > 18 && !lead.interest) lead.interest = "Sales conversations";
    const amount = text.match(/(?:\$|€|£)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|euros|per month|\/month)\b/i);
    if (amount) lead.budget = amount[0].trim();
    else if (/\b(budget|spend|invest)\b/i.test(text) && !lead.budget) lead.budget = "Discussed";
    if (/\b(this week|next week|this month|next month|asap|soon|immediately|quarter|month|week|today|tomorrow)\b/i.test(text)) lead.timeline = text.match(/\b(this week|next week|this month|next month|asap|soon|immediately|this quarter|next quarter|today|tomorrow)\b/i)?.[0] || "Discussed";
    if (!lead.timeline && /\b(ready|start|launch|looking to)\b/i.test(lower)) lead.timeline = "Considering a start";
    const signals = [lead.interest, lead.budget, lead.timeline].filter(Boolean).length;
    if (signals >= 2 || /\b(ready to buy|ready to sign|book a demo|schedule a demo)\b/i.test(text)) lead.status = "Qualified";
    else if (text.trim()) lead.status = "Contacted";
    lead.updatedAt = new Date().toISOString();
    persist();
  }

  function respondTo(text) {
    const lead = getActiveLead();
    if (!lead) return;
    updateLeadFromMessage(text);
    const lower = text.toLowerCase();
    const results = retrieve(text);
    renderKnowledgeAnswer(results);
    const locale = $("#language-select").value;
    let response;
    if (detectSentiment(text) === "Negative") {
      response = "I hear you. Could you tell me a little more about what has been frustrating?";
    } else if (results.length) {
      const source = results[0];
      response = `${localize("I found a relevant product detail in our knowledge base.", locale)} ${source.content} Would you like to explore that in a short conversation?`;
    } else if (!lead.interest) {
      response = "Thanks, that’s helpful context. What would a successful outcome look like for your team?";
    } else if (!lead.budget) {
      response = "Thanks for sharing that. What budget range have you set aside for a solution?";
    } else if (!lead.timeline) {
      response = "When are you hoping to get started?";
    } else if (/\b(book|schedule|appointment|meeting|demo)\b/i.test(lower)) {
      response = "I can help with that. Choose a date and time in the booking panel and I’ll save the appointment to your CRM.";
    } else if (/\b(price|pricing|cost|plan|trial|subscription|budget)\b/i.test(lower)) {
      response = "I can help with that. Would a short product demo be useful as a next step?";
    } else {
      response = "I can help with that. Would a short product demo be useful as a next step?";
    }
    addMessage("agent", localize(response, locale), true);
  }

  function addMessage(role, text, speak = false) {
    transcript.push({ role, text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
    renderConversation();
    if (speak && window.speechSynthesis && $("#voice-output").checked) speakText(text);
  }

  function speakText(text) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = $("#language-select").value;
    window.speechSynthesis.speak(utterance);
  }

  function handleUserMessage(text) {
    const normalized = text.trim();
    if (!normalized) return;
    if (!getActiveLead()) startCall();
    addMessage("prospect", normalized);
    respondTo(normalized);
  }

  function endCall() {
    const lead = getActiveLead();
    if (!lead) {
      showToast("There is no active conversation to end.", true);
      return;
    }
    const userMessages = transcript.filter(message => message.role === "prospect").map(message => message.text);
    const summary = userMessages.length
      ? `Discussed ${lead.interest || "sales needs"}${lead.budget ? `; budget ${lead.budget}` : ""}${lead.timeline ? `; timing ${lead.timeline}` : ""}. ${state.bookings.some(booking => booking.leadId === lead.id) ? "Appointment booked." : "Follow-up can be scheduled."}`
      : "Conversation ended before the prospect shared details.";
    const call = {
      id: `call-${Date.now()}`,
      leadId: lead.id,
      date: new Date().toISOString(),
      durationSeconds: activeCallStarted ? Math.max(1, Math.round((Date.now() - activeCallStarted) / 1000)) : 0,
      summary,
      outcome: state.bookings.some(booking => booking.leadId === lead.id) ? "Booked" : lead.status,
      sentiment: lead.sentiment || "Neutral"
    };
    state.calls.unshift(call);
    persist();
    activeLeadId = null;
    activeCallStarted = 0;
    transcript = [];
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    renderAll();
    showToast("Call summary saved to your local CRM.");
  }

  function saveLead() {
    const lead = getActiveLead();
    if (!lead) {
      showToast("Start a conversation before saving a lead.", true);
      return;
    }
    const email = $("#lead-email").value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("Enter a valid email address.", true);
      $("#lead-email").focus();
      return;
    }
    lead.email = email;
    lead.updatedAt = new Date().toISOString();
    persist();
    renderAll();
    showToast("Lead saved to your local CRM.");
  }

  function bookAppointment(event) {
    event.preventDefault();
    const lead = getActiveLead();
    if (!lead) {
      showToast("Start a conversation before booking an appointment.", true);
      return;
    }
    const date = $("#meeting-date").value;
    const time = $("#meeting-time").value;
    if (!date || !time || new Date(`${date}T${time}`) < new Date()) {
      showToast("Choose a date and time in the future.", true);
      return;
    }
    const booking = {
      id: `booking-${Date.now()}`,
      leadId: lead.id,
      date,
      time,
      type: $("#meeting-type").value,
      createdAt: new Date().toISOString()
    };
    state.bookings.unshift(booking);
    lead.status = "Qualified";
    lead.timeline = lead.timeline || `Meeting ${formatDate(`${date}T${time}`)}`;
    lead.updatedAt = new Date().toISOString();
    persist();
    const confirmation = `Your ${booking.type.toLowerCase()} is booked for ${formatDate(`${date}T${time}`, { weekday: "long", month: "long", day: "numeric" })} at ${time}. I’ve saved it to the local CRM.`;
    addMessage("agent", confirmation);
    renderAll();
    showToast("Appointment booked and saved to your local CRM.");
  }

  function renderDashboard() {
    const positiveCalls = state.calls.filter(call => call.sentiment === "Positive").length;
    const sentimentRate = state.calls.length ? `${Math.round(positiveCalls / state.calls.length * 100)}%` : "—";
    $("#stat-calls").textContent = state.calls.length;
    $("#stat-qualified").textContent = state.leads.filter(lead => lead.status === "Qualified").length;
    $("#stat-bookings").textContent = state.bookings.length;
    $("#stat-sentiment").textContent = sentimentRate;
    $("#nav-call-count").textContent = state.calls.length;
    const recent = $("#recent-calls");
    if (!state.calls.length) {
      recent.innerHTML = '<div class="empty-message">No calls yet. Start the demo workflow to see your first conversation here.</div>';
    } else {
      recent.innerHTML = state.calls.slice(0, 4).map(call => {
        const lead = state.leads.find(item => item.id === call.leadId);
        const label = call.outcome === "Booked" ? "Booked" : call.outcome;
        const tagClass = call.outcome === "Booked" || call.outcome === "Qualified" ? "status-good" : call.outcome === "Contacted" ? "status-warm" : "";
        return `<div class="recent-row"><div class="avatar avatar-purple">${initials(lead ? lead.name : "Lead")}</div><div class="recent-person"><b>${escapeHtml(lead ? lead.name : "Prospect")}</b><small>${escapeHtml(lead ? lead.company : "—")}</small></div><div class="recent-time">${formatDate(call.date)}</div><span class="status-tag ${tagClass}">${escapeHtml(label)}</span></div>`;
      }).join("");
    }
    const columns = ["New", "Contacted", "Qualified"];
    $("#pipeline").innerHTML = columns.map(status => {
      const leads = state.leads.filter(lead => lead.status === status);
      const examples = leads.slice(0, 2).map(lead => `<div class="pipeline-lead">${escapeHtml(lead.name)}${lead.interest ? ` · ${escapeHtml(lead.interest)}` : ""}</div>`).join("");
      return `<div class="pipeline-column"><header>${status}<span>${leads.length}</span></header>${examples || `<p>No ${status.toLowerCase()} leads yet</p>`}</div>`;
    }).join("");
  }

  function renderLeads() {
    const query = $("#lead-search").value.toLowerCase().trim();
    const filter = $("#lead-filter").value;
    const leads = state.leads.filter(lead => (filter === "all" || lead.status === filter) && `${lead.name} ${lead.company} ${lead.email} ${lead.interest}`.toLowerCase().includes(query));
    $("#lead-count").textContent = `${leads.length} ${leads.length === 1 ? "lead" : "leads"}`;
    $("#leads-empty").classList.toggle("hidden", leads.length > 0);
    $("#leads-table").innerHTML = leads.map(lead => {
      const tagClass = lead.status === "Qualified" ? "status-good" : lead.status === "Contacted" ? "status-warm" : "";
      return `<tr><td><div class="table-person"><div class="avatar avatar-purple">${initials(lead.name)}</div><div><b>${escapeHtml(lead.name)}</b><small>${escapeHtml(lead.email || "No email yet")}</small></div></div></td><td>${escapeHtml(lead.company || "—")}</td><td><span class="status-tag ${tagClass}">${escapeHtml(lead.status)}</span></td><td>${escapeHtml(lead.interest || "—")}</td><td>${formatDate(lead.updatedAt)}</td></tr>`;
    }).join("");
  }

  function renderKnowledge() {
    $("#source-count").textContent = `${state.knowledge.length} ${state.knowledge.length === 1 ? "source" : "sources"}`;
    $("#source-list").innerHTML = state.knowledge.map(source => `<div class="source-item"><div><b>${escapeHtml(source.title)}</b><p>${escapeHtml(source.content.slice(0, 130))}${source.content.length > 130 ? "…" : ""}</p></div><button class="delete-source" data-delete-source="${escapeHtml(source.id)}" aria-label="Delete ${escapeHtml(source.title)}">×</button></div>`).join("");
  }

  function renderInsights() {
    const total = state.calls.length;
    const qualifiedCalls = state.calls.filter(call => call.outcome === "Qualified" || call.outcome === "Booked").length;
    const positive = state.calls.filter(call => call.sentiment === "Positive").length;
    $("#insight-calls").textContent = total;
    $("#insight-rate").textContent = total ? `${Math.round(qualifiedCalls / total * 100)}%` : "0%";
    $("#insight-bookings").textContent = state.bookings.length;
    $("#insight-sentiment").textContent = total ? `${Math.round(positive / total * 100)}% positive` : "—";
    const booked = state.calls.filter(call => call.outcome === "Booked").length;
    const qualified = state.calls.filter(call => call.outcome === "Qualified").length;
    const contacted = state.calls.filter(call => call.outcome === "Contacted").length;
    const outcomes = [["Booked", booked], ["Qualified", qualified], ["Contacted", contacted], ["Other", Math.max(0, total - booked - qualified - contacted)]];
    $("#outcome-bars").innerHTML = outcomes.map(([name, count]) => `<div class="outcome-row"><span>${name}</span><div class="outcome-track"><div class="outcome-fill" style="width:${total ? Math.max(4, count / total * 100) : 0}%"></div></div><b>${count}</b></div>`).join("");
    const takeaways = total
      ? [
          `${state.bookings.length} appointment${state.bookings.length === 1 ? "" : "s"} booked from ${total} completed conversation${total === 1 ? "" : "s"}.`,
          `${qualifiedCalls} conversation${qualifiedCalls === 1 ? "" : "s"} ended with a qualified lead or booked meeting.`,
          `Most common captured interest: ${mostCommonInterest()}.`
        ]
      : ["Run a demo conversation to see booking and qualification outcomes.", "Share customer intent, budget or timing to populate lead signals.", "Use the knowledge base to ground product answers in approved facts."];
    $("#business-takeaways").innerHTML = takeaways.map(text => `<div class="takeaway"><span>✦</span><p>${escapeHtml(text)}</p></div>`).join("");
  }

  function mostCommonInterest() {
    const counts = {};
    state.leads.forEach(lead => { if (lead.interest) counts[lead.interest] = (counts[lead.interest] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "not enough data yet";
  }

  function renderSettings() {
    const synthesis = Boolean(window.speechSynthesis);
    $("#tts-support").textContent = synthesis ? "Available" : "Not supported";
    $("#tts-support").className = `status-tag ${synthesis ? "status-good" : ""}`;
  }

  async function checkSpeechService() {
    const status = $("#stt-support");
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error(`Local service returned ${response.status}.`);
      const health = await response.json();
      status.textContent = health.ready ? "Ready" : "Setup needed";
      status.className = `status-tag ${health.ready ? "status-good" : "status-warm"}`;
    } catch (error) {
      status.textContent = "Offline";
      status.className = "status-tag status-warm";
      console.warn("Local Whisper service is unavailable. Start it with `python server.py`.", error);
    }
  }

  function renderAll() {
    renderDashboard();
    renderLeads();
    renderKnowledge();
    renderInsights();
    renderSettings();
    if ($("#page-calls").classList.contains("active")) renderConversation();
  }

  function exportLeads() {
    const rows = [["Name", "Company", "Email", "Status", "Interest", "Budget", "Timeline", "Sentiment"]];
    state.leads.forEach(lead => rows.push([lead.name, lead.company, lead.email, lead.status, lead.interest, lead.budget, lead.timeline, lead.sentiment]));
    const csv = rows.map(row => row.map(cell => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "voxora-leads.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Lead list exported as CSV.");
  }

  function testRetrieval(event) {
    event.preventDefault();
    const query = $("#retrieval-query").value.trim();
    const results = retrieve(query, 3);
    $("#retrieval-results").innerHTML = results.length
      ? results.map(source => `<article class="result-source"><header><b>${escapeHtml(source.title)}</b><span>${source.score} keyword match${source.score === 1 ? "" : "es"}</span></header><p>${escapeHtml(source.content)}</p></article>`).join("")
      : '<div class="retrieval-empty"><span>⌕</span><p>No matching source found. Try different keywords or add a source.</p></div>';
  }

  function microphoneErrorMessage(error) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access is blocked. Allow microphone permission for this site, then try again.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found. Connect or enable a microphone, then try again.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "The microphone is busy or unavailable. Close other apps using it, then try again.";
    }
    return `Could not access the microphone: ${error.message || error.name}.`;
  }

  async function samplesToWav(samples, sourceRate) {
    const sampleCount = Math.floor(samples.length * 16000 / sourceRate);
    if (!sampleCount) throw new Error("The recording was empty.");
    let outputRate = sourceRate;
    if (sourceRate !== 16000 && (window.OfflineAudioContext || window.webkitOfflineAudioContext)) {
      const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const context = new OfflineContext(1, sampleCount, 16000);
      const buffer = context.createBuffer(1, samples.length, sourceRate);
      buffer.copyToChannel(samples, 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
      samples = (await context.startRendering()).getChannelData(0);
      outputRate = 16000;
    }
    const bytes = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(bytes);
    const writeString = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
    };
    writeString(0, "RIFF");
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, sampleCount * 2, true);
    const ratio = outputRate / 16000;
    for (let index = 0; index < sampleCount; index += 1) {
      const sourcePosition = index * ratio;
      const lower = Math.floor(sourcePosition);
      const upper = Math.min(lower + 1, samples.length - 1);
      const fraction = sourcePosition - lower;
      const sample = samples[lower] * (1 - fraction) + samples[upper] * fraction;
      const pcm = Math.max(-1, Math.min(1, sample));
      view.setInt16(44 + index * 2, pcm < 0 ? pcm * 32768 : pcm * 32767, true);
    }
    return new Blob([bytes], { type: "audio/wav" });
  }

  async function finishAudioRecording() {
    if (!audioRecording) return;
    audioRecording = false;
    window.clearTimeout(recordingTimer);
    if (audioProcessor) {
      audioProcessor.onaudioprocess = null;
      audioProcessor.disconnect();
      audioProcessor = null;
    }
    if (audioSource) {
      audioSource.disconnect();
      audioSource = null;
    }
    const sourceRate = audioContext.sampleRate;
    const samples = new Float32Array(audioSampleCount);
    let offset = 0;
    audioChunks.forEach(chunk => {
      samples.set(chunk, offset);
      offset += chunk.length;
    });
    audioChunks = [];
    audioSampleCount = 0;
    const contextToClose = audioContext;
    audioContext = null;
    stopAudioStream();
    $("#mic-button").classList.remove("listening");
    try {
      await contextToClose.close();
      if (!samples.length) throw new Error("No audio was recorded. Check your microphone and try again.");
      await transcribeRecording(await samplesToWav(samples, sourceRate));
    } catch (error) {
      console.error("Could not prepare the microphone recording.", error);
      $("#voice-status").textContent = error.message || "Could not prepare the recording. Try again or type your message.";
      showToast($("#voice-status").textContent, true);
    }
  }

  async function transcribeRecording(wav) {
    transcribingAudio = true;
    $("#mic-button").disabled = true;
    $("#mic-button").classList.add("processing");
    $("#voice-status").textContent = "Preparing your recording for local transcription…";
    try {
      $("#voice-status").textContent = "Transcribing on this computer. First use downloads the Whisper model (~150 MB).";
      let response;
      try {
        response = await fetch(`/api/transcribe?language=${encodeURIComponent($("#language-select").value)}`, {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: wav
        });
      } catch (error) {
        throw new Error("Could not reach the local Whisper service. Start it with `python server.py`, then reload this page.");
      }
      let result;
      try {
        result = await response.json();
      } catch (error) {
        if (!response.ok) throw new Error("The local transcription endpoint was not found. Start the app with `python server.py`.");
        throw error;
      }
      if (!response.ok) throw new Error(result.error || "Local transcription failed. Check the server terminal and try again.");
      const text = String(result.text || "").trim();
      if (!text) {
        $("#voice-status").textContent = "No speech was recognized. Try recording again or type your message.";
        return;
      }
      $("#message-input").value = text;
      handleUserMessage(text);
      $("#message-input").value = "";
      $("#voice-status").textContent = "Transcribed locally. Your audio was not sent to a speech provider.";
    } catch (error) {
      console.error("Local transcription failed.", error);
      $("#voice-status").textContent = error.message || "Local transcription failed. Type your message instead.";
      showToast($("#voice-status").textContent, true);
    } finally {
      transcribingAudio = false;
      $("#mic-button").disabled = false;
      $("#mic-button").classList.remove("processing");
      $("#mic-button").classList.remove("listening");
      $("#mic-button").title = "Start local speech recording";
      $("#mic-button").setAttribute("aria-label", "Start local speech recording");
    }
  }

  function stopAudioStream() {
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      audioStream = null;
    }
  }

  async function startListening() {
    if (transcribingAudio || audioStarting) return;
    if (audioRecording) {
      $("#voice-status").textContent = "Finishing recording…";
      finishAudioRecording();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !AudioContextClass) {
      const message = "Local microphone recording is not supported here. Open this app on localhost in a modern browser, or type your message.";
      $("#voice-status").textContent = message;
      showToast(message, true);
      return;
    }
    audioStarting = true;
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true } });
      audioContext = new AudioContextClass();
      await audioContext.resume();
      audioSource = audioContext.createMediaStreamSource(audioStream);
      audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      audioChunks = [];
      audioSampleCount = 0;
      audioProcessor.onaudioprocess = event => {
        const input = event.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(input.length);
        chunk.set(input);
        audioChunks.push(chunk);
        audioSampleCount += chunk.length;
        event.outputBuffer.getChannelData(0).fill(0);
      };
      audioSource.connect(audioProcessor);
      audioProcessor.connect(audioContext.destination);
      audioRecording = true;
      audioStarting = false;
      $("#mic-button").classList.add("listening");
      $("#mic-button").title = "Stop recording and transcribe";
      $("#mic-button").setAttribute("aria-label", "Stop recording and transcribe");
      $("#voice-status").textContent = "Recording locally… click the microphone again when you’re done (60-second limit).";
      recordingTimer = window.setTimeout(finishAudioRecording, 60_000);
    } catch (error) {
      audioStarting = false;
      audioRecording = false;
      if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
      }
      if (audioSource) {
        audioSource.disconnect();
        audioSource = null;
      }
      if (audioContext) {
        const contextToClose = audioContext;
        audioContext = null;
        contextToClose.close().catch(closeError => console.warn("Could not close the microphone audio context.", closeError));
      }
      stopAudioStream();
      $("#mic-button").classList.remove("listening");
      const message = microphoneErrorMessage(error);
      $("#voice-status").textContent = message;
      showToast(message, true);
    }
  }

  function initialize() {
    $("#today-label").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const today = new Date();
    $("#meeting-date").min = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $("#meeting-date").value = $("#meeting-date").min;
    renderAll();
    checkSpeechService();

    document.addEventListener("click", event => {
      const pageLink = event.target.closest("[data-page-link]");
      if (pageLink) {
        event.preventDefault();
        navigate(pageLink.dataset.pageLink);
      }
      if (event.target.closest("[data-start-call]")) startCall();
      const deleteButton = event.target.closest("[data-delete-source]");
      if (deleteButton) {
        state.knowledge = state.knowledge.filter(source => source.id !== deleteButton.dataset.deleteSource);
        persist();
        renderKnowledge();
        showToast("Knowledge source removed.");
      }
    });
    $("#message-form").addEventListener("submit", event => {
      event.preventDefault();
      const input = $("#message-input");
      handleUserMessage(input.value);
      input.value = "";
      input.focus();
    });
    $("#end-call").addEventListener("click", endCall);
    $("#mic-button").addEventListener("click", startListening);
    $("#save-lead").addEventListener("click", saveLead);
    $("#booking-form").addEventListener("submit", bookAppointment);
    $("#lead-search").addEventListener("input", renderLeads);
    $("#lead-filter").addEventListener("change", renderLeads);
    $("#export-leads").addEventListener("click", exportLeads);
    $("#retrieval-form").addEventListener("submit", testRetrieval);
    $("#knowledge-form").addEventListener("submit", event => {
      event.preventDefault();
      const title = $("#source-title").value.trim();
      const content = $("#source-content").value.trim();
      if (!title || !content) return;
      state.knowledge.unshift({ id: `kb-${Date.now()}`, title, content });
      persist();
      $("#knowledge-form").reset();
      renderKnowledge();
      showToast("Knowledge source added to the local retrieval index.");
    });
    $("#language-select").addEventListener("change", () => {
      $("#voice-status").textContent = `Conversation language set to ${$("#language-select").selectedOptions[0].text}.`;
    });
    $("#mobile-menu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
    $("#help-button").addEventListener("click", () => $("#about-dialog").showModal());
    $("#close-dialog").addEventListener("click", () => $("#about-dialog").close());
    $("#dialog-ok").addEventListener("click", () => $("#about-dialog").close());
    $("#clear-data").addEventListener("click", () => {
      if (!window.confirm("Clear all leads, calls, bookings and custom knowledge saved on this device?")) return;
      state = initialState();
      activeLeadId = null;
      transcript = [];
      persist();
      renderAll();
      showToast("Local demo data cleared.");
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") $(".sidebar").classList.remove("open");
    });
  }

  initialize();
})();
