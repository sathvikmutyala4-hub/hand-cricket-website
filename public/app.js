(() => {
  const socket = io();
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const homeModes = $("#homeModes"), setupPanel = $("#setupPanel"), roomPanel = $("#roomPanel"), tournamentPanel = $("#tournamentPanel");
  const setupContent = $("#setupContent"), roomContent = $("#roomContent"), tournamentContent = $("#tournamentContent");
  let currentMode = null, roomCode = null, currentRoom = null, mySocketId = null, selectedFormat = "custom", selectedOvers = 2;
  let localTournaments = JSON.parse(localStorage.getItem("hc_tournaments") || "[]");
  let activeTournament = null;

  socket.on("connect", () => { mySocketId = socket.id; });
  socket.on("room:update", room => {
    if (roomCode && room.code === roomCode) {
      currentRoom = room;
      renderRoom(room);
    }
  });
  socket.on("connect_error", () => toast("Could not connect to the game server. Refresh and try again."));
  function toast(message) {
    const old = $(".toast"); if (old) old.remove();
    const node = document.createElement("div"); node.className = "toast"; node.textContent = message; document.body.appendChild(node);
    setTimeout(() => node.remove(), 2800);
  }
  function showSection(section) {
    [homeModes, setupPanel, roomPanel, tournamentPanel, $("#howItWorks")].forEach(el => el.classList.add("hidden"));
    section.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function showHome() {
    currentMode = null;
    showSection(homeModes);
    $("#howItWorks").classList.remove("hidden");
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function formatName(format) { return ({ custom: "Custom overs", t20: "T20", odi: "ODI", test: "Test" })[format] || "Custom overs"; }
  function defaultOvers(format) { return format === "t20" ? 20 : format === "odi" ? 50 : format === "test" ? 0 : 2; }
  function formatFields(prefix = "match") {
    return `<div class="field full-field"><label>Match format</label><div class="segmented format-picker" role="group" aria-label="Match format">
      <button type="button" data-format="custom" class="${selectedFormat==="custom"?"active":""}">Custom overs</button>
      <button type="button" data-format="t20" class="${selectedFormat==="t20"?"active":""}">T20</button>
      <button type="button" data-format="odi" class="${selectedFormat==="odi"?"active":""}">ODI</button>
      <button type="button" data-format="test" class="${selectedFormat==="test"?"active":""}">Test</button>
    </div></div>
    <div class="field full-field ${selectedFormat==="custom"?"":"hidden"}" id="${prefix}OversField"><label for="${prefix}Overs">Overs per innings</label><input id="${prefix}Overs" type="number" min="1" max="50" value="${selectedOvers || 2}"></div>
    <p class="small-note full-field" id="${prefix}FormatNote">${selectedFormat==="test"?"Test format: two innings per team, up to five days. This starter uses a simplified session-based scorecard; full declaration/follow-on rules are not implemented yet.":selectedFormat==="custom"?"Choose any number from 1 to 50 overs.":`${formatName(selectedFormat)} format selected.`}</p>`;
  }
  function bindFormatPicker(prefix = "match") {
    $$(".format-picker button", setupContent).forEach(btn => btn.addEventListener("click", () => {
      selectedFormat = btn.dataset.format;
      const oversInput = $(`#${prefix}Overs`, setupContent);
      if (oversInput) selectedOvers = Number(oversInput.value) || selectedOvers;
      setupContent.innerHTML = currentMode === "quick" ? quickSetupMarkup() : customSetupMarkup();
      bindFormatPicker(prefix);
      bindSetupActions();
    }));
    const input = $(`#${prefix}Overs`, setupContent);
    if (input) input.addEventListener("input", () => selectedOvers = Math.max(1, Math.min(50, Number(input.value) || 1)));
  }
  function quickSetupMarkup() {
    return `<div class="panel"><span class="eyebrow">QUICK PLAY / PRIVATE ROOM</span><h2>Ready when you are.</h2><p class="subcopy">Create a room and send the code to a friend. No player names, no fuss.</p>
      <div class="form-grid">${formatFields("quick")}</div>
      <div class="form-actions"><button class="primary-button" id="createRoom">Create room <span>↗</span></button></div>
      <div class="divider">OR JOIN A FRIEND</div><div class="form-grid"><div class="field full-field"><label for="joinCode">Room code</label><input class="code-input" id="joinCode" maxlength="6" placeholder="e.g. A1B2C3" autocomplete="off"></div></div>
      <div class="form-actions"><button class="secondary-button" id="joinRoom">Join room <span>→</span></button></div><div id="setupError" class="error-message" aria-live="polite"></div></div>`;
  }
  function customSetupMarkup() {
    return `<div class="panel"><span class="eyebrow">CUSTOM MATCH / PRIVATE ROOM</span><h2>Make it personal.</h2><p class="subcopy">Name the players, choose your format, and invite your opponent.</p>
      <div class="form-grid"><div class="field"><label for="hostName">Your player name</label><input id="hostName" maxlength="24" placeholder="e.g. Sathvik"></div><div class="field"><label for="opponentName">Opponent name (optional)</label><input id="opponentName" maxlength="24" placeholder="Set by opponent when joining"></div>${formatFields("custom")}</div>
      <p class="small-note">The room creator's name is shown to both players. Your opponent enters their own name when joining.</p>
      <div class="form-actions"><button class="primary-button" id="createRoom">Create custom room <span>↗</span></button></div>
      <div class="divider">OR JOIN A FRIEND</div><div class="form-grid"><div class="field"><label for="joinName">Your player name</label><input id="joinName" maxlength="24" placeholder="e.g. Avinash"></div><div class="field"><label for="joinCode">Room code</label><input id="joinCode" maxlength="6" placeholder="e.g. A1B2C3" autocomplete="off"></div></div>
      <div class="form-actions"><button class="secondary-button" id="joinRoom">Join custom room <span>→</span></button></div><div id="setupError" class="error-message" aria-live="polite"></div></div>`;
  }
  function bindSetupActions() {
    const create = $("#createRoom", setupContent);
    if (create) create.addEventListener("click", () => {
      const format = selectedFormat;
      const overs = format === "custom" ? Math.max(1, Math.min(50, Number($(`#${currentMode}Overs`, setupContent)?.value) || 2)) : (format === "test" ? 20 : defaultOvers(format));
      const name = currentMode === "custom" ? ($("#hostName", setupContent)?.value || "").trim() : "";
      if (currentMode === "custom" && !name) return showError("Enter your player name to create a custom room.");
      socket.emit("room:create", { mode: currentMode, format, overs, name }, result => {
        if (!result?.ok) return showError(result?.error || "Could not create room.");
        roomCode = result.code; currentRoom = result.room; showSection(roomPanel); renderRoom(result.room);
      });
    });
    const join = $("#joinRoom", setupContent);
    if (join) join.addEventListener("click", () => {
      const code = ($("#joinCode", setupContent)?.value || "").trim().toUpperCase();
      const name = currentMode === "custom" ? ($("#joinName", setupContent)?.value || "").trim() : "";
      if (!code) return showError("Enter a room code.");
      if (currentMode === "custom" && !name) return showError("Enter your player name to join a custom room.");
      socket.emit("room:join", { code, name }, result => {
        if (!result?.ok) return showError(result?.error || "Could not join room.");
        roomCode = result.code; currentRoom = result.room; showSection(roomPanel); renderRoom(result.room);
      });
    });
  }
  function showError(msg) { const el = $("#setupError"); if (el) el.textContent = msg; else toast(msg); }
  function openMode(mode) {
    currentMode = mode; selectedFormat = "custom"; selectedOvers = 2;
    if (mode === "tournament") { renderTournamentSetup(); showSection(tournamentPanel); return; }
    $("#setupEyebrow").textContent = mode === "quick" ? "QUICK PLAY / SETUP" : "CUSTOM MATCH / SETUP";
    setupContent.innerHTML = mode === "quick" ? quickSetupMarkup() : customSetupMarkup();
    showSection(setupPanel); bindFormatPicker(mode); bindSetupActions();
  }
  $$("[data-mode]").forEach(btn => btn.addEventListener("click", () => openMode(btn.dataset.mode)));
  $("#backHome").addEventListener("click", showHome);
  $("#roomBack").addEventListener("click", showHome);
  $("#tournamentBack").addEventListener("click", showHome);
  $("#brandHome").addEventListener("click", e => { e.preventDefault(); showHome(); });
  function renderRoom(room) {
    roomContent.innerHTML = "";
    const me = room.players.findIndex(p => p.id === mySocketId);
    const isCreator = me === 0;
    const playing = room.game && ["playing","finished","paused"].includes(room.game.status);
    const wrapper = document.createElement("div");
    wrapper.className = "panel wide";
    if (!playing) {
      wrapper.innerHTML = `<span class="eyebrow">PRIVATE ROOM · ${escapeHtml(room.mode === "quick" ? "QUICK PLAY" : "CUSTOM MATCH")}</span><h2>Invite your rival.</h2><p class="subcopy">Share this room code. The second player can join from any device with the website open.</p>
        <div class="room-code">${escapeHtml(room.code)}</div><div class="copy-row"><input class="code-input" id="roomCodeCopy" readonly value="${escapeHtml(room.code)}"><button class="compact-button" id="copyRoomCode">Copy code</button></div>
        <div class="player-slots">${room.players.map((p,i)=>`<div class="player-slot"><span>${i===0?"HOST":"CHALLENGER"}</span><strong>${escapeHtml(p.name)}</strong></div>`).join("")}${room.players.length<2?'<div class="player-slot"><span>CHALLENGER</span><strong>Waiting to join…</strong></div>':""}</div>
        <div class="match-meta"><span>${escapeHtml(formatName(room.format))}</span><span>${room.format==="test"?"Up to 5 days":`${room.overs} overs / innings`}</span><span>${room.mode==="quick"?"Single wicket":"Named players"}</span></div>
        <div class="waiting-state">${room.players.length<2?"Waiting for your friend to join the room.":"Both players are here. Ready to play."}</div>
        ${isCreator?'<div class="form-actions"><button class="primary-button" id="startMatch" '+(room.players.length<2?"disabled":"")+'>Start match <span>↗</span></button></div>':'<p class="small-note">The room host will start the match when both players are ready.</p>'}`;
      roomContent.appendChild(wrapper);
      $("#copyRoomCode", wrapper)?.addEventListener("click", async () => {
        const input = $("#roomCodeCopy", wrapper); input.select();
        try { await navigator.clipboard.writeText(room.code); toast("Room code copied."); } catch { toast("Select and copy the room code."); }
      });
      $("#startMatch", wrapper)?.addEventListener("click", () => socket.emit("match:start", {}, result => { if (!result?.ok) toast(result?.error || "Could not start."); }));
      return;
    }
    const g = room.game;
    const names = room.players.map(p => p.name);
    const batterIndex = g.battingIndex;
    const isBatter = me === batterIndex;
    const myChoiceLocked = g.choicesLocked > 0; // Used only as a general hint; own lock tracked below.
    const myLocked = Array.isArray(g.choicesSubmitted) && g.choicesSubmitted[me];
    const scoreCards = names.map((name,i)=>`<div class="score-card ${i===batterIndex?"active-batting":""}"><span class="score-label">${i===batterIndex?"BATTING":"BOWLING"} · ${escapeHtml(name)}</span><div class="score">${g.scores[i]} <small>/ ${g.wickets[i]} wkts</small></div><div class="match-meta"><span>${Math.floor(g.balls[i]/6)}.${g.balls[i]%6} overs</span></div></div>`).join("");
    let gameHtml = `<span class="eyebrow">${escapeHtml(formatName(room.format).toUpperCase())} · INNINGS ${g.innings} OF 2</span><h2>${g.innings===1?"First innings":"Chase the target"}</h2><p class="subcopy">${g.innings===2?`Target: ${g.target} runs.`:"Make your start count."}</p>
      <div class="scoreboard">${scoreCards}</div><div class="match-meta"><span>${room.format==="test"?"Test mode · simplified innings clock":`${room.overs} overs per innings`}</span><span>${room.mode==="quick"?"Single wicket":"This starter uses one active batter per player"}</span></div>`;
    if (g.status === "finished" || room.status === "finished") {
      gameHtml += `<div class="result-banner"><h3>${escapeHtml(g.result || "Match complete")}</h3><p>Final score: ${escapeHtml(names[0])} ${g.scores[0]} · ${escapeHtml(names[1])} ${g.scores[1]}</p></div>
        <div class="form-actions">${isCreator?'<button class="primary-button" id="rematch">Play rematch <span>↗</span></button>':""}<button class="secondary-button" id="leaveMatch">Back to home</button></div>`;
    } else if (g.status === "paused" || room.status === "paused") {
      gameHtml += `<div class="result-banner"><h3>Match paused</h3><p>${escapeHtml(g.result || "A player disconnected.")}</p></div><button class="secondary-button" id="leaveMatch">Back to home</button>`;
    } else {
      gameHtml += `<p class="game-prompt">${isBatter?"You're batting — choose 0 to 6":"You're bowling — choose 1 to 6"}</p>
        <div class="number-grid ${isBatter?"":"bowler-grid"}">${(isBatter?[0,1,2,3,4,5,6]:[1,2,3,4,5,6]).map(n=>`<button type="button" class="number-button" data-choice="${n}" ${(g.choicesLocked===2 || myLocked)?"disabled":""}>${n}</button>`).join("")}</div>
        <div class="game-status" aria-live="polite">${g.choicesLocked===2?"Revealing result…":g.choicesLocked===1?"One player has locked a choice. Waiting for the other player…":"Choose your number. Your choice stays hidden until both players have picked."}</div>
        ${g.lastBall?`<div class="last-ball ${g.lastBall.wicket?"wicket":""}">${escapeHtml(g.lastBall.message)}</div>`:""}
        <p class="small-note">Your selection is hidden until both players have locked in. Matching numbers mean OUT. A batter's 0 is always safe and scores zero.</p>`;
    }
    wrapper.innerHTML = gameHtml;
    roomContent.appendChild(wrapper);
    $$("[data-choice]", wrapper).forEach(btn => btn.addEventListener("click", () => {
      $$("[data-choice]", wrapper).forEach(b => b.disabled = true);
      btn.classList.add("selected");
      $(".game-status", wrapper).textContent = "Choice locked. Waiting for the other player…";
      socket.emit("match:pick", { choice: Number(btn.dataset.choice) }, result => {
        if (!result?.ok) toast(result?.error || "Choice could not be submitted.");
      });
    }));
    $("#rematch", wrapper)?.addEventListener("click", () => socket.emit("match:rematch", {}, result => { if (!result?.ok) toast(result?.error || "Could not start rematch."); }));
    $("#leaveMatch", wrapper)?.addEventListener("click", () => { roomCode = null; currentRoom = null; showHome(); });
  }

  // Tournament builder: saved locally in this browser. Online fixtures can be played as rooms in a later server-backed tournament phase.
  function renderTournamentSetup() {
    tournamentContent.innerHTML = `<div class="panel wide"><span class="eyebrow">TOURNAMENT BUILDER</span><h2>Set up your competition.</h2><p class="subcopy">Add as many teams as you need, name the players, and generate fixtures. Your tournament is saved in this browser.</p>
      <div class="form-grid"><div class="field"><label for="tournamentName">Tournament name</label><input id="tournamentName" maxlength="50" placeholder="e.g. AU Hand Cricket Cup"></div><div class="field"><label for="teamCount">Number of teams</label><input id="teamCount" type="number" min="2" max="32" value="4"></div><div class="field"><label for="playersPerTeam">Players per team</label><input id="playersPerTeam" type="number" min="1" max="15" value="5"></div><div class="field"><label for="tournamentFormat">Tournament type</label><select id="tournamentFormat"><option value="knockout">Knockout</option><option value="league">League</option><option value="league-knockout">League + Knockout (fixture planning)</option></select></div><div class="field full-field"><label>Match format</label><div class="segmented tournament-format-picker"><button type="button" data-format="custom" class="active">Custom overs</button><button type="button" data-format="t20">T20</button><button type="button" data-format="odi">ODI</button><button type="button" data-format="test">Test</button></div></div><div class="field" id="tOversField"><label for="tOvers">Overs per innings</label><input id="tOvers" type="number" min="1" max="50" value="5"></div></div>
      <div class="form-actions"><button class="primary-button" id="buildTeams">Add teams & players <span>→</span></button></div><div id="tournamentError" class="error-message" aria-live="polite"></div>
      <div id="teamEditors"></div><div id="tournamentActions" class="form-actions hidden"><button class="primary-button" id="saveTournament">Save & generate fixtures <span>↗</span></button></div>
      <div id="savedTournaments"></div></div>`;
    let tFormat = "custom";
    $$(".tournament-format-picker button", tournamentContent).forEach(btn => btn.addEventListener("click", () => {
      tFormat = btn.dataset.format;
      $$(".tournament-format-picker button", tournamentContent).forEach(b=>b.classList.toggle("active",b===btn));
      $("#tOversField", tournamentContent).classList.toggle("hidden", tFormat !== "custom");
    }));
    $("#buildTeams", tournamentContent).addEventListener("click", () => {
      const count = Number($("#teamCount", tournamentContent).value), players = Number($("#playersPerTeam", tournamentContent).value);
      if (!Number.isInteger(count) || count < 2 || count > 32) return tournamentError("Choose between 2 and 32 teams.");
      if (!Number.isInteger(players) || players < 1 || players > 15) return tournamentError("Choose between 1 and 15 players per team.");
      const editors = $("#teamEditors", tournamentContent); editors.innerHTML = "";
      for (let i=0;i<count;i++) {
        const card = document.createElement("div"); card.className="team-editor";
        card.innerHTML = `<div class="team-editor-head"><span class="tag">TEAM ${i+1}</span><input class="code-input team-name" maxlength="35" aria-label="Team ${i+1} name" placeholder="Team ${i+1} name" value="Team ${i+1}"></div><div class="roster-list">${Array.from({length:players},(_,j)=>`<div class="roster-row"><input class="code-input player-name" maxlength="24" aria-label="Team ${i+1} player ${j+1}" placeholder="Player ${j+1}"></div>`).join("")}</div>`;
        editors.appendChild(card);
      }
      $("#tournamentActions", tournamentContent).classList.remove("hidden");
      $("#saveTournament", tournamentContent).onclick = () => {
        const teamCards = $$(".team-editor", editors);
        const teams = teamCards.map(card=>({ name: $(".team-name",card).value.trim() || "Unnamed team", players: $$(".player-name",card).map((input,i)=>input.value.trim() || `Player ${i+1}`), played:0,wins:0,losses:0,points:0,runsFor:0,runsAgainst:0 }));
        const overs = tFormat === "custom" ? Number($("#tOvers", tournamentContent).value) : defaultOvers(tFormat);
        if (tFormat === "custom" && (!Number.isInteger(overs)||overs<1||overs>50)) return tournamentError("Overs must be between 1 and 50.");
        const tournament = { id: Date.now().toString(36), name: $("#tournamentName",tournamentContent).value.trim() || "My Hand Cricket Tournament", teams, type: $("#tournamentFormat",tournamentContent).value, format:tFormat, overs: overs || 20, createdAt:new Date().toISOString(), fixtures:[] };
        tournament.fixtures = generateFixtures(tournament);
        localTournaments.unshift(tournament); localStorage.setItem("hc_tournaments",JSON.stringify(localTournaments));
        activeTournament = tournament; renderTournamentDesk(tournament);
      };
    });
    renderSavedTournaments();
  }
  function tournamentError(msg) { const el=$("#tournamentError",tournamentContent); if(el)el.textContent=msg; }
  function generateFixtures(t) {
    const teams=t.teams, fixtures=[];
    if(t.type==="league") {
      for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++)fixtures.push({a:i,b:j,stage:"League",status:"Scheduled",winner:null,score:null});
    } else if(t.type==="league-knockout") {
      for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++)fixtures.push({a:i,b:j,stage:"League",status:"Scheduled",winner:null,score:null});
      fixtures.push({a:null,b:null,stage:"Final · after league",status:"Planned",winner:null,score:null});
    } else {
      let round=teams.map((_,i)=>i), stage=1;
      while(round.length>1) {
        const next=[];
        for(let i=0;i<round.length;i+=2) {
          if(i+1<round.length){fixtures.push({a:round[i],b:round[i+1],stage:stage===1?"Round 1":`Round ${stage}`,status:"Scheduled",winner:null,score:null});next.push(null);}
          else {fixtures.push({a:round[i],b:null,stage:stage===1?"Round 1":`Round ${stage}`,status:"Bye",winner:round[i],score:null});next.push(round[i]);}
        }
        // Fixture planning is kept simple; winners are entered by organizer in a later iteration.
        if(next.length===round.length) break;
        round=next.map((v,i)=>v===null?i:v); stage++;
        if(stage>6)break;
      }
    }
    return fixtures;
  }
  function renderSavedTournaments() {
    const el=$("#savedTournaments",tournamentContent); if(!el)return;
    if(!localTournaments.length){el.innerHTML="";return;}
    el.innerHTML=`<div class="divider">SAVED IN THIS BROWSER</div><div class="fixture-list">${localTournaments.map(t=>`<div class="fixture"><div><strong>${escapeHtml(t.name)}</strong><small>${t.teams.length} teams · ${escapeHtml(formatName(t.format))} · ${new Date(t.createdAt).toLocaleDateString()}</small></div><button class="compact-button" data-open-tournament="${t.id}">Open</button></div>`).join("")}</div>`;
    $$("[data-open-tournament]",el).forEach(btn=>btn.addEventListener("click",()=>{const t=localTournaments.find(x=>x.id===btn.dataset.openTournament);if(t)renderTournamentDesk(t);}));
  }
  function renderTournamentDesk(t) {
    activeTournament=t;
    showSection(tournamentPanel);
    const standings=[...t.teams].sort((a,b)=>b.points-a.points||b.runsFor-a.runsFor);
    tournamentContent.innerHTML=`<div class="panel wide"><span class="eyebrow">TOURNAMENT DASHBOARD</span><h2>${escapeHtml(t.name)}</h2><p class="subcopy">${t.teams.length} teams · ${escapeHtml(formatName(t.format))} · ${t.format==="test"?"Up to five days":`${t.overs} overs per innings`}</p>
      <div class="match-meta"><span>${escapeHtml(t.type.replaceAll("-"," ").toUpperCase())}</span><span>${t.fixtures.length} planned fixtures</span><span>Saved on this device</span></div>
      <h3>Team standings</h3><div style="overflow-x:auto"><table class="stats-table"><thead><tr><th>Team</th><th>Played</th><th>W</th><th>L</th><th>Pts</th></tr></thead><tbody>${standings.map(team=>`<tr><td>${escapeHtml(team.name)}</td><td>${team.played}</td><td>${team.wins}</td><td>${team.losses}</td><td>${team.points}</td></tr>`).join("")}</tbody></table></div>
      <h3>Fixtures</h3><div class="fixture-list">${t.fixtures.map((f,i)=>`<div class="fixture"><div><strong>${f.a==null?"TBD":escapeHtml(t.teams[f.a]?.name||"TBD")} <span style="color:var(--muted)">vs</span> ${f.b==null?"TBD":escapeHtml(t.teams[f.b]?.name||"TBD")}</strong><small>${escapeHtml(f.stage)} · ${escapeHtml(f.status)}</small></div><span class="fixture-result">${f.status==="Bye"?"BYE":f.score?escapeHtml(f.score):"Not played"}</span></div>`).join("")}</div>
      <h3>Squads</h3><div class="fixture-list">${t.teams.map(team=>`<div class="fixture"><div><strong>${escapeHtml(team.name)}</strong><small>${team.players.map(escapeHtml).join(" · ")}</small></div><span class="tag">${team.players.length} PLAYERS</span></div>`).join("")}</div>
      <p class="small-note">This initial version saves tournament setup and fixture planning in this browser. Automatic online tournament fixtures, multi-player batting rotations, persistent cross-device scorecards, and full Test match rules are the next development phase.</p>
      <div class="form-actions"><button class="secondary-button" id="tournamentList">Back to tournaments</button><button class="secondary-button" id="deleteTournament">Delete tournament</button></div></div>`;
    $("#tournamentList",tournamentContent).addEventListener("click",renderTournamentSetup);
    $("#deleteTournament",tournamentContent).addEventListener("click",()=>{localTournaments=localTournaments.filter(x=>x.id!==t.id);localStorage.setItem("hc_tournaments",JSON.stringify(localTournaments));renderTournamentSetup();toast("Tournament deleted from this browser.");});
  }

  $("#rulesButton").addEventListener("click",()=>$("#rulesDialog").showModal());
  $("#footerRules").addEventListener("click",()=>$("#rulesDialog").showModal());
  $("#closeRules").addEventListener("click",()=>$("#rulesDialog").close());
})();